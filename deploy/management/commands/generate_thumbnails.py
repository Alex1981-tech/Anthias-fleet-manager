from django.core.management.base import BaseCommand

from deploy.models import MediaFile
from deploy.tasks import (
    _generate_image_thumbnail,
    _generate_video_thumbnail,
    _save_thumbnail,
)


class Command(BaseCommand):
    help = 'Generate thumbnails for existing media files that lack them'

    def handle(self, *args, **options):
        files = MediaFile.objects.filter(thumbnail__isnull=True) | MediaFile.objects.filter(thumbnail='')
        total = files.count()
        self.stdout.write(f'Found {total} file(s) without thumbnails')

        generated = 0
        for mf in files:
            if not mf.file:
                continue

            thumb_path = None
            if mf.file_type == 'video':
                thumb_path = _generate_video_thumbnail(mf.file.path)
            elif mf.file_type == 'image':
                thumb_path = _generate_image_thumbnail(mf.file.path)

            if thumb_path:
                _save_thumbnail(mf, thumb_path)
                generated += 1
                self.stdout.write(f'  [{generated}] {mf.name}')

        self.stdout.write(self.style.SUCCESS(f'Done: {generated} thumbnail(s) generated'))
