from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BulkActionView, GroupViewSet, PlayerViewSet, install_phonehome, playback_log, playback_stats, register_player

router = DefaultRouter()
router.register('players', PlayerViewSet)
router.register('groups', GroupViewSet)

urlpatterns = [
    path('players/register/', register_player, name='register-player'),
    path('players/install-phonehome/', install_phonehome, name='install-phonehome'),
    path('playback-log/', playback_log, name='playback-log'),
    path('playback-stats/', playback_stats, name='playback-stats'),
    path('', include(router.urls)),
    path('bulk/<str:action>/', BulkActionView.as_view(), name='bulk-action'),
]
