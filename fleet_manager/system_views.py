import logging
import re
import subprocess
import threading

import requests
from django.conf import settings
from django.core.cache import cache
from rest_framework.decorators import api_view
from rest_framework.response import Response

logger = logging.getLogger(__name__)

GITHUB_REPO = 'Alex1981-tech/Anthias-fleet-manager'
UPDATE_CHECK_CACHE_KEY = 'system:latest_version'
UPDATE_CHECK_CACHE_TTL = 300  # 5 minutes
AUTO_UPDATE_CACHE_KEY = 'system:auto_update'
UPDATER_CONTAINER = 'anthias-fleet-manager-updater-1'

# Tailscale settings keys
TS_ENABLED_KEY = 'system:tailscale_enabled'
TS_AUTHKEY_KEY = 'system:tailscale_authkey'
TS_FM_IP_KEY = 'system:tailscale_fm_ip'


def _parse_version(version_str):
    """Parse version string like '1.2.3' into tuple (1, 2, 3) for comparison."""
    match = re.match(r'v?(\d+)\.(\d+)\.(\d+)', str(version_str))
    if match:
        return tuple(int(x) for x in match.groups())
    return (0, 0, 0)


def _fetch_latest_version():
    """Fetch latest version from GitHub releases, fallback to tags."""
    headers = {'Accept': 'application/vnd.github.v3+json'}

    # Try releases first
    try:
        resp = requests.get(
            f'https://api.github.com/repos/{GITHUB_REPO}/releases/latest',
            headers=headers,
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            return {
                'version': data.get('tag_name', '').lstrip('v'),
                'html_url': data.get('html_url', ''),
                'published_at': data.get('published_at', ''),
            }
    except requests.RequestException:
        pass

    # Fallback to tags
    try:
        resp = requests.get(
            f'https://api.github.com/repos/{GITHUB_REPO}/tags',
            headers=headers,
            timeout=10,
        )
        if resp.status_code == 200:
            tags = resp.json()
            if tags:
                tag_name = tags[0].get('name', '').lstrip('v')
                return {
                    'version': tag_name,
                    'html_url': f'https://github.com/{GITHUB_REPO}/releases/tag/{tags[0].get("name", "")}',
                    'published_at': '',
                }
    except requests.RequestException:
        pass

    return None


@api_view(['GET'])
def system_version(request):
    """Return current app version and build date."""
    return Response({
        'version': settings.APP_VERSION,
        'build_date': settings.BUILD_DATE,
    })


@api_view(['GET'])
def system_update_check(request):
    """Check GitHub for newer version. Cached for 5 minutes."""
    force = request.query_params.get('force', '').lower() in ('1', 'true')

    if not force:
        cached = cache.get(UPDATE_CHECK_CACHE_KEY)
        if cached is not None:
            # Recalculate update_available with current version
            # (cache may have been set by a previous container version)
            cached['current_version'] = settings.APP_VERSION
            if cached.get('latest_version'):
                cached['update_available'] = (
                    _parse_version(cached['latest_version'])
                    > _parse_version(settings.APP_VERSION)
                )
            return Response(cached)

    current = settings.APP_VERSION
    latest_info = _fetch_latest_version()

    if latest_info is None:
        return Response({
            'current_version': current,
            'latest_version': None,
            'update_available': False,
            'error': 'Failed to check for updates',
        })

    latest = latest_info['version']
    update_available = _parse_version(latest) > _parse_version(current)

    result = {
        'current_version': current,
        'latest_version': latest,
        'update_available': update_available,
        'release_url': latest_info.get('html_url', ''),
        'published_at': latest_info.get('published_at', ''),
    }

    cache.set(UPDATE_CHECK_CACHE_KEY, result, UPDATE_CHECK_CACHE_TTL)
    return Response(result)


def _get_docker_client():
    """Get Docker SDK client connected via mounted socket."""
    import docker
    return docker.from_env()


def _trigger_compose_update():
    """Pull new images and recreate services via docker compose in updater sidecar."""
    try:
        client = _get_docker_client()
        updater = client.containers.get(UPDATER_CONTAINER)
        cmd = (
            'docker compose pull web celery-worker celery-transcode celery-beat && '
            'docker compose up -d --no-deps --no-build web celery-worker celery-transcode celery-beat'
        )
        updater.exec_run(['sh', '-c', cmd], workdir='/project', detach=True)
    except Exception as e:
        logger.error('Compose update failed: %s', e)


@api_view(['POST'])
def system_update(request):
    """Trigger update via docker compose in updater sidecar.

    Sends response immediately, then triggers compose pull + up in background.
    This prevents the response from being lost when compose recreates
    this container during the update.
    """
    try:
        client = _get_docker_client()
        updater = client.containers.get(UPDATER_CONTAINER)
        if updater.status != 'running':
            return Response(
                {'success': False, 'message': 'Updater service is not running'},
                status=503,
            )
    except Exception:
        return Response(
            {'success': False, 'message': 'Cannot reach updater service'},
            status=503,
        )

    # Clear update cache so the check refreshes after container restart
    cache.delete(UPDATE_CHECK_CACHE_KEY)

    from deploy.audit import log_action
    log_action(request, 'trigger_update', 'system')

    # Trigger in background so response reaches client before container restart
    threading.Thread(target=_trigger_compose_update, daemon=True).start()
    return Response({'success': True, 'message': 'Update triggered'})


@api_view(['GET', 'PATCH'])
def system_settings(request):
    """Get or update system settings (auto_update toggle)."""
    if request.method == 'GET':
        auto_update = cache.get(AUTO_UPDATE_CACHE_KEY, True)
        return Response({'auto_update': auto_update})

    auto_update = request.data.get('auto_update')
    if auto_update is not None:
        cache.set(AUTO_UPDATE_CACHE_KEY, bool(auto_update), None)
        from deploy.audit import log_action
        log_action(request, 'update', 'settings', target_name='auto_update', details={'auto_update': bool(auto_update)})
    return Response({'auto_update': cache.get(AUTO_UPDATE_CACHE_KEY, True)})


def _get_fernet():
    """Return a Fernet instance for encrypting Tailscale auth key."""
    import base64
    import hashlib
    from cryptography.fernet import Fernet
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def _detect_tailscale_ip():
    """Try to detect the local Tailscale IPv4 address."""
    try:
        result = subprocess.run(
            ['tailscale', 'ip', '-4'],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return ''


def _get_tailscale_status():
    """Check if Tailscale is connected."""
    try:
        result = subprocess.run(
            ['tailscale', 'status', '--json'],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            import json
            data = json.loads(result.stdout)
            backend = data.get('BackendState', '')
            return 'connected' if backend == 'Running' else 'disconnected'
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError, KeyError):
        pass
    return 'not_installed'


@api_view(['GET', 'PATCH'])
def tailscale_settings(request):
    """Get or update Tailscale VPN settings."""
    if request.method == 'GET':
        detected_ip = _detect_tailscale_ip()
        ts_status = _get_tailscale_status()
        has_authkey = bool(cache.get(TS_AUTHKEY_KEY))
        return Response({
            'tailscale_enabled': cache.get(TS_ENABLED_KEY, False),
            'has_authkey': has_authkey,
            'fm_tailscale_ip': cache.get(TS_FM_IP_KEY, '') or detected_ip,
            'detected_ip': detected_ip,
            'status': ts_status,
        })

    # PATCH
    ts_enabled = request.data.get('tailscale_enabled')
    if ts_enabled is not None:
        cache.set(TS_ENABLED_KEY, bool(ts_enabled), None)

    authkey = request.data.get('authkey')
    if authkey is not None:
        if authkey:
            f = _get_fernet()
            encrypted = f.encrypt(authkey.encode()).decode()
            cache.set(TS_AUTHKEY_KEY, encrypted, None)
        else:
            cache.delete(TS_AUTHKEY_KEY)

    fm_ip = request.data.get('fm_tailscale_ip')
    if fm_ip is not None:
        cache.set(TS_FM_IP_KEY, fm_ip, None)

    from deploy.audit import log_action
    log_action(request, 'update', 'settings', target_name='tailscale', details={k: v for k, v in request.data.items() if k != 'authkey'})

    detected_ip = _detect_tailscale_ip()
    return Response({
        'tailscale_enabled': cache.get(TS_ENABLED_KEY, False),
        'has_authkey': bool(cache.get(TS_AUTHKEY_KEY)),
        'fm_tailscale_ip': cache.get(TS_FM_IP_KEY, '') or detected_ip,
        'detected_ip': detected_ip,
        'status': _get_tailscale_status(),
    })
