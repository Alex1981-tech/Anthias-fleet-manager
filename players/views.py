import logging
from datetime import timedelta

from django.db import IntegrityError
from django.http import HttpResponse, StreamingHttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from deploy.models import MediaFile
from .models import Group, PlaybackLog, Player, PlayerSnapshot
from .serializers import GroupSerializer, PlaybackLogSerializer, PlayerListSerializer, PlayerSerializer, PlayerSnapshotSerializer
from .services import AnthiasAPIClient, PlayerConnectionError

logger = logging.getLogger(__name__)


def _format_player_error(exc):
    """Extract a human-readable error from PlayerConnectionError.

    DRF validation errors come as dicts like:
        {"field": ["msg1", "msg2"], "non_field_errors": ["msg3"]}
    Player custom errors come as:
        {"error": "some message"}
    """
    data = exc.response_data
    if not data:
        return str(exc), status.HTTP_502_BAD_GATEWAY

    # Player-side HTTP status → forward as-is for 4xx
    http_status = status.HTTP_502_BAD_GATEWAY
    if exc.status_code and 400 <= exc.status_code < 500:
        http_status = exc.status_code

    # {"error": "..."} format
    if isinstance(data, dict) and 'error' in data:
        return data['error'], http_status

    # {"detail": "..."} format (DRF generic)
    if isinstance(data, dict) and 'detail' in data:
        return data['detail'], http_status

    # DRF serializer validation: {"field": ["msg", ...], ...}
    if isinstance(data, dict):
        messages = []
        for field, errors in data.items():
            if isinstance(errors, list):
                for msg in errors:
                    if field == 'non_field_errors':
                        messages.append(str(msg))
                    else:
                        messages.append(f'{field}: {msg}')
            else:
                messages.append(f'{field}: {errors}')
        if messages:
            return '; '.join(messages), http_status

    return str(exc), http_status


def _safe_int(value, default, field_name='value'):
    """Parse an int from request data, returning default on None or raising 400 on bad input."""
    if value is None:
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        from rest_framework.exceptions import ValidationError
        raise ValidationError({field_name: f'Must be an integer, got: {value!r}'})


def _update_player_status(player, online, info=None):
    """Update player online status and last_status."""
    player.is_online = online
    player.last_seen = timezone.now() if online else player.last_seen
    if info:
        player.last_status = info
    player.save(update_fields=['is_online', 'last_seen', 'last_status'])


class GroupViewSet(viewsets.ModelViewSet):
    """ViewSet for managing player groups."""
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    pagination_class = None


