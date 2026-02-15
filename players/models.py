import logging
import uuid

from cryptography.fernet import Fernet
from django.conf import settings
from django.db import models

logger = logging.getLogger(__name__)


def _get_fernet():
    """Return a Fernet instance using the Django SECRET_KEY as the basis."""
    import base64
    import hashlib
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


class Group(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, default='#8819C7')
    description = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Player(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    url = models.URLField(
        unique=True,
        help_text="The player's base URL, e.g. http://192.168.1.10",
    )
    username = models.CharField(max_length=100, blank=True, default='')
    password = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text='Stored encrypted.',
    )
    group = models.ForeignKey(
        Group,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='players',
    )
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(null=True, blank=True)
    last_status = models.JSONField(default=dict, blank=True)
    auto_registered = models.BooleanField(default=False)
    active_assets_cache = models.JSONField(
        default=dict, blank=True,
        help_text='Cached {asset_id: {name, mimetype}} for playback tracking.',
    )
    history_tracking_since = models.DateTimeField(
        null=True, blank=True,
        help_text='When playback tracking started for this player.',
    )
    last_viewlog_fetch = models.CharField(
        max_length=50, blank=True, default='',
        help_text='ISO timestamp of last fetched viewlog entry from player.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def get_api_url(self):
        """Return the player URL stripped of any trailing slash."""
        return self.url.rstrip('/')

    def set_password(self, raw_password):
        """Encrypt and store the password."""
        if raw_password:
            f = _get_fernet()
            self.password = f.encrypt(raw_password.encode()).decode()
        else:
            self.password = ''

    def get_password(self):
        """Decrypt and return the stored password."""
        if not self.password:
            return ''
        try:
            f = _get_fernet()
            return f.decrypt(self.password.encode()).decode()
        except Exception:
            logger.warning(
                'Failed to decrypt password for player %s (%s). '
                'This may indicate a SECRET_KEY rotation.',
                self.name, self.pk,
            )
            return ''


class PlayerSnapshot(models.Model):
    """Historical snapshot of a player's status, saved during each poll."""
    id = models.BigAutoField(primary_key=True)
    player = models.ForeignKey(
        Player,
        on_delete=models.CASCADE,
        related_name='snapshots',
    )
    data = models.JSONField(default=dict, help_text='Full /v2/info response.')
    assets_count = models.IntegerField(default=0)
    free_space = models.CharField(max_length=50, blank=True, default='')
    load_avg = models.FloatField(default=0.0)
    is_online = models.BooleanField(default=False)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['player', '-timestamp']),
        ]

    def __str__(self):
        return f'{self.player.name} @ {self.timestamp}'


class PlaybackLog(models.Model):
    """Log of asset playback events detected during polling."""
    id = models.BigAutoField(primary_key=True)
    player = models.ForeignKey(
        Player,
        on_delete=models.CASCADE,
        related_name='playback_logs',
    )
    asset_id = models.CharField(max_length=100)
    asset_name = models.CharField(max_length=200)
    mimetype = models.CharField(max_length=50, blank=True, default='')
    event = models.CharField(
        max_length=20,
        choices=[('started', 'Started'), ('stopped', 'Stopped')],
        default='started',
    )
    timestamp = models.DateTimeField()

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['player', '-timestamp']),
            models.Index(fields=['-timestamp']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['player', 'asset_id', 'timestamp', 'event'],
                name='unique_playback_entry',
            ),
        ]

    def __str__(self):
        return f'{self.player.name} — {self.asset_name} [{self.event}]'
