import logging
import os
import re
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


def _trigger_watchtower():
    """Fire-and-forget Watchtower update trigger in background thread."""
    token = os.environ.get('WATCHTOWER_HTTP_API_TOKEN', 'fm-watchtower-2026')
    try:
        requests.get(
            'http://watchtower:8080/v1/update',
            headers={'Authorization': f'Bearer {token}'},
            timeout=60,
        )
    except Exception:
        pass  # container may be killed mid-request


@api_view(['POST'])
def system_update(request):
    """Trigger Watchtower update via HTTP API.

    Sends response immediately, then triggers Watchtower in background.
    This prevents the response from being lost when Watchtower restarts
    this container during the update.
    """
    token = os.environ.get('WATCHTOWER_HTTP_API_TOKEN', 'fm-watchtower-2026')
    # Quick health check — can we reach Watchtower at all?
    try:
        resp = requests.head(
            'http://watchtower:8080/',
            headers={'Authorization': f'Bearer {token}'},
            timeout=5,
        )
    except requests.RequestException:
        return Response(
            {'success': False, 'message': 'Cannot reach Watchtower service'},
            status=503,
        )

    # Watchtower is reachable — trigger update in background so response
    # reaches the client before this container gets restarted.
    threading.Thread(target=_trigger_watchtower, daemon=True).start()
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
    return Response({'auto_update': cache.get(AUTO_UPDATE_CACHE_KEY, True)})