class PlayerViewSet(viewsets.ModelViewSet):
    """ViewSet for managing Anthias players."""
    queryset = Player.objects.select_related('group').all()
    serializer_class = PlayerSerializer
    pagination_class = None

    def get_serializer_class(self):
        if self.action == 'list':
            return PlayerListSerializer
        return PlayerSerializer

    def _get_client(self, player):
        """Create an AnthiasAPIClient for the given player."""
        return AnthiasAPIClient(player)

    def perform_create(self, serializer):
        """After creating a player, try to connect and update status."""
        player = serializer.save()
        client = self._get_client(player)
        try:
            info = client.get_info()
            _update_player_status(player, True, info)
        except Exception:
            _update_player_status(player, False)

    @action(detail=True, methods=['post'], url_path='test-connection')
    def test_connection(self, request, pk=None):
        """Test connectivity to a player by calling its /v2/info endpoint."""
        player = self.get_object()
        client = self._get_client(player)
        try:
            info = client.get_info()
            _update_player_status(player, True, info)
            return Response({
                'success': True,
                'message': f'Successfully connected to {player.name}.',
                'info': info,
            })
        except PlayerConnectionError as exc:
            _update_player_status(player, False)
            return Response({
                'success': False,
                'message': str(exc),
            }, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            _update_player_status(player, False)
            logger.exception('Unexpected error testing connection to %s', player.name)
            return Response({
                'success': False,
                'message': f'Unexpected error: {exc}',
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'])
    def info(self, request, pk=None):
        """Proxy to the player's /v2/info endpoint."""
        player = self.get_object()
        client = self._get_client(player)
        try:
            data = client.get_info()
            _update_player_status(player, True, data)
            return Response(data)
        except PlayerConnectionError as exc:
            _update_player_status(player, False)
            return Response(
                {'error': str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    @action(detail=True, methods=['get'])
    def assets(self, request, pk=None):
        """Proxy to the player's /v2/assets endpoint."""
        player = self.get_object()
        client = self._get_client(player)
        try:
            data = client.get_assets()
            return Response(data)
        except PlayerConnectionError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    @action(detail=True, methods=['get', 'patch'], url_path='device-settings')
    def device_settings(self, request, pk=None):
        """Proxy to the player's /v2/device_settings endpoint."""
        player = self.get_object()
        client = self._get_client(player)
        try:
            if request.method == 'PATCH':
                data = client.update_device_settings(request.data)
            else:
                data = client.get_device_settings()
            return Response(data)
        except PlayerConnectionError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    @action(detail=True, methods=['post'])
    def reboot(self, request, pk=None):
        """Proxy to the player's /v2/reboot endpoint."""
        player = self.get_object()
        client = self._get_client(player)
        try:
            client.reboot()
            return Response({
                'success': True,
                'message': f'Reboot command sent to {player.name}.',
            })
        except PlayerConnectionError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    @action(detail=True, methods=['post'])
    def shutdown(self, request, pk=None):
        """Proxy to the player's /v2/shutdown endpoint."""
        player = self.get_object()
        client = self._get_client(player)
        try:
            client.shutdown()
            return Response({
                'success': True,
                'message': f'Shutdown command sent to {player.name}.',
            })
        except PlayerConnectionError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Get historical snapshots for a player."""
        player = self.get_object()
        limit = _safe_int(request.query_params.get('limit'), 100, 'limit')
        snapshots = player.snapshots.all()[:limit]
        serializer = PlayerSnapshotSerializer(snapshots, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def screenshot(self, request, pk=None):
        """Proxy to the player's /v2/screenshot endpoint. Returns PNG image."""
        player = self.get_object()
        client = self._get_client(player)
        try:
            image_data = client.get_screenshot()
            return HttpResponse(
                image_data,
                content_type='image/png',
            )
        except PlayerConnectionError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as exc:
            logger.exception('Error getting screenshot from %s', player.name)
            return Response(
                {'error': f'Screenshot failed: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


    @action(detail=True, methods=['post'], url_path='playback-control')
    def playback_control(self, request, pk=None):
        """Control playback on the player (next/previous)."""
        player = self.get_object()
        client = self._get_client(player)
        command = request.data.get('command')
        if command not in ('next', 'previous'):
            return Response(
                {'error': 'command must be "next" or "previous"'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            client.control_asset(command)
            return Response({'success': True, 'command': command})
        except PlayerConnectionError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    @action(detail=True, methods=['post'])
    def backup(self, request, pk=None):
        """Proxy to the player's /v2/backup endpoint."""
        player = self.get_object()
        client = self._get_client(player)
        try:
            data = client.create_backup()
            return Response({
                'success': True,
                'message': f'Backup created for {player.name}.',
                'data': data,
            })
        except PlayerConnectionError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    @action(detail=True, methods=['patch'], url_path='asset-update')
    def asset_update(self, request, pk=None):
        """Update an asset on the player."""
        player = self.get_object()
        client = self._get_client(player)
        asset_id = request.data.get('asset_id')
        if not asset_id:
            return Response(
                {'error': 'asset_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        update_fields = {}
        for field in ('name', 'start_date', 'end_date'):
            if field in request.data:
                update_fields[field] = request.data[field]
        if 'duration' in request.data:
            update_fields['duration'] = _safe_int(request.data['duration'], 0, 'duration')
        if 'is_enabled' in request.data:
            val = request.data['is_enabled']
            update_fields['is_enabled'] = bool(_safe_int(val, 0, 'is_enabled')) if not isinstance(val, bool) else val
        if 'nocache' in request.data:
            val = request.data['nocache']
            update_fields['nocache'] = bool(_safe_int(val, 0, 'nocache')) if not isinstance(val, bool) else val
        try:
            data = client.update_asset(asset_id, update_fields)
            return Response({'success': True, 'asset': data})
        except PlayerConnectionError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as exc:
            logger.exception('Error updating asset on %s', player.name)
            return Response(
                {'error': f'Update failed: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'], url_path='asset-delete')
    def asset_delete(self, request, pk=None):
        """Delete an asset from the player."""
        player = self.get_object()
        client = self._get_client(player)
        asset_id = request.data.get('asset_id')
        if not asset_id:
            return Response(
                {'error': 'asset_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            client.delete_asset(asset_id)
            return Response({'success': True})
        except PlayerConnectionError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as exc:
            logger.exception('Error deleting asset on %s', player.name)
            return Response(
                {'error': f'Delete failed: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'], url_path='asset-create')
    def asset_create(self, request, pk=None):
        """Create a new asset on the player."""
        player = self.get_object()
        client = self._get_client(player)
        required = ('name', 'uri', 'start_date', 'end_date', 'duration', 'mimetype')
        asset_data = {k: request.data.get(k) for k in required if request.data.get(k) is not None}
        if 'is_enabled' in request.data:
            asset_data['is_enabled'] = request.data['is_enabled']
        try:
            data = client.create_asset(asset_data)
            return Response({'success': True, 'asset': data})
        except PlayerConnectionError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as exc:
            logger.exception('Error creating asset on %s', player.name)
            return Response(
                {'error': f'Create failed: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'], url_path='asset-upload')
    def asset_upload(self, request, pk=None):
        """Upload a MediaFile to the player as an asset."""
        player = self.get_object()
        client = self._get_client(player)
        media_file_id = request.data.get('media_file_id')
        if not media_file_id:
            return Response(
                {'error': 'media_file_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            media_file = MediaFile.objects.get(pk=media_file_id)
        except MediaFile.DoesNotExist:
            return Response(
                {'error': 'MediaFile not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        name = request.data.get('name', media_file.name)
        duration = _safe_int(request.data.get('duration'), 10, 'duration')

        now = timezone.now()
        default_start = now.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        default_end = (now + timedelta(days=30)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
        start_date = request.data.get('start_date') or default_start
        end_date = request.data.get('end_date') or default_end

        # Map file_type to Anthias mimetype
        MIMETYPE_MAP = {
            'image': 'image',
            'video': 'video',
            'web': 'webpage',
        }

        try:
            if media_file.file:
                # Step 1: Upload file to player → returns {uri, ext}
                old_timeout = client.timeout
                client.timeout = 60
                try:
                    media_file.file.open('rb')
                    upload_result = client.upload_file(media_file.file)
                    media_file.file.close()
                finally:
                    client.timeout = old_timeout

                # Step 2: Create asset with the uploaded file's uri
                mimetype = MIMETYPE_MAP.get(media_file.file_type, 'image')
                # Video duration must be 0 — Anthias auto-detects it
                asset_duration = 0 if mimetype == 'video' else duration
                asset_data = {
                    'name': name,
                    'uri': upload_result.get('uri', ''),
                    'ext': upload_result.get('ext', ''),
                    'mimetype': mimetype,
                    'is_enabled': True,
                    'nocache': False,
                    'start_date': start_date,
                    'end_date': end_date,
                    'duration': asset_duration,
                    'skip_asset_check': False,
                }
                data = client.create_asset(asset_data)
            else:
                # URL-based media — create asset with webpage mimetype
                asset_data = {
                    'name': name,
                    'uri': media_file.source_url,
                    'mimetype': 'webpage',
                    'is_enabled': True,
                    'nocache': False,
                    'start_date': start_date,
                    'end_date': end_date,
                    'duration': duration,
                    'skip_asset_check': False,
                }
                data = client.create_asset(asset_data)

            return Response({'success': True, 'asset': data})
        except PlayerConnectionError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as exc:
            logger.exception('Error uploading asset to %s', player.name)
            return Response(
                {'error': f'Upload failed: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    # ── Schedule Slot proxy actions ──

    @action(detail=True, methods=['get'], url_path='schedule-slots')
    def schedule_slots(self, request, pk=None):
        """Proxy to the player's schedule slots list."""
        player = self.get_object()
        client = self._get_client(player)
        try:
            data = client.get_schedule_slots()
            return Response(data)
        except PlayerConnectionError as exc:
            msg, code = _format_player_error(exc)
            return Response({'error': msg}, status=code)

    @action(detail=True, methods=['get'], url_path='schedule-status')
    def schedule_status(self, request, pk=None):
        """Proxy to the player's schedule status."""
        player = self.get_object()
        client = self._get_client(player)
        try:
            data = client.get_schedule_status()
            return Response(data)
        except PlayerConnectionError as exc:
            msg, code = _format_player_error(exc)
            return Response({'error': msg}, status=code)

    @action(detail=True, methods=['post'], url_path='schedule-slot-create')
    def schedule_slot_create(self, request, pk=None):
        """Create a schedule slot on the player."""
        player = self.get_object()
        client = self._get_client(player)
        try:
            data = client.create_schedule_slot(request.data)
            return Response({'success': True, 'slot': data}, status=status.HTTP_201_CREATED)
        except PlayerConnectionError as exc:
            msg, code = _format_player_error(exc)
            return Response({'error': msg}, status=code)

    @action(detail=True, methods=['put', 'patch'], url_path='schedule-slot-update')
    def schedule_slot_update(self, request, pk=None):
        """Update a schedule slot on the player."""
        player = self.get_object()
        client = self._get_client(player)
        slot_id = request.data.get('slot_id')
        if not slot_id:
            return Response(
                {'error': 'slot_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        update_data = {k: v for k, v in request.data.items() if k != 'slot_id'}
        try:
            data = client.update_schedule_slot(slot_id, update_data)
            return Response({'success': True, 'slot': data})
        except PlayerConnectionError as exc:
            msg, code = _format_player_error(exc)
            return Response({'error': msg}, status=code)

    @action(detail=True, methods=['post'], url_path='schedule-slot-delete')
    def schedule_slot_delete(self, request, pk=None):
        """Delete a schedule slot on the player."""
        player = self.get_object()
        client = self._get_client(player)
        slot_id = request.data.get('slot_id')
        if not slot_id:
            return Response(
                {'error': 'slot_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            client.delete_schedule_slot(slot_id)
            return Response({'success': True})
        except PlayerConnectionError as exc:
            msg, code = _format_player_error(exc)
            return Response({'error': msg}, status=code)

    @action(detail=True, methods=['post'], url_path='schedule-slot-item-add')
    def schedule_slot_item_add(self, request, pk=None):
        """Add an asset to a schedule slot on the player.

        Automatically enables the asset (is_enabled=True) so it can be
        played by the scheduler.  Anthias requires assets to be enabled
        even when they are part of a schedule slot.
        """
        player = self.get_object()
        client = self._get_client(player)
        slot_id = request.data.get('slot_id')
        if not slot_id:
            return Response(
                {'error': 'slot_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        item_data = {k: v for k, v in request.data.items() if k != 'slot_id'}
        try:
            # Ensure the asset is enabled so the scheduler can play it
            asset_id = item_data.get('asset_id')
            if asset_id:
                try:
                    client.update_asset(asset_id, {'is_enabled': True})
                except PlayerConnectionError:
                    pass  # non-fatal: slot item will still be added

            data = client.add_slot_item(slot_id, item_data)
            return Response({'success': True, 'item': data}, status=status.HTTP_201_CREATED)
        except PlayerConnectionError as exc:
            msg, code = _format_player_error(exc)
            return Response({'error': msg}, status=code)

    @action(detail=True, methods=['post'], url_path='schedule-slot-item-remove')
    def schedule_slot_item_remove(self, request, pk=None):
        """Remove an asset from a schedule slot on the player."""
        player = self.get_object()
        client = self._get_client(player)
        slot_id = request.data.get('slot_id')
        item_id = request.data.get('item_id')
        if not slot_id or not item_id:
            return Response(
                {'error': 'slot_id and item_id are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            client.delete_slot_item(slot_id, item_id)
            return Response({'success': True})
        except PlayerConnectionError as exc:
            msg, code = _format_player_error(exc)
            return Response({'error': msg}, status=code)

    @action(detail=True, methods=['put', 'patch'], url_path='schedule-slot-item-update')
    def schedule_slot_item_update(self, request, pk=None):
        """Update a slot item on the player (e.g. duration_override)."""
        player = self.get_object()
        client = self._get_client(player)
        slot_id = request.data.get('slot_id')
        item_id = request.data.get('item_id')
        if not slot_id or not item_id:
            return Response(
                {'error': 'slot_id and item_id are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        update_data = {
            k: v for k, v in request.data.items()
            if k not in ('slot_id', 'item_id')
        }
        try:
            data = client.update_slot_item(slot_id, item_id, update_data)
            return Response({'success': True, 'item': data})
        except PlayerConnectionError as exc:
            msg, code = _format_player_error(exc)
            return Response({'error': msg}, status=code)

    @action(detail=True, methods=['post'], url_path='schedule-slot-items-reorder')
    def schedule_slot_items_reorder(self, request, pk=None):
        """Reorder items in a schedule slot."""
        player = self.get_object()
        client = self._get_client(player)
        slot_id = request.data.get('slot_id')
        ids = request.data.get('ids', [])
        if not slot_id:
            return Response(
                {'error': 'slot_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            data = client.reorder_slot_items(slot_id, ids)
            return Response(data)
        except PlayerConnectionError as exc:
            msg, code = _format_player_error(exc)
            return Response({'error': msg}, status=code)

    @action(detail=True, methods=['get'], url_path=r'asset-content/(?P<asset_id>[^/.]+)')
    def asset_content(self, request, pk=None, asset_id=None):
        """Proxy asset content from the player (images, videos)."""
        import mimetypes
        import requests as http_requests

        player = self.get_object()
        client = self._get_client(player)
        url = f'{client.base_url}/api/v2/assets/{asset_id}/content'
        try:
            # Get asset info to determine correct content type
            asset_resp = client._request('GET', f'/api/v2/assets/{asset_id}')
            asset_info = asset_resp.json()
            uri = asset_info.get('uri', '')
            mimetype = asset_info.get('mimetype', '')

            # Determine content type from URI extension or asset mimetype
            guessed, _ = mimetypes.guess_type(uri)
            if guessed:
                content_type = guessed
            elif mimetype == 'image':
                content_type = 'image/jpeg'
            elif mimetype == 'video':
                content_type = 'video/mp4'
            else:
                content_type = 'application/octet-stream'

            kwargs = {'timeout': 30, 'stream': True}
            if client.auth:
                kwargs['auth'] = client.auth
            resp = http_requests.get(url, **kwargs)
            resp.raise_for_status()
            response = StreamingHttpResponse(
                resp.iter_content(chunk_size=8192),
                content_type=content_type,
            )
            if 'Content-Length' in resp.headers:
                response['Content-Length'] = resp.headers['Content-Length']
            response['Cache-Control'] = 'public, max-age=3600'
            return response
        except Exception:
            return Response(
                {'error': 'Content unavailable'},
                status=status.HTTP_502_BAD_GATEWAY,
            )


class BulkActionView(APIView):
    """
    Handle bulk actions across multiple players.

    POST /api/bulk/reboot/   - Reboot multiple players.
    POST /api/bulk/shutdown/ - Shut down multiple players.
    """

    def _execute_bulk_action(self, action_name, player_ids):
        """
        Execute a given action on multiple players.

        Args:
            action_name: The method name on AnthiasAPIClient to call.
            player_ids: List of player UUID strings.

        Returns:
            dict with results per player.
        """
        players = Player.objects.filter(id__in=player_ids)
        results = {}

        for player in players:
            client = AnthiasAPIClient(player)
            try:
                getattr(client, action_name)()
                results[str(player.id)] = {
                    'success': True,
                    'name': player.name,
                    'message': f'{action_name.capitalize()} command sent.',
                }
            except PlayerConnectionError as exc:
                results[str(player.id)] = {
                    'success': False,
                    'name': player.name,
                    'message': str(exc),
                }
            except Exception as exc:
                logger.exception(
                    'Error executing %s on player %s', action_name, player.name,
                )
                results[str(player.id)] = {
                    'success': False,
                    'name': player.name,
                    'message': f'Unexpected error: {exc}',
                }

        return results

    def post(self, request, action):
        """
        Handle bulk action requests.

        Expects JSON body: {"player_ids": ["uuid1", "uuid2", ...]}
        URL captures `action` which must be 'reboot' or 'shutdown'.
        """
        valid_actions = ('reboot', 'shutdown')
        if action not in valid_actions:
            return Response(
                {'error': f'Invalid action. Must be one of: {", ".join(valid_actions)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        player_ids = request.data.get('player_ids', [])
        if not player_ids:
            return Response(
                {'error': 'player_ids is required and must be a non-empty list.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = self._execute_bulk_action(action, player_ids)
        return Response({'results': results})


@api_view(['GET'])
def playback_log(request):
    """Get playback log entries with optional filters."""
    qs = PlaybackLog.objects.select_related('player').all()

    player_id = request.query_params.get('player')
    if player_id:
        qs = qs.filter(player_id=player_id)

    date_from = request.query_params.get('date_from')
    if date_from:
        qs = qs.filter(timestamp__gte=date_from)

    date_to = request.query_params.get('date_to')
    if date_to:
        qs = qs.filter(timestamp__lte=date_to)

    content = request.query_params.get('content')
    if content:
        qs = qs.filter(asset_name=content)

    # Pagination
    page = _safe_int(request.query_params.get('page'), 1, 'page')
    page_size = _safe_int(request.query_params.get('page_size'), 50, 'page_size')
    total = qs.count()
    offset = (page - 1) * page_size
    entries = qs[offset:offset + page_size]

    serializer = PlaybackLogSerializer(entries, many=True)

    # Tracking info per player
    tracking_info = {}
    if player_id:
        try:
            p = Player.objects.get(pk=player_id)
            tracking_info[str(p.id)] = {
                'name': p.name,
                'tracking_since': p.history_tracking_since.isoformat() if p.history_tracking_since else None,
            }
        except Player.DoesNotExist:
            pass
    else:
        for p in Player.objects.filter(history_tracking_since__isnull=False):
            tracking_info[str(p.id)] = {
                'name': p.name,
                'tracking_since': p.history_tracking_since.isoformat() if p.history_tracking_since else None,
            }

    # Distinct asset names for filter dropdown
    asset_names = list(
        PlaybackLog.objects.values_list('asset_name', flat=True)
        .distinct().order_by('asset_name')
    )

    return Response({
        'results': serializer.data,
        'total': total,
        'page': page,
        'page_size': page_size,
        'tracking_info': tracking_info,
        'asset_names': asset_names,
    })


@api_view(['GET'])
def playback_stats(request):
    """Return total playback duration per asset_name (in seconds).

    Uses SQL LEAD() window function to compute duration between consecutive
    'started' events per player.  The last event per player is skipped
    (no way to know when it ended).
    """
    from django.db import connection

    sql = """
        SELECT asset_name, SUM(dur) AS total_seconds
        FROM (
            SELECT asset_name,
                   EXTRACT(EPOCH FROM
                       LEAD(timestamp) OVER (PARTITION BY player_id ORDER BY timestamp)
                       - timestamp
                   ) AS dur
            FROM players_playbacklog
            WHERE event = 'started'
        ) sub
        WHERE dur IS NOT NULL AND dur > 0 AND dur < 86400
        GROUP BY asset_name
    """
    with connection.cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    stats = {row[0]: round(row[1]) for row in rows}
    return Response({'stats': stats})


@api_view(['POST'])
@permission_classes([AllowAny])
def register_player(request):
    """Phone-home endpoint: players POST here periodically to register/heartbeat."""
    url = (request.data.get('url') or '').rstrip('/')
    name = request.data.get('name') or 'Unknown'
    info = request.data.get('info') or {}

    if not url:
        return Response(
            {'error': 'url is required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    now = timezone.now()
    try:
        player, created = Player.objects.get_or_create(
            url=url,
            defaults={
                'name': name,
                'is_online': True,
                'last_seen': now,
                'last_status': info,
                'auto_registered': True,
            },
        )
        if not created:
            player.is_online = True
            player.last_seen = now
            player.last_status = info
            player.save(update_fields=['is_online', 'last_seen', 'last_status'])
    except IntegrityError:
        # Concurrent create hit unique(url) — retry as update
        player = Player.objects.filter(url=url).first()
        if player:
            player.is_online = True
            player.last_seen = now
            player.last_status = info
            player.save(update_fields=['is_online', 'last_seen', 'last_status'])
            created = False
        else:
            return Response(
                {'error': 'Registration conflict, please retry'},
                status=status.HTTP_409_CONFLICT,
            )

    if created:
        return Response({'status': 'created', 'id': str(player.id)}, status=status.HTTP_201_CREATED)
    return Response({'status': 'updated', 'id': str(player.id)}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def install_phonehome(request):
    """Return a bash script that installs the phone-home systemd timer on a player."""
    import re as _re
    from urllib.parse import urlparse as _urlparse

    server = request.query_params.get('server', '').rstrip('/')
    if not server:
        return Response(
            {'error': 'server query parameter is required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate: must be a proper HTTP(S) URL with no shell metacharacters
    try:
        parsed = _urlparse(server)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname:
            raise ValueError('bad scheme or host')
    except Exception:
        return Response(
            {'error': 'server must be a valid http(s) URL'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Reject any characters that could break out of a shell double-quoted string
    if not _re.match(r'^https?://[A-Za-z0-9._:/@\[\]\-]+$', server):
        return Response(
            {'error': 'server URL contains disallowed characters'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    script = f'''#!/bin/bash
set -e

SERVER="{server}"

# Create phone-home script
cat > /usr/local/bin/anthias-phonehome.sh << 'SCRIPT'
#!/bin/bash
SERVER="{server}"
URL="http://$(hostname -I | awk '{{print $1}}')"
NAME="$(hostname)"
INFO=$(curl -sf http://localhost/api/v2/info 2>/dev/null || echo '{{}}')
curl -sf -X POST "${{SERVER}}/api/players/register/" \\
  -H "Content-Type: application/json" \\
  -d "{{\\"url\\":\\"${{URL}}\\",\\"name\\":\\"${{NAME}}\\",\\"info\\":${{INFO}}}}"
SCRIPT
chmod +x /usr/local/bin/anthias-phonehome.sh

# Create systemd service
cat > /etc/systemd/system/anthias-phonehome.service << 'EOF'
[Unit]
Description=Anthias Phone Home
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/anthias-phonehome.sh
EOF

# Create systemd timer
cat > /etc/systemd/system/anthias-phonehome.timer << 'EOF'
[Unit]
Description=Anthias Phone Home Timer

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF

# Enable and start
systemctl daemon-reload
systemctl enable anthias-phonehome.timer
systemctl start anthias-phonehome.timer

echo "Anthias phone-home installed and started."
echo "Timer status:"
systemctl status anthias-phonehome.timer --no-pager
'''
    return HttpResponse(script, content_type='text/plain; charset=utf-8')
