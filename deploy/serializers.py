from rest_framework import serializers

from players.models import Player

from .models import DeployTask, MediaFile, MediaFolder


class MediaFolderSerializer(serializers.ModelSerializer):
    file_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = MediaFolder
        fields = ['id', 'name', 'file_count', 'created_at']
        read_only_fields = ['id', 'created_at']


class MediaFileSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    thumbnail_file_url = serializers.SerializerMethodField()
    folder_name = serializers.CharField(source='folder.name', read_only=True, default=None)

    class Meta:
        model = MediaFile
        fields = ['id', 'name', 'file', 'source_url', 'thumbnail_url', 'thumbnail_file_url', 'file_type', 'file_size', 'processing_status', 'url', 'folder', 'folder_name', 'created_at']
        read_only_fields = ['id', 'file_type', 'file_size', 'processing_status', 'thumbnail_url', 'created_at']

    def get_thumbnail_file_url(self, obj):
        if obj.thumbnail:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.thumbnail.url)
            return obj.thumbnail.url
        return None

    def validate_name(self, value):
        qs = MediaFile.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('Content with this name already exists.')
        return value

    def get_url(self, obj):
        if obj.source_url:
            return obj.source_url
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None


class DeployTaskSerializer(serializers.ModelSerializer):
    target_players = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Player.objects.all(),
    )

    class Meta:
        model = DeployTask
        fields = '__all__'
        read_only_fields = ['id', 'status', 'progress', 'created_at']
