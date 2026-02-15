from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Group, PlaybackLog, Player, PlayerSnapshot
from .services import AnthiasAPIClient, PlayerConnectionError


class PlayerModelTests(TestCase):
    def test_url_unique_constraint(self):
        Player.objects.create(name='P1', url='http://10.0.0.1')
        with self.assertRaises(Exception):
            Player.objects.create(name='P2', url='http://10.0.0.1')

    def test_password_encryption_roundtrip(self):
        p = Player(name='Test', url='http://10.0.0.1')
        p.set_password('secret123')
        p.save()
        self.assertNotEqual(p.password, 'secret123')
        self.assertEqual(p.get_password(), 'secret123')

    def test_empty_password(self):
        p = Player(name='Test', url='http://10.0.0.1')
        p.set_password('')
        self.assertEqual(p.password, '')
        self.assertEqual(p.get_password(), '')

    def test_get_api_url_strips_trailing_slash(self):
        p = Player(name='Test', url='http://10.0.0.1/')
        self.assertEqual(p.get_api_url(), 'http://10.0.0.1')


class PlaybackLogDedupTests(TestCase):
    def setUp(self):
        self.player = Player.objects.create(name='P1', url='http://10.0.0.1')

    def test_unique_constraint_prevents_dupes(self):
        ts = timezone.now()
        PlaybackLog.objects.create(
            player=self.player, asset_id='a1', asset_name='Asset1',
            event='started', timestamp=ts,
        )
        # bulk_create with ignore_conflicts should not raise
        dupes = [PlaybackLog(
            player=self.player, asset_id='a1', asset_name='Asset1',
            event='started', timestamp=ts,
        )]
        PlaybackLog.objects.bulk_create(dupes, ignore_conflicts=True)
        self.assertEqual(PlaybackLog.objects.count(), 1)


class PlayerAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_list_players_returns_array(self):
        """Players endpoint should NOT be paginated (returns plain array)."""
        Player.objects.create(name='P1', url='http://10.0.0.1')
        resp = self.client.get('/api/players/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.json(), list)

    def test_create_player(self):
        resp = self.client.post('/api/players/', {
            'name': 'Test', 'url': 'http://10.0.0.1',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(Player.objects.count(), 1)

    def test_register_player_creates(self):
        resp = self.client.post('/api/players/register/', {
            'url': 'http://10.0.0.1', 'name': 'Auto',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()['status'], 'created')

    def test_register_player_updates_existing(self):
        Player.objects.create(name='Existing', url='http://10.0.0.1')
        resp = self.client.post('/api/players/register/', {
            'url': 'http://10.0.0.1', 'name': 'Unknown', 'info': {'ver': '1'},
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['status'], 'updated')
        # Name should NOT be overwritten by heartbeat
        p = Player.objects.get(url='http://10.0.0.1')
        self.assertEqual(p.name, 'Existing')

    def test_register_player_missing_url(self):
        resp = self.client.post('/api/players/register/', {
            'name': 'No URL',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_groups_list_returns_array(self):
        """Groups endpoint should NOT be paginated."""
        resp = self.client.get('/api/groups/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsInstance(resp.json(), list)


class AnthiasAPIClientTests(TestCase):
    def setUp(self):
        self.player = Player.objects.create(
            name='Test', url='http://10.0.0.1',
        )
        self.api = AnthiasAPIClient(self.player)

    @patch('players.services._session')
    def test_get_info_success(self, mock_session):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {'up_time': '1:00'}
        mock_resp.raise_for_status.return_value = None
        mock_session.request.return_value = mock_resp

        result = self.api.get_info()
        self.assertEqual(result, {'up_time': '1:00'})
        mock_session.request.assert_called_once()

    @patch('players.services._session')
    def test_connection_error_raises_custom(self, mock_session):
        from requests.exceptions import ConnectionError
        mock_session.request.side_effect = ConnectionError('refused')
        with self.assertRaises(PlayerConnectionError):
            self.api.get_info()

    @patch('players.services._session')
    def test_timeout_raises_custom(self, mock_session):
        from requests.exceptions import Timeout
        mock_session.request.side_effect = Timeout('timed out')
        with self.assertRaises(PlayerConnectionError):
            self.api.get_info()

    def test_auth_set_when_username_present(self):
        self.player.username = 'admin'
        self.player.set_password('pass')
        self.player.save()
        api = AnthiasAPIClient(self.player)
        self.assertIsNotNone(api.auth)
        self.assertEqual(api.auth[0], 'admin')


class PollPlayerTaskTests(TestCase):
    def setUp(self):
        self.player = Player.objects.create(
            name='P1', url='http://10.0.0.1',
        )

    @patch('players.services._session')
    def test_poll_marks_online(self, mock_session):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {'up_time': '1:00', 'assets_count': 2}
        mock_resp.raise_for_status.return_value = None
        mock_session.request.return_value = mock_resp

        from .tasks import poll_player
        poll_player(str(self.player.id))

        self.player.refresh_from_db()
        self.assertTrue(self.player.is_online)
        self.assertIsNotNone(self.player.last_seen)
        self.assertEqual(PlayerSnapshot.objects.count(), 1)

    @patch('players.services._session')
    def test_poll_marks_offline_on_connection_error(self, mock_session):
        from requests.exceptions import ConnectionError
        mock_session.request.side_effect = ConnectionError('refused')

        from .tasks import poll_player
        poll_player(str(self.player.id))

        self.player.refresh_from_db()
        self.assertFalse(self.player.is_online)

    @patch('players.services._session')
    def test_playback_error_does_not_affect_online_status(self, mock_session):
        """Critical fix: playback tracking failure must not set player offline."""
        info_resp = MagicMock()
        info_resp.json.return_value = {'up_time': '1:00'}
        info_resp.raise_for_status.return_value = None

        viewlog_resp = MagicMock()
        viewlog_resp.json.side_effect = Exception('viewlog parse error')
        viewlog_resp.raise_for_status.return_value = None

        def side_effect(method, url, **kwargs):
            if 'viewlog' in url:
                return viewlog_resp
            return info_resp

        mock_session.request.side_effect = side_effect

        from .tasks import poll_player
        poll_player(str(self.player.id))

        self.player.refresh_from_db()
        self.assertTrue(self.player.is_online)  # Must stay online!
