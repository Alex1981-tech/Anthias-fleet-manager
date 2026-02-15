import logging
import threading

from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import CctvCamera, CctvConfig, MediaFile

logger = logging.getLogger(__name__)


class CctvCameraSerializer(serializers.ModelSerializer):
    class Meta:
        model = CctvCamera
        fields = ['id', 'name', 'rtsp_url', 'sort_order']
        read_only_fields = ['id']


class CctvConfigSerializer(serializers.ModelSerializer):
    cameras = CctvCameraSerializer(many=True, read_only=True)
    media_file_id = serializers.UUIDField(source='media_file.id', read_only=True, default=None)

    class Meta:
        model = CctvConfig
        fields = [
            'id', 'name', 'display_mode', 'rotation_interval',
            'resolution', 'fps', 'is_active', 'cameras',
            'media_file_id', 'created_at',
        ]
        read_only_fields = ['id', 'is_active', 'created_at']


class CctvConfigWriteSerializer(serializers.ModelSerializer):
    cameras = CctvCameraSerializer(many=True)

    class Meta:
        model = CctvConfig
        fields = [
            'id', 'name', 'display_mode', 'rotation_interval',
            'resolution', 'fps', 'cameras',
        ]
        read_only_fields = ['id']

    def create(self, validated_data):
        cameras_data = validated_data.pop('cameras', [])
        config = CctvConfig.objects.create(**validated_data)
        for i, cam_data in enumerate(cameras_data):
            cam_data['sort_order'] = cam_data.get('sort_order', i)
            CctvCamera.objects.create(config=config, **cam_data)

        # Auto-create linked MediaFile
        media_file = MediaFile.objects.create(
            name=config.name,
            source_url=f'/cctv/{config.id}/',
            file_type='cctv',
            file_size=0,
        )
        config.media_file = media_file
        config.save(update_fields=['media_file'])

        return config

    def update(self, instance, validated_data):
        cameras_data = validated_data.pop('cameras', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if cameras_data is not None:
            instance.cameras.all().delete()
            for i, cam_data in enumerate(cameras_data):
                cam_data.pop('id', None)
                cam_data['sort_order'] = cam_data.get('sort_order', i)
                CctvCamera.objects.create(config=instance, **cam_data)

        # Sync name to MediaFile
        if instance.media_file and 'name' in validated_data:
            instance.media_file.name = instance.name
            instance.media_file.save(update_fields=['name'])

        return instance


@api_view(['GET', 'POST'])
def cctv_list(request):
    if request.method == 'GET':
        configs = CctvConfig.objects.prefetch_related('cameras').select_related('media_file').all()
        serializer = CctvConfigSerializer(configs, many=True)
        return Response(serializer.data)

    serializer = CctvConfigWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    config = serializer.save()
    return Response(
        CctvConfigSerializer(config).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET', 'PUT', 'DELETE'])
def cctv_detail(request, config_id):
    try:
        config = CctvConfig.objects.prefetch_related('cameras').select_related('media_file').get(pk=config_id)
    except CctvConfig.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(CctvConfigSerializer(config).data)

    if request.method == 'DELETE':
        if config.is_active:
            from .cctv_service import stop_stream
            stop_stream(str(config.id))
        # Delete linked MediaFile first
        if config.media_file:
            config.media_file.delete()
        config.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = CctvConfigWriteSerializer(config, data=request.data)
    serializer.is_valid(raise_exception=True)
    config = serializer.save()
    return Response(CctvConfigSerializer(config).data)


@api_view(['POST'])
def cctv_start(request, config_id):
    try:
        config = CctvConfig.objects.prefetch_related('cameras').get(pk=config_id)
    except CctvConfig.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    if config.cameras.count() == 0:
        return Response(
            {'error': 'No cameras configured'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from .cctv_service import start_stream, update_thumbnail
    try:
        start_stream(str(config.id))
        config.is_active = True
        config.save(update_fields=['is_active'])

        # Update thumbnail after ~5s (snapshot needs time to generate)
        def _delayed_thumbnail():
            import time
            time.sleep(5)
            try:
                update_thumbnail(str(config.id))
            except Exception:
                logger.debug('Failed to update CCTV thumbnail for %s', config.id)

        threading.Thread(target=_delayed_thumbnail, daemon=True).start()

        return Response({'success': True, 'status': 'running'})
    except Exception as e:
        logger.exception('Failed to start CCTV stream %s', config_id)
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
def cctv_stop(request, config_id):
    try:
        config = CctvConfig.objects.get(pk=config_id)
    except CctvConfig.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    from .cctv_service import stop_stream
    stop_stream(str(config.id))
    config.is_active = False
    config.save(update_fields=['is_active'])
    return Response({'success': True, 'status': 'stopped'})


@api_view(['GET'])
def cctv_status(request, config_id):
    try:
        config = CctvConfig.objects.get(pk=config_id)
    except CctvConfig.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    from .cctv_service import get_stream_status
    stream_status = get_stream_status(str(config.id))
    return Response(stream_status)


@api_view(['POST'])
@permission_classes([AllowAny])
def cctv_request_start(request, config_id):
    """Public endpoint — player calls this before showing CCTV asset."""
    try:
        config = CctvConfig.objects.prefetch_related('cameras').get(pk=config_id)
    except CctvConfig.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    if config.cameras.count() == 0:
        return Response(
            {'error': 'No cameras configured'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Update last_requested_at
    config.last_requested_at = timezone.now()
    config.save(update_fields=['last_requested_at'])

    from .cctv_service import get_stream_status, start_stream
    stream_status = get_stream_status(str(config.id))

    if stream_status['status'] == 'running':
        return Response({'success': True, 'status': 'running'})

    try:
        start_stream(str(config.id))
        config.is_active = True
        config.save(update_fields=['is_active'])
        return Response({'success': True, 'status': 'starting'})
    except Exception as e:
        logger.exception('Failed to start CCTV stream %s via request-start', config_id)
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
