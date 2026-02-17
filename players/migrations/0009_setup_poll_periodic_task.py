"""Create poll_all_players periodic task for django_celery_beat."""

from django.db import migrations


def create_poll_task(apps, schema_editor):
    IntervalSchedule = apps.get_model('django_celery_beat', 'IntervalSchedule')
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')

    interval, _ = IntervalSchedule.objects.get_or_create(
        every=60,
        period='seconds',
    )
    PeriodicTask.objects.get_or_create(
        name='poll-all-players',
        defaults={
            'task': 'players.tasks.poll_all_players',
            'interval': interval,
            'enabled': True,
        },
    )


def remove_poll_task(apps, schema_editor):
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    PeriodicTask.objects.filter(name='poll-all-players').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('players', '0008_player_tailscale_enabled_player_tailscale_ip_and_more'),
        ('django_celery_beat', '0018_improve_crontab_helptext'),
    ]

    operations = [
        migrations.RunPython(create_poll_task, remove_poll_task),
    ]
