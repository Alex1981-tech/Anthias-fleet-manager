from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .provision_views import provision_create, provision_detail, provision_retry
from .views import BulkActionView, GroupViewSet, PlayerViewSet, install_phonehome, playback_log, playback_stats, register_player

router = DefaultRouter()
router.register('players', PlayerViewSet)
router.register('groups', GroupViewSet)

urlpatterns = [
    path('players/register/', register_player, name='register-player'),
    path('players/install-phonehome/', install_phonehome, name='install-phonehome'),
    path('playback-log/', playback_log, name='playback-log'),
    path('playback-stats/', playback_stats, name='playback-stats'),
    path('provision/', provision_create, name='provision-create'),
    path('provision/<uuid:task_id>/', provision_detail, name='provision-detail'),
    path('provision/<uuid:task_id>/retry/', provision_retry, name='provision-retry'),
    path('', include(router.urls)),
    path('bulk/<str:action>/', BulkActionView.as_view(), name='bulk-action'),
]
