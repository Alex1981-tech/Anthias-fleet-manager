import logging

import requests
from django.conf import settings
from requests.adapters import HTTPAdapter
from requests.exceptions import ConnectionError, HTTPError, RetryError, Timeout
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


class PlayerConnectionError(Exception):
    """Raised when a player cannot be reached or returns an error."""

    def __init__(self, message, status_code=None, response_data=None):
        super().__init__(message)
        self.status_code = status_code
        self.response_data = response_data


def _build_session():
    """Build a requests.Session with retry/backoff on 5xx and 429."""
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=['GET', 'POST', 'PATCH', 'DELETE'],
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=10)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session


# Module-level shared session for connection pooling across requests.
_session = _build_session()


class AnthiasAPIClient:
    """Client for communicating with an Anthias player's HTTP API v2."""

    def __init__(self, player):
        self.player = player
        self.base_url = player.get_api_url()
        self.fallback_url = player.get_tailscale_url()
        self.timeout = getattr(settings, 'PLAYER_REQUEST_TIMEOUT', 10)

        self.auth = None
        if player.username:
            self.auth = (player.username, player.get_password())

    def _request(self, method, endpoint, **kwargs):
        """
        Make an HTTP request to the player's API.

        Uses a shared session with connection pooling and automatic
        retry with exponential backoff on 5xx/429.

        If the primary URL fails with a connection/timeout error and
        a Tailscale fallback URL is configured, retries via Tailscale.
        HTTP errors (4xx/5xx) do NOT trigger fallback — the player is
        reachable but returned an error.
        """
        url = f'{self.base_url}{endpoint}'
        kwargs.setdefault('timeout', self.timeout)
        if self.auth:
            kwargs.setdefault('auth', self.auth)

        try:
            return self._do_request(method, url, **kwargs)
        except PlayerConnectionError as primary_exc:
            # Only fallback on connection/timeout errors (no status_code)
            if primary_exc.status_code is not None or not self.fallback_url:
                raise
            # Try Tailscale fallback
            fallback_url = f'{self.fallback_url}{endpoint}'
            logger.info(
                'Primary URL failed for %s, trying Tailscale fallback: %s',
                self.player.name, fallback_url,
            )
            try:
                return self._do_request(method, fallback_url, **kwargs)
            except PlayerConnectionError:
                # Both failed — raise the original error
                raise primary_exc

    def _do_request(self, method, url, **kwargs):
        """Execute a single HTTP request and handle errors."""
        try:
            response = _session.request(method, url, **kwargs)
            response.raise_for_status()
            return response
        except ConnectionError as exc:
            logger.warning(
                'Connection error for player %s (%s): %s',
                self.player.name, url, exc,
            )
            raise PlayerConnectionError(
                f'Cannot connect to player {self.player.name} at {url}'
            ) from exc
        except Timeout as exc:
            logger.warning(
                'Timeout for player %s (%s): %s',
                self.player.name, url, exc,
            )
            raise PlayerConnectionError(
                f'Request to player {self.player.name} at {url} timed out'
            ) from exc
        except RetryError as exc:
            logger.warning(
                'Max retries exceeded for player %s (%s): %s',
                self.player.name, url, exc,
            )
            raise PlayerConnectionError(
                f'Player {self.player.name} at {url} returned repeated errors'
            ) from exc
        except HTTPError as exc:
            resp = exc.response
            code = resp.status_code
            logger.warning(
                'HTTP error from player %s (%s): %s',
                self.player.name, url, exc,
            )
            response_data = None
            try:
                response_data = resp.json()
            except (ValueError, AttributeError):
                pass
            raise PlayerConnectionError(
                f'Player {self.player.name} at {url} returned {code}',
                status_code=code,
                response_data=response_data,
            ) from exc

    def get_info(self):
        """GET /api/v2/info - Retrieve player information."""
        response = self._request('GET', '/api/v2/info')
        return response.json()

    def get_assets(self):
        """GET /api/v2/assets - Retrieve the list of assets on the player."""
        response = self._request('GET', '/api/v2/assets')
        return response.json()

    def get_device_settings(self):
        """GET /api/v2/device_settings - Retrieve device settings."""
        response = self._request('GET', '/api/v2/device_settings')
        return response.json()

    def update_device_settings(self, data):
        """PATCH /api/v2/device_settings - Update device settings."""
        response = self._request('PATCH', '/api/v2/device_settings', json=data)
        return response.json()

    def create_asset(self, data):
        """POST /api/v2/assets - Create a new asset on the player."""
        response = self._request('POST', '/api/v2/assets', json=data)
        return response.json()

    def update_asset(self, asset_id, data):
        """PATCH /api/v2/assets/{asset_id} - Update an existing asset."""
        response = self._request('PATCH', f'/api/v2/assets/{asset_id}', json=data)
        return response.json()

    def delete_asset(self, asset_id):
        """DELETE /api/v2/assets/{asset_id} - Delete an asset from the player."""
        self._request('DELETE', f'/api/v2/assets/{asset_id}')

    def upload_file(self, file_obj):
        """POST /api/v2/file_asset - Upload a file to the player (multipart)."""
        files = {'file_upload': file_obj}
        response = self._request('POST', '/api/v2/file_asset', files=files)
        return response.json()

    def reboot(self):
        """POST /api/v2/reboot - Reboot the player."""
        self._request('POST', '/api/v2/reboot')

    def shutdown(self):
        """POST /api/v2/shutdown - Shut down the player."""
        self._request('POST', '/api/v2/shutdown')

    def create_backup(self):
        """POST /api/v2/backup - Create a backup of the player's data."""
        response = self._request('POST', '/api/v2/backup')
        return response.text

    def set_playlist_order(self, ids_str):
        """POST /api/v2/assets/order - Set the playlist order."""
        self._request('POST', '/api/v2/assets/order', data={'ids': ids_str})

    def get_viewlog(self, since=None):
        """GET /api/v2/viewlog - Retrieve playback history from the player."""
        params = {}
        if since:
            params['since'] = since
        response = self._request('GET', '/api/v2/viewlog', params=params)
        return response.json()

    def get_screenshot(self):
        """GET /api/v2/screenshot - Capture and retrieve a screenshot."""
        response = self._request('GET', '/api/v2/screenshot', timeout=15)
        return response.content

    def control_asset(self, command):
        """GET /api/v2/assets/control/<command> - Control playback (next/previous)."""
        response = self._request('GET', f'/api/v2/assets/control/{command}')
        return response.text

    # ── Schedule Slots ──

    def get_schedule_slots(self):
        """GET /api/v2/schedule/slots - List all schedule slots."""
        response = self._request('GET', '/api/v2/schedule/slots')
        return response.json()

    def get_schedule_status(self):
        """GET /api/v2/schedule/status - Get current schedule status."""
        response = self._request('GET', '/api/v2/schedule/status')
        return response.json()

    def create_schedule_slot(self, data):
        """POST /api/v2/schedule/slots - Create a schedule slot."""
        response = self._request('POST', '/api/v2/schedule/slots', json=data)
        return response.json()

    def update_schedule_slot(self, slot_id, data):
        """PUT /api/v2/schedule/slots/{slot_id} - Update a schedule slot."""
        response = self._request('PUT', f'/api/v2/schedule/slots/{slot_id}', json=data)
        return response.json()

    def delete_schedule_slot(self, slot_id):
        """DELETE /api/v2/schedule/slots/{slot_id} - Delete a schedule slot."""
        self._request('DELETE', f'/api/v2/schedule/slots/{slot_id}')

    def get_slot_items(self, slot_id):
        """GET /api/v2/schedule/slots/{slot_id}/items - List items in a slot."""
        response = self._request('GET', f'/api/v2/schedule/slots/{slot_id}/items')
        return response.json()

    def add_slot_item(self, slot_id, data):
        """POST /api/v2/schedule/slots/{slot_id}/items - Add asset to slot."""
        response = self._request('POST', f'/api/v2/schedule/slots/{slot_id}/items', json=data)
        return response.json()

    def update_slot_item(self, slot_id, item_id, data):
        """PUT /api/v2/schedule/slots/{slot_id}/items/{item_id} - Update slot item."""
        response = self._request('PUT', f'/api/v2/schedule/slots/{slot_id}/items/{item_id}', json=data)
        return response.json()

    def delete_slot_item(self, slot_id, item_id):
        """DELETE /api/v2/schedule/slots/{slot_id}/items/{item_id} - Remove item."""
        self._request('DELETE', f'/api/v2/schedule/slots/{slot_id}/items/{item_id}')

    def reorder_slot_items(self, slot_id, ids):
        """POST /api/v2/schedule/slots/{slot_id}/items/order - Reorder items."""
        response = self._request(
            'POST', f'/api/v2/schedule/slots/{slot_id}/items/order', json={'ids': ids},
        )
        return response.json()

    def trigger_update(self):
        """POST /api/v2/update - Trigger Watchtower update on the player."""
        response = self._request('POST', '/api/v2/update')
        return response.json()

