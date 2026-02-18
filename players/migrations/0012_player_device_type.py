from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('players', '0011_bulkprovisiontask'),
    ]

    operations = [
        migrations.AddField(
            model_name='player',
            name='device_type',
            field=models.CharField(
                blank=True,
                choices=[('pi4', 'Raspberry Pi 4'), ('pi5', 'Raspberry Pi 5'), ('unknown', 'Unknown')],
                default='unknown',
                help_text='Detected hardware type (pi4, pi5).',
                max_length=10,
            ),
        ),
    ]
