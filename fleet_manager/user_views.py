import logging

from django.contrib.auth.models import User
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from .permissions import IsAdmin, _user_role
from .serializers import CreateUserSerializer, UpdateUserSerializer, UserSerializer

logger = logging.getLogger(__name__)


class UserViewSet(viewsets.ModelViewSet):
    """Admin-only user management."""
    queryset = User.objects.all().order_by('-date_joined')
    permission_classes = [IsAdmin]
    pagination_class = None

    def get_serializer_class(self):
        if self.action == 'create':
            return CreateUserSerializer
        if self.action in ('update', 'partial_update'):
            return UpdateUserSerializer
        return UserSerializer

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = UserSerializer(queryset, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        from deploy.audit import log_action
        user = serializer.save()
        log_action(self.request, 'create', 'user', target_id=user.id,
                   target_name=user.username, details={'role': serializer.validated_data.get('role')})

    def perform_update(self, serializer):
        from deploy.audit import log_action
        user = serializer.save()
        log_action(self.request, 'update', 'user', target_id=user.id,
                   target_name=user.username)

    def destroy(self, request, *args, **kwargs):
        from deploy.audit import log_action
        user = self.get_object()
        if user == request.user:
            return Response(
                {'error': 'Cannot deactivate yourself'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.is_active = False
        user.save(update_fields=['is_active'])
        log_action(request, 'deactivate', 'user', target_id=user.id, target_name=user.username)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'], url_path='me', permission_classes=[])
    def me(self, request):
        """Return current user info + role. Available to any authenticated user."""
        if not request.user.is_authenticated:
            return Response({'authenticated': False}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = UserSerializer(request.user)
        return Response(serializer.data)
