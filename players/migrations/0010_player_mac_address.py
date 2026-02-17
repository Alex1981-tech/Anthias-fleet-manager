"""Add mac_address field to Player and populate from last_status."""

from django.db import migrations, models

INVALID_MAC = 'Unable to retrieve MAC address.'


def populate_mac_from_status(apps, schema_editor):
    """Fill mac_address from last_status['mac_address'] for existing players."""
    Player = apps.get_model('players', 'Player')
    for player in Player.objects.all():
        mac = ''
        if isinstance(player.last_status, dict):
            mac = player.last_status.get('mac_address', '')
        if mac and mac != INVALID_MAC:
            player.mac_address = mac.lower().strip()
            player.save(update_fields=['mac_address'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('players', '0009_setup_poll_periodic_task'),
    ]

    operations = [
        migrations.AddField(
            model_name='player',
            name='mac_address',
            field=models.CharField(
                blank=True,
                db_index=True,
                default='',
                help_text='Hardware MAC address (e.g. b8:27:eb:xx:xx:xx). Used for device identity.',
                max_length=17,
            ),
        ),
        migrations.RunPython(populate_mac_from_status, noop),
    ]
