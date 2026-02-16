import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('deploy', '0007_mediafolder_mediafile_folder'),
    ]

    operations = [
        migrations.CreateModel(
            name='CctvConfig',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=255)),
                ('display_mode', models.CharField(choices=[('mosaic', 'Mosaic'), ('rotation', 'Rotation')], default='mosaic', max_length=10)),
                ('rotation_interval', models.IntegerField(default=10)),
                ('resolution', models.CharField(default='1920x1080', max_length=20)),
                ('fps', models.IntegerField(default=15)),
                ('username', models.CharField(blank=True, default='', max_length=255)),
                ('password', models.CharField(blank=True, default='', max_length=255)),
                ('is_active', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='CctvCamera',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(blank=True, default='', max_length=255)),
                ('rtsp_url', models.TextField()),
                ('sort_order', models.IntegerField(default=0)),
                ('config', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cameras', to='deploy.cctvconfig')),
            ],
            options={
                'ordering': ['sort_order'],
            },
        ),
    ]
