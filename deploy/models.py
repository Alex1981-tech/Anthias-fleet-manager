import os
import uuid

from django.db import models

from players.models import Player


def detect_file_type(filename):
    ext = os.path.splitext(filename)[1].lower()
    image_exts = {'.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp'}
    video_exts = {'.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v'}
    web_exts = {'.html', '.htm', '.pdf'}
    if ext in image_exts:
        return 'image'
    if ext in video_exts:
        return 'video'
    if ext in web_exts:
        return 'web'
    return 'other'


class MediaFolder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class MediaFile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    file = models.FileField(upload_to='media_files/', null=True, blank=True)
    thumbnail = models.ImageField(upload_to='thumbnails/', null=True, blank=True)
    source_url = models.URLField(max_length=500, null=True, blank=True)
    thumbnail_url = models.URLField(max_length=500, null=True, blank=True)
    folder = models.ForeignKey(MediaFolder, null=True, blank=True, on_delete=models.SET_NULL, related_name='files')
    file_type = models.CharField(max_length=20, default='other')
    file_size = models.BigIntegerField(default=0)
    processing_status = models.CharField(
        max_length=20,
        choices=[('ready', 'Ready'), ('processing', 'Processing'), ('failed', 'Failed')],
        default='ready',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    def delete(self, *args, **kwargs):
        if self.thumbnail:
            self.thumbnail.delete(save=False)
        if self.file:
            self.file.delete(save=False)
        super().delete(*args, **kwargs)


class DeployTask(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('running', 'Running'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    asset_data = models.JSONField(
        default=dict,
        help_text='JSON describing the asset to deploy (name, URI, duration, etc.).',
    )
    file_path = models.FileField(
        upload_to='deploy_files/',
        null=True,
        blank=True,
    )
    target_players = models.ManyToManyField(
        Player,
        related_name='deploy_tasks',
        blank=True,
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending',
    )
    progress = models.JSONField(
        default=dict,
        blank=True,
        help_text='Per-player progress tracking, e.g. {"player_id": "success"}.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.status})'


class CctvConfig(models.Model):
    DISPLAY_MODE_CHOICES = [
        ('mosaic', 'Mosaic'),
        ('rotation', 'Rotation'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    display_mode = models.CharField(max_length=10, choices=DISPLAY_MODE_CHOICES, default='mosaic')
    rotation_interval = models.IntegerField(default=10)
    resolution = models.CharField(max_length=20, default='1920x1080')
    fps = models.IntegerField(default=15)
    username = models.CharField(max_length=255, blank=True, default='')
    password = models.CharField(max_length=255, blank=True, default='')
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class CctvCamera(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    config = models.ForeignKey(CctvConfig, on_delete=models.CASCADE, related_name='cameras')
    name = models.CharField(max_length=255, blank=True, default='')
    rtsp_url = models.TextField()
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ['sort_order']

    def __str__(self):
        return self.name or self.rtsp_url
