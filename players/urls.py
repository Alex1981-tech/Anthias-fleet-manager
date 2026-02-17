from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .bulk_views import bulk_detail, bulk_list, bulk_scan, bulk_start
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
    path('bulk-provision/scan/', bulk_scan, name='bulk-provision-scan'),
    path('bulk-provision/start/', bulk_start, name='bulk-provision-start'),
    path('bulk-provision/<uuid:task_id>/', bulk_detail, name='bulk-provision-detail'),
    path('bulk-provision/', bulk_list, name='bulk-provision-list'),
    path('', include(router.urls)),
    path('bulk/<str:action>/', BulkActionView.as_view(), name='bulk-action'),
]
