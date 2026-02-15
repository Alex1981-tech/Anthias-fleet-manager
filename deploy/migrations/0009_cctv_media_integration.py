import django.db.models.deletion
from django.db import migrations, models


def create_media_files_for_existing_configs(apps, schema_editor):
    """Create MediaFile for each existing CctvConfig."""
    CctvConfig = apps.get_model('deploy', 'CctvConfig')
    MediaFile = apps.get_model('deploy', 'MediaFile')
    import uuid

    for config in CctvConfig.objects.all():
        media_file = MediaFile.objects.create(
            id=uuid.uuid4(),
            name=config.name,
            source_url=f'/cctv/{config.id}/',
            file_type='cctv',
            file_size=0,
        )
        config.media_file = media_file
        config.save(update_fields=['media_file'])


class Migration(migrations.Migration):

    dependencies = [
        ('deploy', '0008_cctvconfig_cctvamera'),
    ]

    operations = [
        # Add media_file FK and last_requested_at to CctvConfig
        migrations.AddField(
            model_name='cctvconfig',
            name='media_file',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='cctv_config',
                to='deploy.mediafile',
            ),
        ),
        migrations.AddField(
            model_name='cctvconfig',
            name='last_requested_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        # Remove username and password from CctvConfig
        migrations.RemoveField(
            model_name='cctvconfig',
            name='username',
        ),
        migrations.RemoveField(
            model_name='cctvconfig',
            name='password',
        ),
        # Data migration: create MediaFile for existing configs
        migrations.RunPython(
            create_media_files_for_existing_configs,
            migrations.RunPython.noop,
        ),
    ]
