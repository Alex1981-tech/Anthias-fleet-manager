from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .provision import ProvisionTask, provision_player
from .provision_serializers import (
    ProvisionRetrySerializer,
    ProvisionTaskCreateSerializer,
    ProvisionTaskSerializer,
)


def _get_fm_server_url(request):
    """Build FM server URL from request for phone-home."""
    return f'{request.scheme}://{request.get_host()}'


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def provision_create(request):
    """Create a provisioning task and dispatch Celery job."""
    serializer = ProvisionTaskCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data
    ssh_password = data.pop('ssh_password')

    task = ProvisionTask.objects.create(
        ip_address=data['ip_address'],
        ssh_user=data.get('ssh_user', 'pi'),
        ssh_port=data.get('ssh_port', 22),
        player_name=data.get('player_name', ''),
    )

    fm_url = _get_fm_server_url(request)
    provision_player.delay(str(task.id), ssh_password, fm_server_url=fm_url)

    return Response(
        ProvisionTaskSerializer(task).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def provision_detail(request, task_id):
    """Get provisioning task details (frontend polls this)."""
    try:
        task = ProvisionTask.objects.get(id=task_id)
    except ProvisionTask.DoesNotExist:
        return Response(
            {'error': 'Task not found'},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(ProvisionTaskSerializer(task).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def provision_retry(request, task_id):
    """Retry a failed provisioning task."""
    try:
        task = ProvisionTask.objects.get(id=task_id)
    except ProvisionTask.DoesNotExist:
        return Response(
            {'error': 'Task not found'},
            status=status.HTTP_404_NOT_FOUND,
        )

    if task.status not in ('failed',):
        return Response(
            {'error': 'Only failed tasks can be retried.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = ProvisionRetrySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    ssh_password = serializer.validated_data['ssh_password']

    # Reset task state
    task.status = 'pending'
    task.current_step = 0
    task.steps = []
    task.error_message = ''
    task.log_output = ''
    task.player = None
    task.save()

    fm_url = _get_fm_server_url(request)
    provision_player.delay(str(task.id), ssh_password, fm_server_url=fm_url)

    return Response(ProvisionTaskSerializer(task).data)
