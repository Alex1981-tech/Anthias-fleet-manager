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


def has_web_sources(config) -> bool:
    """Check if config has any web-type camera sources."""
    return config.cameras.filter(source_type='web').exists()


def build_mosaic_command(config) -> list[str]:
    """Build ffmpeg command for mosaic mode (RTSP-only).

    Filters out any web-type cameras as a safety net — if web sources
    are present, callers should use build_grid_commands() instead.
    """
    all_cameras = list(config.cameras.all())
    cameras = [cam for cam in all_cameras if cam.source_type != 'web']
    n = len(cameras)
    if n == 0:
        raise ValueError('No RTSP cameras configured')

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

    # Input streams (RTSP only)
    for cam in cameras:
        cmd.extend([
            '-rtsp_transport', 'tcp',
            '-timeout', '5000000',
            '-i', cam.rtsp_url,
        ])

    if n == 1:
        filter_complex = (
            f'[0:v]scale={width}:{height},setpts=PTS-STARTPTS,split=2[hls][snap]'
        )
    else:
        parts = []
        for i in range(n):
            parts.append(f'[{i}:v]scale={cell_w}:{cell_h},setpts=PTS-STARTPTS[s{i}]')

        parts.append(
            f'color=c=black:s={width}x{height}:r={config.fps}[bg]'
        )

        prev = 'bg'
        for i in range(n):
            col = i % cols
            row = i // cols
            x = col * cell_w
            y = row * cell_h
            out_label = f'v{i}' if i < n - 1 else 'mosaic'
            parts.append(f'[{prev}][s{i}]overlay={x}:{y}:shortest=1[{out_label}]')
            prev = f'v{i}'

        parts.append('[mosaic]split=2[hls][snap]')
        filter_complex = ';'.join(parts)

    snapshot_path = os.path.join(output_dir, 'snapshot.jpg')

    cmd.extend([
        '-filter_complex', filter_complex,
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
        '-map', '[snap]',
        '-c:v', 'mjpeg',
        '-q:v', '5',
        '-r', '2',
        '-update', '1',
        '-f', 'image2',
        snapshot_path,
    ])

    return cmd


def build_grid_commands(config) -> list[list[str]]:
    """Build per-camera HLS + snapshot commands for grid mode (mixed RTSP + web).

    Each camera is scaled to CELL size (not full resolution) to reduce CPU load.
    """
    cameras = list(config.cameras.all())
    rtsp_cameras = [(i, cam) for i, cam in enumerate(cameras) if cam.source_type == 'rtsp']

    if not rtsp_cameras:
        return []

    try:
        width, height = config.resolution.split('x')
        width, height = int(width), int(height)
    except (ValueError, AttributeError):
        width, height = 1920, 1080

    cols, rows = _calc_grid(len(cameras))
    cell_w = width // cols
    cell_h = height // rows

    output_dir = os.path.join(CCTV_MEDIA_DIR, str(config.id))
    os.makedirs(output_dir, exist_ok=True)

    cmds = []
    for cam_idx, cam in rtsp_cameras:
        cam_dir = os.path.join(output_dir, f'cam_{cam_idx}')
        os.makedirs(cam_dir, exist_ok=True)
        cam_output = os.path.join(cam_dir, 'stream.m3u8')
        snapshot_path = os.path.join(output_dir, f'cam_{cam_idx}.jpg')
        cmd = [
            'ffmpeg', '-y',
            '-rtsp_transport', 'tcp',
            '-timeout', '5000000',
            '-i', cam.rtsp_url,
            '-filter_complex',
            f'[0:v]scale={cell_w}:{cell_h},setpts=PTS-STARTPTS,split=2[hls][snap]',
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
            '-hls_segment_filename', os.path.join(cam_dir, 'seg_%03d.ts'),
            cam_output,
            '-map', '[snap]',
            '-c:v', 'mjpeg',
            '-q:v', '5',
            '-r', '0.5',
            '-update', '1',
            '-f', 'image2',
            snapshot_path,
        ]
        cmds.append(cmd)

    return cmds


def build_rotation_command(config) -> list[list[str]]:
    """Build ffmpeg command for rotation mode — per-camera HLS streams."""
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

    per_camera_cmds = []
    for i, cam in enumerate(cameras):
        if cam.source_type == 'web':
            continue  # Web cameras don't need ffmpeg in rotation mode
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

    output_dir = os.path.join(CCTV_MEDIA_DIR, str(config_id))
    os.makedirs(output_dir, exist_ok=True)

    if config.display_mode == 'mosaic' and has_web_sources(config):
        # Grid mode: per-camera HLS + snapshot for RTSP cameras
        cmds = build_grid_commands(config)
        if not cmds:
            # All web, no ffmpeg needed — create placeholder snapshot
            _create_placeholder_snapshot(config_id)
            logger.info('Grid mode (all web): no ffmpeg for config %s', config_id)
            return
        pids = []
        for i, cmd in enumerate(cmds):
            logger.info('Starting ffmpeg grid HLS: %s', ' '.join(cmd[:6]) + '...')
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid,
            )
            _log_ffmpeg_stderr(proc, config_id, f'grid{i}')
            pids.append(proc.pid)
        cache.set(_get_pid_key(config_id), ','.join(str(p) for p in pids), timeout=None)
        logger.info('Started %d grid HLS streams for config %s', len(pids), config_id)

    elif config.display_mode == 'rotation':
        cmds = build_rotation_command(config)
        if not cmds:
            logger.info('Rotation mode: no RTSP cameras for config %s', config_id)
            return
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
        cache.set(_get_pid_key(config_id), ','.join(str(p) for p in pids), timeout=None)
        logger.info('Started %d rotation streams for config %s, PIDs: %s', len(pids), config_id, pids)
    else:
        # Pure RTSP mosaic
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


