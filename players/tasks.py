import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0)
def poll_player(self, player_id):
    """
    Poll a single player for its current status.

    Fetches /v2/info from the player, updates is_online, last_seen,
    and last_status fields on the Player model.
    """
    from .models import Player
    from .services import AnthiasAPIClient, PlayerConnectionError

    try:
        player = Player.objects.get(pk=player_id)
    except Player.DoesNotExist:
        logger.warning('poll_player called for non-existent player: %s', player_id)
        return

    client = AnthiasAPIClient(player)
    try:
        info = client.get_info()
        player.is_online = True
        player.last_seen = timezone.now()
        player.last_status = info
        player.save(update_fields=['is_online', 'last_seen', 'last_status'])

        # Save snapshot for history
        from .models import PlayerSnapshot
        PlayerSnapshot.objects.create(
            player=player,
            data=info,
            assets_count=info.get('assets_count', 0),
            free_space=info.get('free_space', ''),
            load_avg=info.get('loadavg', 0.0),
            is_online=True,
        )

        logger.info('Player %s (%s) is online.', player.name, player.id)

    except PlayerConnectionError:
        player.is_online = False
        player.save(update_fields=['is_online'])

        from .models import PlayerSnapshot
        PlayerSnapshot.objects.create(
            player=player,
            is_online=False,
        )

        logger.info('Player %s (%s) is offline.', player.name, player.id)

    # Track playback in a separate try/except — errors here must NOT
    # affect the player's online status which was already saved above.
    try:
        _track_playback(player, client)
    except Exception:
        logger.exception(
            'Error tracking playback for player %s (%s), player status unaffected.',
            player.name, player.id,
        )


def _track_playback(player, client):
    """Fetch viewlog from player and store new entries."""
    from .models import PlaybackLog

    try:
        since = player.last_viewlog_fetch or None
        entries = client.get_viewlog(since=since)
    except Exception:
        logger.debug('Could not fetch viewlog for %s', player.name)
        return

    if not entries:
        return

    latest_ts = None
    logs_to_create = []
    for entry in entries:
        if not isinstance(entry, dict):
            logger.warning('Skipping malformed viewlog entry for %s: %r', player.name, entry)
            continue
        started_at = entry.get('started_at', '')
        if not started_at:
            continue
        logs_to_create.append(PlaybackLog(
            player=player,
            asset_id=entry.get('asset_id', ''),
            asset_name=entry.get('asset_name', ''),
            mimetype=entry.get('mimetype', ''),
            event='started',
            timestamp=started_at,
        ))
        if not latest_ts or started_at > latest_ts:
            latest_ts = started_at

    if logs_to_create:
        PlaybackLog.objects.bulk_create(logs_to_create, ignore_conflicts=True)

    update_fields = []
    if latest_ts:
        player.last_viewlog_fetch = latest_ts
        update_fields.append('last_viewlog_fetch')
    if not player.history_tracking_since:
        player.history_tracking_since = timezone.now()
        update_fields.append('history_tracking_since')
    if update_fields:
        player.save(update_fields=update_fields)


@shared_task
def poll_all_players():
    """
    Poll all registered players for their current status.

    Dispatches a poll_player task for each player in the database.
    Uses a Redis lock to prevent overlapping poll cycles.
    """
    from django.core.cache import cache
    from .models import Player

    lock_id = 'poll_all_players_lock'
    # TTL as safety net; lock is released explicitly after dispatch
    if not cache.add(lock_id, 'locked', timeout=300):
        logger.info('poll_all_players skipped — previous cycle still running.')
        return

    try:
        player_ids = list(Player.objects.values_list('id', flat=True))
        logger.info('Polling %d player(s).', len(player_ids))

        for player_id in player_ids:
            poll_player.delay(str(player_id))
    finally:
        cache.delete(lock_id)
