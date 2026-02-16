# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('deploy', '0003_mediafile_source_url_alter_file_nullable'),
    ]

    operations = [
        migrations.AddField(
            model_name='mediafile',
            name='thumbnail_url',
            field=models.URLField(blank=True, max_length=500, null=True),
        ),
    ]
