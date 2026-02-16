import logging
import math
import os
import shutil
import signal
import subprocess
import threading

from django.core.cache import cache
from django.core.files.base import ContentFile

logger = logging.getLogger(__name__)

CCTV_MEDIA_DIR = '/app/media/cctv'
REDIS_PID_PREFIX = 'cctv_pid_'


def _get_pid_key(config_id: str) -> str:
    return f'{REDIS_PID_PREFIX}{config_id}'


def _calc_grid(n: int) -> tuple[int, int]:
    """Calculate grid dimensions for n cameras."""
    if n <= 1:
        return 1, 1
    if n <= 4:
        return 2, 2
    if n <= 9:
        return 3, 3
    cols = math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)
    return cols, rows


def build_mosaic_command(config) -> list[str]:
    """Build ffmpeg command for mosaic mode."""
    cameras = list(config.cameras.all())
    n = len(cameras)
    if n == 0:
        raise ValueError('No cameras configured')

    try:
        width, height = config.resolution.split('x')
        width, height = int(width), int(height)
    except (ValueError, AttributeError):
        width, height = 1920, 1080

    cols, rows = _calc_grid(n)
    cell_w = width // cols
    cell_h = height // rows

    output_dir = os.path.join(CCTV_MEDIA_DIR, str(config.id))
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'stream.m3u8')

    cmd = ['ffmpeg', '-y']

    # Input streams — credentials are embedded in RTSP URL directly
    for cam in cameras:
        cmd.extend([
            '-rtsp_transport', 'tcp',
            '-timeout', '5000000',
            '-i', cam.rtsp_url,
        ])

    if n == 1:
        # Single camera — just scale, then split for HLS + snapshot
        filter_complex = (
            f'[0:v]scale={width}:{height},setpts=PTS-STARTPTS,split=2[hls][snap]'
        )
    else:
        # Build mosaic filter
        parts = []
        # Scale each input
        for i in range(n):
            parts.append(f'[{i}:v]scale={cell_w}:{cell_h},setpts=PTS-STARTPTS[s{i}]')

        # Create black background
        parts.append(
            f'color=c=black:s={width}x{height}:r={config.fps}[bg]'
        )

        # Overlay each camera onto grid
        prev = 'bg'
        for i in range(n):
            col = i % cols
            row = i // cols
            x = col * cell_w
            y = row * cell_h
            out_label = f'v{i}' if i < n - 1 else 'mosaic'
            parts.append(f'[{prev}][s{i}]overlay={x}:{y}:shortest=1[{out_label}]')
            prev = f'v{i}'

        # Split mosaic output for HLS + snapshot
        parts.append('[mosaic]split=2[hls][snap]')
        filter_complex = ';'.join(parts)

    snapshot_path = os.path.join(output_dir, 'snapshot.jpg')

    cmd.extend([
        '-filter_complex', filter_complex,
        # Output 1: HLS stream
        '-map', '[hls]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-r', str(config.fps),
        '-g', str(config.fps * 2),
        '-an',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '5',
        '-hls_flags', 'delete_segments+append_list',
        '-hls_segment_filename', os.path.join(output_dir, 'seg_%03d.ts'),
        output_path,
        # Output 2: JPEG snapshot (updated every 0.5 seconds)
        '-map', '[snap]',
        '-c:v', 'mjpeg',
        '-q:v', '5',
        '-r', '2',
        '-update', '1',
        '-f', 'image2',
        snapshot_path,
    ])

    return cmd


def build_rotation_command(config) -> list[str]:
    """Build ffmpeg command for rotation mode — one camera at a time, cycling via concat demuxer."""
    cameras = list(config.cameras.all())
    n = len(cameras)
    if n == 0:
        raise ValueError('No cameras configured')

    try:
        width, height = config.resolution.split('x')
        width, height = int(width), int(height)
    except (ValueError, AttributeError):
        width, height = 1920, 1080

    output_dir = os.path.join(CCTV_MEDIA_DIR, str(config.id))
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, 'stream.m3u8')

    # For rotation mode, we use the first camera and let the JS player handle rotation
    # by generating separate HLS streams per camera
    # Alternatively, we just output the first camera fullscreen and use JS rotation
    # Using per-camera approach with JS rotation on the player page
    per_camera_cmds = []
    for i, cam in enumerate(cameras):
        cam_dir = os.path.join(output_dir, f'cam_{i}')
        os.makedirs(cam_dir, exist_ok=True)
        cam_output = os.path.join(cam_dir, 'stream.m3u8')
        cmd = [
            'ffmpeg', '-y',
            '-rtsp_transport', 'tcp',
            '-timeout', '5000000',
            '-i', cam.rtsp_url,
            '-vf', f'scale={width}:{height}',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-r', str(config.fps),
            '-g', str(config.fps * 2),
            '-an',
            '-f', 'hls',
            '-hls_time', '2',
            '-hls_list_size', '5',
            '-hls_flags', 'delete_segments+append_list',
            '-hls_segment_filename', os.path.join(cam_dir, 'seg_%03d.ts'),
            cam_output,
        ]
        per_camera_cmds.append(cmd)

    # Return the first command — we'll start all of them in start_stream
    return per_camera_cmds


