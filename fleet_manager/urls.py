import json
import logging

from django.conf import settings
from django.contrib import admin
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.urls import include, path, re_path
from django.views.decorators.http import require_POST
from django.views.generic import TemplateView
from django.views.static import serve
from rest_framework.authtoken.views import obtain_auth_token
from django_ratelimit.decorators import ratelimit
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

logger = logging.getLogger(__name__)

from rest_framework.routers import DefaultRouter

from fleet_manager.permissions import _user_role
from fleet_manager.system_views import (
    system_settings,
    system_update,
    system_update_check,
    system_version,
    tailscale_settings,
)
from deploy.audit_views import audit_list
from fleet_manager.user_views import UserViewSet

user_router = DefaultRouter()
user_router.register('users', UserViewSet)


@ratelimit(key='ip', rate='5/m', method='POST', block=True)
@api_view(['POST'])
@permission_classes([AllowAny])
def auth_login(request):
    from deploy.audit import log_action
    data = request.data
    user = authenticate(
        request,
        username=data.get('username'),
        password=data.get('password'),
    )
    if user is not None:
        login(request, user)
        log_action(request, 'login', 'session', target_name=user.username)
        return Response({'success': True, 'username': user.username})
    log_action(request, 'login_failed', 'session', target_name=data.get('username', ''))
    return Response(
        {'detail': 'Invalid credentials'},
        status=401,
    )


@api_view(['POST'])
def auth_logout(request):
    from deploy.audit import log_action
    log_action(request, 'logout', 'session', target_name=request.user.username)
    logout(request)
    return Response({'success': True})


@api_view(['GET'])
@permission_classes([AllowAny])
def auth_status(request):
    if request.user.is_authenticated:
        return Response({
            'authenticated': True,
            'username': request.user.username,
            'role': _user_role(request.user),
        })
    return Response({'authenticated': False})


from django.views.decorators.clickjacking import xframe_options_sameorigin


@xframe_options_sameorigin
def cctv_player_view(request, config_id):
    from django.utils import timezone

    from deploy.cctv_service import get_stream_status, start_stream
    from deploy.models import CctvConfig
    config = get_object_or_404(CctvConfig, pk=config_id)
    # Track that someone is watching — prevents Celery auto-stop
    CctvConfig.objects.filter(pk=config.pk).update(last_requested_at=timezone.now())
    # Auto-start stream when page is opened
    status = get_stream_status(str(config.id))
    if status.get('status') != 'running':
        try:
            start_stream(str(config.id))
        except Exception:
            logger.warning('Failed to auto-start CCTV stream %s', config_id, exc_info=True)
    return render(request, 'cctv_player.html', {
        'config_id': str(config.id),
        'config_name': config.name,
        'display_mode': config.display_mode,
        'rotation_interval': config.rotation_interval,
        'camera_count': config.cameras.count(),
    })


urlpatterns = [
    path('manage-d8f2a1/', admin.site.urls),
    path('api/auth/login/', auth_login),
    path('api/auth/logout/', auth_logout),
    path('api/auth/status/', auth_status),
    path('api/auth/token/', obtain_auth_token, name='api-token'),
    path('api/system/version/', system_version),
    path('api/system/update-check/', system_update_check),
    path('api/system/update/', system_update),
    path('api/system/settings/', system_settings),
    path('api/system/tailscale/', tailscale_settings),
    path('api/', include(user_router.urls)),
    path('api/audit/', audit_list),
    path('api/', include('players.urls')),
    path('api/', include('deploy.urls')),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    path('cctv/<uuid:config_id>/', cctv_player_view, name='cctv-player'),
    path('', TemplateView.as_view(template_name='index.html'), name='index'),
    path('<path:path>', TemplateView.as_view(template_name='index.html')),
]
