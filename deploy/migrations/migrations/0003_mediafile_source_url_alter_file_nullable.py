# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('deploy', '0002_mediafile'),
    ]

    operations = [
        migrations.AddField(
            model_name='mediafile',
            name='source_url',
            field=models.URLField(blank=True, max_length=500, null=True),
        ),
        migrations.AlterField(
            model_name='mediafile',
            name='file',
            field=models.FileField(blank=True, null=True, upload_to='media_files/'),
        ),
    ]