def _create_placeholder_snapshot(config_id: str):
    """Create a small black placeholder snapshot.jpg for health-check."""
    output_dir = os.path.join(CCTV_MEDIA_DIR, str(config_id))
    os.makedirs(output_dir, exist_ok=True)
    snapshot_path = os.path.join(output_dir, 'snapshot.jpg')
    # 1x1 black JPEG
    try:
        subprocess.run(
            ['ffmpeg', '-y', '-f', 'lavfi', '-i',
             'color=c=black:s=320x180:d=0.1',
             '-frames:v', '1', snapshot_path],
            capture_output=True, timeout=5,
        )
    except Exception:
        # Fallback: write minimal bytes
        with open(snapshot_path, 'wb') as f:
            f.write(b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9')


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
            os.kill(pid, 0)
            alive_pids.append(pid)
        except ProcessLookupError:
            pass

    if alive_pids:
        return {'status': 'running', 'pids': alive_pids}

    cache.delete(_get_pid_key(config_id))
    return {'status': 'stopped', 'pids': []}


def stitch_grid_snapshot(config_id: str):
    """Combine per-camera cam_N.jpg files into a single snapshot.jpg mosaic.

    Used in grid mode where each RTSP camera produces its own snapshot.
    The resulting snapshot.jpg is used for the live preview on the player page.
    """
    from .models import CctvConfig

    output_dir = os.path.join(CCTV_MEDIA_DIR, config_id)
    if not os.path.isdir(output_dir):
        return False

    try:
        config = CctvConfig.objects.prefetch_related('cameras').get(pk=config_id)
    except CctvConfig.DoesNotExist:
        return False

    cameras = list(config.cameras.all())
    n = len(cameras)
    if n <= 1:
        return False

    # Collect existing per-camera snapshots
    cam_files = []
    for i in range(n):
        cam_path = os.path.join(output_dir, f'cam_{i}.jpg')
        if os.path.isfile(cam_path):
            cam_files.append((i, cam_path))

    if not cam_files:
        return False

    try:
        width, height = config.resolution.split('x')
        width, height = int(width), int(height)
    except (ValueError, AttributeError):
        width, height = 1920, 1080

    cols, rows = _calc_grid(n)
    cell_w = width // cols
    cell_h = height // rows

    # Build ffmpeg command to create mosaic from JPEG files
    cmd = ['ffmpeg', '-y']
    for _, path in cam_files:
        cmd.extend(['-i', path])

    num_inputs = len(cam_files)
    parts = []
    for idx, (cam_idx, _) in enumerate(cam_files):
        parts.append(f'[{idx}:v]scale={cell_w}:{cell_h}[s{idx}]')

    parts.append(f'color=c=black:s={width}x{height}[bg]')

    prev = 'bg'
    for idx, (cam_idx, _) in enumerate(cam_files):
        col = cam_idx % cols
        row = cam_idx // cols
        x = col * cell_w
        y = row * cell_h
        out_label = f'v{idx}' if idx < num_inputs - 1 else 'out'
        parts.append(f'[{prev}][s{idx}]overlay={x}:{y}[{out_label}]')
        prev = f'v{idx}'

    filter_complex = ';'.join(parts)
    snapshot_path = os.path.join(output_dir, 'snapshot.jpg')

    cmd.extend([
        '-filter_complex', filter_complex,
        '-map', '[out]',
        '-frames:v', '1',
        '-q:v', '5',
        snapshot_path,
    ])

    try:
        subprocess.run(cmd, capture_output=True, timeout=10)
        return True
    except Exception:
        logger.debug('Failed to stitch grid snapshot for %s', config_id)
        return False


def update_thumbnail(config_id: str):
    """Copy snapshot.jpg from ffmpeg output to MediaFile.thumbnail."""
    from .models import CctvConfig

    # Try main snapshot first, then first per-camera snapshot
    output_dir = os.path.join(CCTV_MEDIA_DIR, config_id)
    snapshot_path = os.path.join(output_dir, 'snapshot.jpg')
    if not os.path.isfile(snapshot_path):
        # Try first per-camera snapshot
        for i in range(20):
            cam_path = os.path.join(output_dir, f'cam_{i}.jpg')
            if os.path.isfile(cam_path):
                snapshot_path = cam_path
                break
        else:
            return

    try:
        config = CctvConfig.objects.select_related('media_file').get(pk=config_id)
    except CctvConfig.DoesNotExist:
        return

    if not config.media_file:
        return

    with open(snapshot_path, 'rb') as f:
        content = f.read()

    filename = f'cctv_{config_id[:8]}.jpg'
    if config.media_file.thumbnail:
        config.media_file.thumbnail.delete(save=False)
    config.media_file.thumbnail.save(filename, ContentFile(content), save=True)
