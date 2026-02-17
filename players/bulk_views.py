"""Bulk provisioning API views."""

import logging

from rest_framework import serializers, status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from fleet_manager.permissions import IsAdmin, _user_role
from .models import BulkProvisionTask

logger = logging.getLogger(__name__)


class BulkProvisionTaskSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(
        source='created_by.username', read_only=True, default=None,
    )

    class Meta:
        model = BulkProvisionTask
        fields = ['id', 'created_at', 'created_by', 'created_by_username',
                  'status', 'scan_method', 'ip_range_start', 'ip_range_end',
                  'discovered_ips', 'selected_ips', 'results']
        read_only_fields = ['id', 'created_at', 'created_by', 'status',
                           'discovered_ips', 'results']


def _check_admin(request):
    if _user_role(request.user) != 'admin':
        return Response(
            {'detail': 'Admin access required.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


@api_view(['POST'])
def bulk_scan(request):
    """Scan network for potential Raspberry Pi devices."""
    denied = _check_admin(request)
    if denied:
        return denied

    method = request.data.get('method', 'arp')
    start_ip = request.data.get('start_ip')
    end_ip = request.data.get('end_ip')
    manual_ips = request.data.get('ips', [])

    from .bulk_provision import scan_network_arp, scan_network_range

    if method == 'arp':
        ips = scan_network_arp()
    elif method == 'range':
        if not start_ip or not end_ip:
            return Response(
                {'error': 'start_ip and end_ip are required for range scan'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ips = scan_network_range(start_ip, end_ip)
    elif method == 'manual':
        ips = [ip.strip() for ip in manual_ips if ip.strip()]
    else:
        return Response(
            {'error': 'method must be arp, range, or manual'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response({
        'method': method,
        'discovered_ips': ips,
        'count': len(ips),
    })


@api_view(['POST'])
def bulk_start(request):
    """Start bulk provisioning for selected IPs."""
    denied = _check_admin(request)
    if denied:
        return denied

    selected_ips = request.data.get('ips', [])
    ssh_user = request.data.get('ssh_user', 'pi')
    ssh_password = request.data.get('ssh_password', '')
    scan_method = request.data.get('scan_method', 'manual')

    if not selected_ips:
        return Response(
            {'error': 'ips list is required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not ssh_password:
        return Response(
            {'error': 'ssh_password is required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    task = BulkProvisionTask.objects.create(
        created_by=request.user,
        scan_method=scan_method,
        selected_ips=selected_ips,
        ssh_user=ssh_user,
        status='pending',
    )
    task.set_ssh_password(ssh_password)
    task.save(update_fields=['ssh_password_encrypted'])

    from .bulk_provision import bulk_provision_task
    bulk_provision_task.delay(str(task.id))

    from deploy.audit import log_action
    log_action(request, 'bulk_provision', 'player',
               target_id=task.id, details={'ips': selected_ips})

    serializer = BulkProvisionTaskSerializer(task)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def bulk_detail(request, task_id):
    """Get bulk provision task status."""
    denied = _check_admin(request)
    if denied:
        return denied

    try:
        task = BulkProvisionTask.objects.get(pk=task_id)
    except BulkProvisionTask.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = BulkProvisionTaskSerializer(task)
    return Response(serializer.data)


@api_view(['GET'])
def bulk_list(request):
    """List all bulk provision tasks."""
    denied = _check_admin(request)
    if denied:
        return denied

    tasks = BulkProvisionTask.objects.select_related('created_by').all()[:20]
    serializer = BulkProvisionTaskSerializer(tasks, many=True)
    return Response(serializer.data)
