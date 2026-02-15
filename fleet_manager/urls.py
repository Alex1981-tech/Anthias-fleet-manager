from django.conf import settings
from django.contrib import admin
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.urls import include, path, re_path
from django.views.decorators.http import require_POST
from django.views.generic import TemplateView
from django.views.static import serve
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

import json


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


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/login/', auth_login),
    path('api/auth/logout/', auth_logout),
    path('api/auth/status/', auth_status),
    path('api/', include('players.urls')),
    path('api/', include('deploy.urls')),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    path('', TemplateView.as_view(template_name='index.html'), name='index'),
    path('<path:path>', TemplateView.as_view(template_name='index.html')),
]
