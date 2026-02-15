from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .cctv_views import cctv_detail, cctv_list, cctv_request_start, cctv_start, cctv_status, cctv_stop
from .views import DeployTaskViewSet, MediaFileViewSet, MediaFolderViewSet

router = DefaultRouter()
router.register('deploy', DeployTaskViewSet)
router.register('media', MediaFileViewSet, basename='media')
router.register('folders', MediaFolderViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('cctv/', cctv_list, name='cctv-list'),
    path('cctv/<uuid:config_id>/', cctv_detail, name='cctv-detail'),
    path('cctv/<uuid:config_id>/start/', cctv_start, name='cctv-start'),
    path('cctv/<uuid:config_id>/stop/', cctv_stop, name='cctv-stop'),
    path('cctv/<uuid:config_id>/status/', cctv_status, name='cctv-status'),
    path('cctv/<uuid:config_id>/request-start/', cctv_request_start, name='cctv-request-start'),
]
