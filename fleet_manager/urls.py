import json
import logging

from django.conf import settings
from django.contrib import admin
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.urls import include, path, re_path
from django.views.decorators.http import require_POST
from django.views.generic import TemplateView
from django.views.static import serve
from rest_framework.authtoken.views import obtain_auth_token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

logger = logging.getLogger(__name__)

from fleet_manager.system_views import (
    system_settings,
    system_update,
    system_update_check,
    system_version,
    tailscale_settings,
)


@api_view(['POST'])
@permission_classes([AllowAny])
def auth_login(request):
    data = request.data
    user = authenticate(
        request,
        username=data.get('username'),
        password=data.get('password'),
    )
    if user is not None:
        login(request, user)
        return Response({'success': True, 'username': user.username})
    return Response(
        {'detail': 'Invalid credentials'},
        status=401,
    )


@api_view(['POST'])
def auth_logout(request):
    logout(request)
    return Response({'success': True})


@api_view(['GET'])
@permission_classes([AllowAny])
def auth_status(request):
    if request.user.is_authenticated:
        return Response({
            'authenticated': True,
            'username': request.user.username,
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
    path('admin/', admin.site.urls),
    path('api/auth/login/', auth_login),
    path('api/auth/logout/', auth_logout),
    path('api/auth/status/', auth_status),
    path('api/auth/token/', obtain_auth_token, name='api-token'),
    path('api/system/version/', system_version),
    path('api/system/update-check/', system_update_check),
    path('api/system/update/', system_update),
    path('api/system/settings/', system_settings),
    path('api/system/tailscale/', tailscale_settings),
    path('api/', include('players.urls')),
    path('api/', include('deploy.urls')),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    path('cctv/<uuid:config_id>/', cctv_player_view, name='cctv-player'),
    path('', TemplateView.as_view(template_name='index.html'), name='index'),
    path('<path:path>', TemplateView.as_view(template_name='index.html')),
]
