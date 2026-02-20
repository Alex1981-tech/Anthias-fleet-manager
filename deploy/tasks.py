import ipaddress
import json
import logging
import os
import re
import socket
import subprocess
import tempfile
import urllib.request
from urllib.parse import urlparse

from celery import shared_task
from django.core.files import File

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp')


def _is_image_url(url):
    """Check if a URL points to an image based on file extension."""
    try:
        path = urlparse(url).path.lower()
        return any(path.endswith(ext) for ext in IMAGE_EXTENSIONS)
    except Exception:
        return False


def _is_safe_url(url):
    """Check that a URL is safe to fetch (no SSRF into private networks)."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False

    if parsed.scheme not in ('http', 'https'):
        return False

    hostname = parsed.hostname
    if not hostname:
        return False

    # Block obvious localhost variants
    if hostname in ('localhost', '127.0.0.1', '::1', '0.0.0.0'):
        return False

    # Resolve DNS and check all addresses
    try:
        for info in socket.getaddrinfo(hostname, parsed.port or 80, proto=socket.IPPROTO_TCP):
            addr = info[4][0]
            ip = ipaddress.ip_address(addr)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False
    except socket.gaierror:
        logger.warning('DNS resolution failed for %s — allowing (not a private IP threat)', hostname)
        return True

    return True


@shared_task(bind=True, max_retries=0)
def fetch_og_image_task(self, media_file_id, url):
    """Fetch og:image / twitter:image from a URL and save to MediaFile.thumbnail_url."""
    from deploy.models import MediaFile

    try:
        media_file = MediaFile.objects.get(pk=media_file_id)
    except MediaFile.DoesNotExist:
        return

    # If URL itself is a direct image link, use it as thumbnail
    if _is_image_url(url):
        media_file.thumbnail_url = url
        media_file.save(update_fields=['thumbnail_url'])
        logger.info('Direct image URL used as thumbnail for %s: %s', media_file_id, url)
        return

    thumbnail_url = _fetch_og_image(url)
    if thumbnail_url:
        media_file.thumbnail_url = thumbnail_url
        media_file.save(update_fields=['thumbnail_url'])
        logger.info('Fetched og:image for %s: %s', media_file_id, thumbnail_url)


def _fetch_og_image(url):
    """Try to extract og:image or twitter:image from a URL."""
    if not _is_safe_url(url):
        logger.warning('Blocked SSRF attempt for og:image fetch: %s', url)
        return None
    try:
        # HEAD request first to check Content-Type
        head_req = urllib.request.Request(url, method='HEAD', headers={
            'User-Agent': 'Mozilla/5.0 (compatible; AnthiasBot/1.0)',
        })
        with urllib.request.urlopen(head_req, timeout=5) as head_resp:
            content_type = head_resp.headers.get('Content-Type', '')
            if content_type.startswith('image/'):
                return url
    except Exception:
        logger.debug('HEAD request failed for %s, falling back to GET', url)
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; AnthiasBot/1.0)',
        })
        with urllib.request.urlopen(req, timeout=5) as resp:
            html = resp.read(50000).decode('utf-8', errors='ignore')
        for prop in ('og:image', 'twitter:image'):
            attr = 'property' if prop.startswith('og:') else 'name'
            pattern = (
                rf'<meta[^>]+{attr}=["\']' + re.escape(prop) + r'["\'][^>]+content=["\']([^"\']+)["\']'
            )
            match = re.search(pattern, html, re.IGNORECASE)
            if not match:
                pattern = (
                    rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+{attr}=["\']' + re.escape(prop) + r'["\']'
                )
                match = re.search(pattern, html, re.IGNORECASE)
            if match:
                return match.group(1)
    except Exception:
        logger.debug('Failed to fetch og:image for %s', url, exc_info=True)
    return None


def _generate_video_thumbnail(file_path):
    """Extract a frame from video at 1 second using ffmpeg, return path or None."""
    fd, thumb_path = tempfile.mkstemp(suffix='.jpg')
    os.close(fd)
    cmd = [
        'ffmpeg', '-i', file_path,
        '-ss', '1', '-frames:v', '1',
        '-vf', "scale='min(400,iw)':-1",
        '-q:v', '5',
        '-y', thumb_path,
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=30, check=True)
        if os.path.getsize(thumb_path) > 0:
            return thumb_path
    except Exception:
        logger.debug('Failed to extract video thumbnail from %s', file_path)
    if os.path.exists(thumb_path):
        os.remove(thumb_path)
    return None


def _generate_image_thumbnail(file_path):
    """Resize image to max 400px wide using Pillow, return path or None."""
    from PIL import Image

    fd, thumb_path = tempfile.mkstemp(suffix='.jpg')
    os.close(fd)
    try:
        with Image.open(file_path) as img:
            img = img.convert('RGB')
            img.thumbnail((400, 400))
            img.save(thumb_path, 'JPEG', quality=80)
        if os.path.getsize(thumb_path) > 0:
            return thumb_path
    except Exception:
        logger.debug('Failed to generate image thumbnail from %s', file_path)
    if os.path.exists(thumb_path):
        os.remove(thumb_path)
    return None


def _save_thumbnail(media_file, thumb_path):
    """Save thumbnail file to the MediaFile.thumbnail field."""
    import uuid as _uuid
    thumb_name = f'{_uuid.uuid4().hex[:12]}.jpg'
    try:
        with open(thumb_path, 'rb') as f:
            media_file.thumbnail.save(thumb_name, File(f), save=True)
    finally:
        if os.path.exists(thumb_path):
            os.remove(thumb_path)


def _probe_video(file_path):
    """Run ffprobe and return dict with codec, bitrate, width, height, fps."""
    cmd = [
        'ffprobe', '-v', 'quiet', '-print_format', 'json',
        '-show_format', '-show_streams', file_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    data = json.loads(result.stdout)

    video_stream = None
    for s in data.get('streams', []):
        if s.get('codec_type') == 'video':
            video_stream = s
            break

    if not video_stream:
        return None

    fmt = data.get('format', {})
    bit_rate = int(fmt.get('bit_rate', 0))
    width = int(video_stream.get('width', 0))
    height = int(video_stream.get('height', 0))
    codec = video_stream.get('codec_name', '')

    # Parse fps from r_frame_rate (e.g. "30/1")
    fps = 0
    r_frame_rate = video_stream.get('r_frame_rate', '0/1')
    try:
        num, den = r_frame_rate.split('/')
        fps = int(num) / int(den) if int(den) != 0 else 0
    except (ValueError, ZeroDivisionError):
        pass

    return {
        'codec': codec,
        'bitrate': bit_rate,
        'width': width,
        'height': height,
        'fps': fps,
        'container': fmt.get('format_name', ''),
    }


def _needs_transcode(probe, file_ext):
    """Return True if the video needs transcoding."""
    if not probe:
        return True
    is_h264 = probe['codec'] == 'h264'
    is_mp4 = file_ext.lower() in ('.mp4',) and 'mp4' in probe['container']
    low_bitrate = probe['bitrate'] <= 8_000_000
    low_res = probe['width'] <= 1920 and probe['height'] <= 1080
    return not (is_h264 and is_mp4 and low_bitrate and low_res)


@shared_task(bind=True, max_retries=0, queue='transcode')
def transcode_video(self, media_file_id):
    """Transcode an uploaded video to Pi-friendly H.264 MP4."""
    from deploy.models import MediaFile

    try:
        media_file = MediaFile.objects.get(pk=media_file_id)
    except MediaFile.DoesNotExist:
        logger.error('MediaFile %s does not exist.', media_file_id)
        return

    if not media_file.file:
        logger.error('MediaFile %s has no file.', media_file_id)
        media_file.processing_status = 'failed'
        media_file.save(update_fields=['processing_status'])
        return

    input_path = media_file.file.path
    file_ext = os.path.splitext(input_path)[1]

    try:
        probe = _probe_video(input_path)
    except Exception:
        logger.exception('ffprobe failed for %s', input_path)
        probe = None

    if not _needs_transcode(probe, file_ext):
        logger.info('MediaFile %s already optimal, skipping transcode.', media_file_id)
        # Generate thumbnail even if no transcode needed
        thumb_path = _generate_video_thumbnail(input_path)
        if thumb_path:
            _save_thumbnail(media_file, thumb_path)
        media_file.processing_status = 'ready'
        media_file.save(update_fields=['processing_status'])
        return

    logger.info('Starting transcode for MediaFile %s (%s)', media_file_id, input_path)

    output_dir = os.path.dirname(input_path)
    fd, tmp_output = tempfile.mkstemp(suffix='.mp4', dir=output_dir)
    os.close(fd)

    # Build ffmpeg filter: cap fps at 30 only if source exceeds 30
    vf = "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2"
    cmd = [
        'ffmpeg', '-i', input_path,
        '-c:v', 'libx264', '-profile:v', 'main', '-level', '4.1',
        '-preset', 'medium',
        '-b:v', '8M', '-maxrate', '10M', '-bufsize', '16M',
        '-vf', vf,
        '-r', '30',
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
        '-movflags', '+faststart',
        '-y', tmp_output,
    ]

    try:
        subprocess.run(
            cmd, capture_output=True, text=True, timeout=3600, check=True,
        )
    except subprocess.CalledProcessError as exc:
        logger.error('ffmpeg failed for %s: %s', media_file_id, exc.stderr[-500:] if exc.stderr else '')
        media_file.processing_status = 'failed'
        media_file.save(update_fields=['processing_status'])
        if os.path.exists(tmp_output):
            os.remove(tmp_output)
        return
    except Exception:
        logger.exception('Transcode error for %s', media_file_id)
        media_file.processing_status = 'failed'
        media_file.save(update_fields=['processing_status'])
        if os.path.exists(tmp_output):
            os.remove(tmp_output)
        return

    # Replace original with transcoded file (safe: save new before deleting old)
    try:
        new_size = os.path.getsize(tmp_output)
        old_name = os.path.basename(media_file.file.name)
        old_file_path = media_file.file.path
        new_name = os.path.splitext(old_name)[0] + '.mp4'

        # Save transcoded file first (keeps original intact on failure)
        with open(tmp_output, 'rb') as f:
            media_file.file.save(new_name, File(f), save=False)

        media_file.file_size = new_size
        media_file.processing_status = 'ready'
        # Update display name extension to .mp4
        name_base, name_ext = os.path.splitext(media_file.name)
        if name_ext.lower() != '.mp4':
            media_file.name = name_base + '.mp4'
        media_file.save(update_fields=['file', 'file_size', 'processing_status', 'name'])

        # Delete original only after successful save
        if os.path.exists(old_file_path) and old_file_path != media_file.file.path:
            os.remove(old_file_path)

        logger.info(
            'Transcode complete for %s: %s (%d bytes)',
            media_file_id, new_name, new_size,
        )

        # Generate thumbnail from transcoded video
        thumb_path = _generate_video_thumbnail(media_file.file.path)
        if thumb_path:
            _save_thumbnail(media_file, thumb_path)

    except Exception:
        logger.exception('Failed to replace file for %s', media_file_id)
        media_file.processing_status = 'failed'
        media_file.save(update_fields=['processing_status'])
    finally:
        if os.path.exists(tmp_output):
            os.remove(tmp_output)


@shared_task(bind=True, max_retries=0, queue='transcode')
def generate_image_thumbnail(self, media_file_id):
    """Generate a thumbnail for an uploaded image."""
    from deploy.models import MediaFile

    try:
        media_file = MediaFile.objects.get(pk=media_file_id)
    except MediaFile.DoesNotExist:
        return

    if not media_file.file:
        return

    thumb_path = _generate_image_thumbnail(media_file.file.path)
    if thumb_path:
        _save_thumbnail(media_file, thumb_path)
        logger.info('Generated image thumbnail for %s', media_file_id)


@shared_task(bind=True, max_retries=0)
def execute_deploy(self, deploy_task_id):
    """
    Execute a deploy task: iterate over all target players and create
    the asset on each one via the Anthias API client.

    Args:
        deploy_task_id: UUID string of the DeployTask to execute.
    """
    from deploy.models import DeployTask
    from players.services import AnthiasAPIClient, PlayerConnectionError

    try:
        deploy_task = DeployTask.objects.get(pk=deploy_task_id)
    except DeployTask.DoesNotExist:
        logger.error('DeployTask %s does not exist.', deploy_task_id)
        return

    deploy_task.status = 'running'
    deploy_task.progress = {}
    deploy_task.save(update_fields=['status', 'progress'])

    target_players = deploy_task.target_players.all()
    total = target_players.count()
    succeeded = 0
    failed = 0

    PROGRESS_BATCH_SIZE = 5
    processed = 0

    for player in target_players:
        client = AnthiasAPIClient(player)
        try:
            # If a file was uploaded, send it first, then create the asset.
            if deploy_task.file_path:
                with deploy_task.file_path.open('rb') as f:
                    upload_result = client.upload_file(f)
                logger.info(
                    'Uploaded file to player %s: %s', player.name, upload_result,
                )

            # Create the asset on the player using the provided asset_data.
            if deploy_task.asset_data:
                result = client.create_asset(deploy_task.asset_data)
                logger.info(
                    'Created asset on player %s: %s', player.name, result,
                )

            deploy_task.progress[str(player.id)] = {
                'status': 'success',
                'name': player.name,
            }
            succeeded += 1

        except PlayerConnectionError as exc:
            deploy_task.progress[str(player.id)] = {
                'status': 'failed',
                'name': player.name,
                'error': str(exc),
            }
            failed += 1
            logger.warning(
                'Failed to deploy to player %s: %s', player.name, exc,
            )

        except Exception as exc:
            deploy_task.progress[str(player.id)] = {
                'status': 'failed',
                'name': player.name,
                'error': str(exc),
            }
            failed += 1
            logger.exception(
                'Unexpected error deploying to player %s.', player.name,
            )

        processed += 1
        # Batch progress saves to reduce write amplification.
        if processed % PROGRESS_BATCH_SIZE == 0:
            deploy_task.save(update_fields=['progress'])

    # Final save to flush any remaining progress.
    deploy_task.save(update_fields=['progress'])

    # Determine final status.
    if failed == 0:
        deploy_task.status = 'completed'
    elif succeeded == 0:
        deploy_task.status = 'failed'
    else:
        # Partial success - mark as completed (progress has per-player details).
        deploy_task.status = 'completed'

    deploy_task.save(update_fields=['status'])
    logger.info(
        'DeployTask %s finished: %d/%d succeeded, %d/%d failed.',
        deploy_task_id, succeeded, total, failed, total,
    )


@shared_task(bind=True, max_retries=0)
def check_cctv_schedules(self):
    """Proactively start/stop CCTV streams based on player schedules.

    Runs every 30s via Celery beat. Checks online players' schedules for
    CCTV assets, starts streams if needed, stops if no longer needed.
    """
    import re
    from datetime import timedelta

    import requests
    from django.utils import timezone

    from deploy.cctv_service import get_stream_status, start_stream, stitch_grid_snapshot, stop_stream, update_thumbnail
    from deploy.models import CctvConfig
    from players.models import Player

    needed_config_ids = set()

    online_players = Player.objects.filter(is_online=True)
    for player in online_players:
        try:
            from players.services import AnthiasAPIClient
            client = AnthiasAPIClient(player)
            slots = client._get(f'{client.base_url}/api/v2/schedule-slots/')
            if not isinstance(slots, list):
                continue
            for slot in slots:
                items = slot.get('items', [])
                for item in items:
                    uri = item.get('asset_uri', '')
                    match = re.search(r'/cctv/([0-9a-f-]+)/?', uri)
                    if match:
                        needed_config_ids.add(match.group(1))
        except Exception:
            logger.debug('Failed to check schedule for player %s', player.name)

    # Start streams that are needed + refresh grid snapshots
    for config_id in needed_config_ids:
        try:
            config = CctvConfig.objects.get(pk=config_id)
            stream = get_stream_status(config_id)
            if stream['status'] != 'running':
                logger.info('Proactively starting CCTV stream %s (%s)', config_id, config.name)
                start_stream(config_id)
                config.is_active = True
                config.last_requested_at = timezone.now()
                config.save(update_fields=['is_active', 'last_requested_at'])

                # Delayed thumbnail update
                import threading
                import time

                def _thumb(cid):
                    time.sleep(5)
                    try:
                        stitch_grid_snapshot(cid)
                        update_thumbnail(cid)
                    except Exception:
                        logger.warning('Failed to update CCTV thumbnail for %s', cid, exc_info=True)

                threading.Thread(target=_thumb, args=(config_id,), daemon=True).start()
            else:
                # Running stream — refresh grid mosaic snapshot for live view
                stitch_grid_snapshot(config_id)
        except CctvConfig.DoesNotExist:
            pass
        except Exception:
            logger.exception('Failed to proactively start CCTV %s', config_id)

    # Stop streams not needed for 5+ minutes
    cutoff = timezone.now() - timedelta(minutes=5)
    active_configs = CctvConfig.objects.filter(is_active=True)
    for config in active_configs:
        config_id_str = str(config.id)
        if config_id_str not in needed_config_ids:
            if config.last_requested_at and config.last_requested_at < cutoff:
                logger.info('Auto-stopping CCTV stream %s (%s) — not needed', config_id_str, config.name)
                stop_stream(config_id_str)
                config.is_active = False
                config.save(update_fields=['is_active'])
