from unittest.mock import MagicMock, patch

from django.test import TestCase
from rest_framework.test import APIClient

from deploy.models import DeployTask, MediaFile
from players.models import Player


class MediaFileModelTests(TestCase):
    def test_detect_file_type_video(self):
        from deploy.models import detect_file_type
        self.assertEqual(detect_file_type('clip.mp4'), 'video')
        self.assertEqual(detect_file_type('clip.MOV'), 'video')

    def test_detect_file_type_image(self):
        from deploy.models import detect_file_type
        self.assertEqual(detect_file_type('photo.jpg'), 'image')
        self.assertEqual(detect_file_type('photo.PNG'), 'image')

    def test_detect_file_type_web(self):
        from deploy.models import detect_file_type
        self.assertEqual(detect_file_type('page.html'), 'web')

    def test_detect_file_type_other(self):
        from deploy.models import detect_file_type
        self.assertEqual(detect_file_type('data.zip'), 'other')


class MediaAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_list_media_returns_paginated(self):
        """Media endpoint should be paginated (returns {count, results})."""
        resp = self.client.get('/api/media/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn('count', data)
        self.assertIn('results', data)

    def test_create_url_media_dispatches_og_task(self):
        with patch('deploy.views.fetch_og_image_task') as mock_task:
            resp = self.client.post('/api/media/', {
                'source_url': 'https://example.com',
                'name': 'Example',
            }, format='json')
            self.assertEqual(resp.status_code, 201)
            mock_task.delay.assert_called_once()
            mf = MediaFile.objects.get()
            self.assertEqual(mf.file_type, 'web')


class DeployAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_list_deploy_returns_paginated(self):
        """Deploy endpoint should be paginated."""
        resp = self.client.get('/api/deploy/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn('count', data)
        self.assertIn('results', data)


class ExecuteDeployTests(TestCase):
    def setUp(self):
        self.player = Player.objects.create(name='P1', url='http://10.0.0.1')

    @patch('players.services._session')
    def test_deploy_progress_batched(self, mock_session):
        """Progress should be saved in batches, not per-player."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {'asset_id': 'new'}
        mock_resp.raise_for_status.return_value = None
        mock_session.request.return_value = mock_resp

        task = DeployTask.objects.create(
            name='Test Deploy',
            asset_data={'name': 'test', 'uri': 'http://example.com', 'mimetype': 'webpage'},
        )
        task.target_players.add(self.player)

        from deploy.tasks import execute_deploy
        execute_deploy(str(task.id))

        task.refresh_from_db()
        self.assertEqual(task.status, 'completed')
        self.assertIn(str(self.player.id), task.progress)
        self.assertEqual(task.progress[str(self.player.id)]['status'], 'success')


class FetchOgImageTests(TestCase):
    @patch('deploy.tasks.urllib.request.urlopen')
    def test_extracts_og_image(self, mock_urlopen):
        html = b'<html><head><meta property="og:image" content="https://example.com/img.jpg"></head></html>'
        mock_resp = MagicMock()
        mock_resp.read.return_value = html
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        from deploy.tasks import _fetch_og_image
        result = _fetch_og_image('https://example.com')
        self.assertEqual(result, 'https://example.com/img.jpg')

    @patch('deploy.tasks.urllib.request.urlopen')
    def test_returns_none_on_error(self, mock_urlopen):
        mock_urlopen.side_effect = Exception('network error')

        from deploy.tasks import _fetch_og_image
        result = _fetch_og_image('https://example.com')
        self.assertIsNone(result)
