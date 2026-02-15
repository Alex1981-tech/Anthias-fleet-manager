import logging

from django.db.models import Count
from rest_framework import parsers, serializers, status, viewsets
from rest_framework.response import Response

from .models import DeployTask, MediaFile, MediaFolder, detect_file_type
from .serializers import DeployTaskSerializer, MediaFileSerializer, MediaFolderSerializer
from .tasks import _is_safe_url, execute_deploy, fetch_og_image_task, generate_image_thumbnail, transcode_video

logger = logging.getLogger(__name__)


class MediaFolderViewSet(viewsets.ModelViewSet):
    """ViewSet for managing media folders."""
    queryset = MediaFolder.objects.annotate(file_count=Count('files'))
    serializer_class = MediaFolderSerializer


class MediaFileViewSet(viewsets.ModelViewSet):
    """ViewSet for managing uploaded media files."""
    serializer_class = MediaFileSerializer
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def get_queryset(self):
        qs = MediaFile.objects.select_related('folder').all()
        folder = self.request.query_params.get('folder')
        if folder == 'none':
            qs = qs.filter(folder__isnull=True)
        elif folder:
            qs = qs.filter(folder_id=folder)
        file_type = self.request.query_params.get('file_type')
        if file_type:
            qs = qs.filter(file_type=file_type)
        return qs

    def perform_create(self, serializer):
        uploaded_file = self.request.FILES.get('file')
        source_url = self.request.data.get('source_url')
        if uploaded_file:
            name = self.request.data.get('name') or uploaded_file.name
            file_type = detect_file_type(uploaded_file.name)
            instance = serializer.save(
                name=name,
                file_type=file_type,
                file_size=uploaded_file.size,
            )
            if file_type == 'video':
                instance.processing_status = 'processing'
                instance.save(update_fields=['processing_status'])
                transcode_video.delay(str(instance.id))
            elif file_type == 'image':
                generate_image_thumbnail.delay(str(instance.id))
        elif source_url:
            if not _is_safe_url(source_url):
                raise serializers.ValidationError({'source_url': 'URL points to a private or disallowed network.'})
            name = self.request.data.get('name') or source_url
            instance = serializer.save(
                name=name,
                source_url=source_url,
                file_type='web',
                file_size=0,
            )
            # Fetch og:image asynchronously to avoid blocking the request
            fetch_og_image_task.delay(str(instance.id), source_url)


class DeployTaskViewSet(viewsets.ModelViewSet):
    """ViewSet for managing deploy tasks."""
    queryset = DeployTask.objects.prefetch_related('target_players').all()
    serializer_class = DeployTaskSerializer

    def perform_create(self, serializer):
        """Save the deploy task and kick off the Celery task."""
        deploy_task = serializer.save()
        execute_deploy.delay(str(deploy_task.id))