def _log_ffmpeg_stderr(proc, config_id: str, label: str):
    """Read ffmpeg stderr in a background thread and log it."""
    def _reader():
        try:
            for line in proc.stderr:
                line = line.decode('utf-8', errors='replace').strip()
                if line:
                    logger.debug('ffmpeg [%s/%s] %s', config_id[:8], label, line)
        except Exception:
            pass
    t = threading.Thread(target=_reader, daemon=True)
    t.start()


def start_stream(config_id: str):
    """Start ffmpeg stream(s) for a CCTV config."""
    from .models import CctvConfig

    config = CctvConfig.objects.prefetch_related('cameras').get(pk=config_id)

    # Stop any existing stream first
    stop_stream(config_id)

    if config.display_mode == 'rotation':
        cmds = build_rotation_command(config)
        pids = []
        for i, cmd in enumerate(cmds):
            logger.info('Starting ffmpeg rotation stream: %s', ' '.join(cmd[:6]) + '...')
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid,
            )
            _log_ffmpeg_stderr(proc, config_id, f'cam{i}')
            pids.append(proc.pid)
        # Store all PIDs as comma-separated
        cache.set(_get_pid_key(config_id), ','.join(str(p) for p in pids), timeout=None)
        logger.info('Started %d rotation streams for config %s, PIDs: %s', len(pids), config_id, pids)
    else:
        cmd = build_mosaic_command(config)
        logger.info('Starting ffmpeg mosaic stream: %s', ' '.join(cmd[:6]) + '...')
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            preexec_fn=os.setsid,
        )
        _log_ffmpeg_stderr(proc, config_id, 'mosaic')
        cache.set(_get_pid_key(config_id), str(proc.pid), timeout=None)
        logger.info('Started mosaic stream for config %s, PID: %d', config_id, proc.pid)


def stop_stream(config_id: str):
    """Stop ffmpeg stream(s) for a CCTV config."""
    pid_key = _get_pid_key(config_id)
    pid_str = cache.get(pid_key)
    if not pid_str:
        return

    pids = [int(p) for p in str(pid_str).split(',') if p.strip()]
    for pid in pids:
        try:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
            logger.info('Stopped ffmpeg process group for PID %d (config %s)', pid, config_id)
        except ProcessLookupError:
            logger.debug('ffmpeg process %d already gone (config %s)', pid, config_id)
        except Exception:
            logger.exception('Error stopping ffmpeg PID %d (config %s)', pid, config_id)

    cache.delete(pid_key)

    # Clean up HLS files
    output_dir = os.path.join(CCTV_MEDIA_DIR, str(config_id))
    if os.path.isdir(output_dir):
        shutil.rmtree(output_dir, ignore_errors=True)


def get_stream_status(config_id: str) -> dict:
    """Get status of ffmpeg stream for a CCTV config."""
    pid_str = cache.get(_get_pid_key(config_id))
    if not pid_str:
        return {'status': 'stopped', 'pids': []}

    pids = [int(p) for p in str(pid_str).split(',') if p.strip()]
    alive_pids = []
    for pid in pids:
        try:
            os.kill(pid, 0)  # Check if process exists
            alive_pids.append(pid)
        except ProcessLookupError:
            pass

    if alive_pids:
        return {'status': 'running', 'pids': alive_pids}

    # All processes died — clean up
    cache.delete(_get_pid_key(config_id))
    return {'status': 'stopped', 'pids': []}


def update_thumbnail(config_id: str):
    """Copy snapshot.jpg from ffmpeg output to MediaFile.thumbnail."""
    from .models import CctvConfig

    snapshot_path = os.path.join(CCTV_MEDIA_DIR, config_id, 'snapshot.jpg')
    if not os.path.isfile(snapshot_path):
        return

    try:
        config = CctvConfig.objects.select_related('media_file').get(pk=config_id)
    except CctvConfig.DoesNotExist:
        return

    if not config.media_file:
        return

    with open(snapshot_path, 'rb') as f:
        content = f.read()

    # Save snapshot as thumbnail on the MediaFile
    filename = f'cctv_{config_id[:8]}.jpg'
    if config.media_file.thumbnail:
        config.media_file.thumbnail.delete(save=False)
    config.media_file.thumbnail.save(filename, ContentFile(content), save=True)
