import logging

from rest_framework import serializers, status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import CctvCamera, CctvConfig

logger = logging.getLogger(__name__)


class CctvCameraSerializer(serializers.ModelSerializer):
    class Meta:
        model = CctvCamera
        fields = ['id', 'name', 'rtsp_url', 'sort_order']
        read_only_fields = ['id']


class CctvConfigSerializer(serializers.ModelSerializer):
    cameras = CctvCameraSerializer(many=True, read_only=True)

    class Meta:
        model = CctvConfig
        fields = [
            'id', 'name', 'display_mode', 'rotation_interval',
            'resolution', 'fps', 'username', 'password',
            'is_active', 'cameras', 'created_at',
        ]
        read_only_fields = ['id', 'is_active', 'created_at']
        extra_kwargs = {
            'password': {'write_only': True},
        }

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['has_password'] = bool(instance.password)
        return data


class CctvConfigWriteSerializer(serializers.ModelSerializer):
    cameras = CctvCameraSerializer(many=True)

    class Meta:
        model = CctvConfig
        fields = [
            'id', 'name', 'display_mode', 'rotation_interval',
            'resolution', 'fps', 'username', 'password',
            'cameras',
        ]
        read_only_fields = ['id']

    def create(self, validated_data):
        cameras_data = validated_data.pop('cameras', [])
        config = CctvConfig.objects.create(**validated_data)
        for i, cam_data in enumerate(cameras_data):
            cam_data['sort_order'] = cam_data.get('sort_order', i)
            CctvCamera.objects.create(config=config, **cam_data)
        return config

    def update(self, instance, validated_data):
        cameras_data = validated_data.pop('cameras', None)

        # Don't clear password if not provided
        if 'password' not in validated_data or validated_data['password'] == '':
            validated_data.pop('password', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if cameras_data is not None:
            instance.cameras.all().delete()
            for i, cam_data in enumerate(cameras_data):
                cam_data.pop('id', None)
                cam_data['sort_order'] = cam_data.get('sort_order', i)
                CctvCamera.objects.create(config=instance, **cam_data)

        return instance


@api_view(['GET', 'POST'])
def cctv_list(request):
    if request.method == 'GET':
        configs = CctvConfig.objects.prefetch_related('cameras').all()
        serializer = CctvConfigSerializer(configs, many=True)
        return Response(serializer.data)

    serializer = CctvConfigWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    config = serializer.save()
    return Response(
        CctvConfigSerializer(config).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET', 'PUT', 'DELETE'])
def cctv_detail(request, config_id):
    try:
        config = CctvConfig.objects.prefetch_related('cameras').get(pk=config_id)
    except CctvConfig.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(CctvConfigSerializer(config).data)

    if request.method == 'DELETE':
        if config.is_active:
            from .cctv_service import stop_stream
            stop_stream(str(config.id))
        config.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = CctvConfigWriteSerializer(config, data=request.data)
    serializer.is_valid(raise_exception=True)
    config = serializer.save()
    return Response(CctvConfigSerializer(config).data)


@api_view(['POST'])
def cctv_start(request, config_id):
    try:
        config = CctvConfig.objects.prefetch_related('cameras').get(pk=config_id)
    except CctvConfig.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    if config.cameras.count() == 0:
        return Response(
            {'error': 'No cameras configured'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from .cctv_service import start_stream
    try:
        start_stream(str(config.id))
        config.is_active = True
        config.save(update_fields=['is_active'])
        return Response({'success': True, 'status': 'running'})
    except Exception as e:
        logger.exception('Failed to start CCTV stream %s', config_id)
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
def cctv_stop(request, config_id):
    try:
        config = CctvConfig.objects.get(pk=config_id)
    except CctvConfig.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    from .cctv_service import stop_stream
    stop_stream(str(config.id))
    config.is_active = False
    config.save(update_fields=['is_active'])
    return Response({'success': True, 'status': 'stopped'})


@api_view(['GET'])
def cctv_status(request, config_id):
    try:
        config = CctvConfig.objects.get(pk=config_id)
    except CctvConfig.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    from .cctv_service import get_stream_status
    stream_status = get_stream_status(str(config.id))
    return Response(stream_status)
