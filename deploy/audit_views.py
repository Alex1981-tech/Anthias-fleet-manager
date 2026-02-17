"""Audit log API views (admin-only, read-only)."""

from rest_framework import serializers, status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from fleet_manager.permissions import IsAdmin
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = ['id', 'timestamp', 'user', 'username', 'action',
                  'target_type', 'target_id', 'target_name', 'details',
                  'ip_address']


@api_view(['GET'])
def audit_list(request):
    """Paginated audit log with filters. Admin-only."""
    from fleet_manager.permissions import _user_role
    if _user_role(request.user) != 'admin':
        return Response({'detail': 'Admin access required.'}, status=status.HTTP_403_FORBIDDEN)

    qs = AuditLog.objects.select_related('user').all()

    # Filters
    user_id = request.query_params.get('user')
    if user_id:
        qs = qs.filter(user_id=user_id)

    action = request.query_params.get('action')
    if action:
        qs = qs.filter(action=action)

    target_type = request.query_params.get('target_type')
    if target_type:
        qs = qs.filter(target_type=target_type)

    date_from = request.query_params.get('from')
    if date_from:
        qs = qs.filter(timestamp__gte=date_from)

    date_to = request.query_params.get('to')
    if date_to:
        qs = qs.filter(timestamp__lte=date_to)

    # Pagination
    try:
        page = int(request.query_params.get('page', 1))
    except (ValueError, TypeError):
        page = 1
    try:
        page_size = int(request.query_params.get('page_size', 50))
    except (ValueError, TypeError):
        page_size = 50
    page_size = min(page_size, 200)

    total = qs.count()
    offset = (page - 1) * page_size
    entries = qs[offset:offset + page_size]

    serializer = AuditLogSerializer(entries, many=True)

    return Response({
        'results': serializer.data,
        'total': total,
        'page': page,
        'page_size': page_size,
    })
