import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('players', '0010_player_mac_address'),
    ]

    operations = [
        migrations.CreateModel(
            name='BulkProvisionTask',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('status', models.CharField(choices=[
                    ('pending', 'Pending'), ('scanning', 'Scanning'),
                    ('provisioning', 'Provisioning'), ('completed', 'Completed'),
                    ('failed', 'Failed'),
                ], default='pending', max_length=20)),
                ('scan_method', models.CharField(default='arp', max_length=20)),
                ('ip_range_start', models.GenericIPAddressField(blank=True, null=True)),
                ('ip_range_end', models.GenericIPAddressField(blank=True, null=True)),
                ('discovered_ips', models.JSONField(default=list)),
                ('selected_ips', models.JSONField(default=list)),
                ('ssh_user', models.CharField(default='pi', max_length=100)),
                ('ssh_password_encrypted', models.CharField(blank=True, default='', max_length=500)),
                ('results', models.JSONField(default=dict)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
