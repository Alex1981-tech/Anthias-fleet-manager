from django.contrib import admin

from .models import DeployTask


@admin.register(DeployTask)
class DeployTaskAdmin(admin.ModelAdmin):
    list_display = ['name', 'status', 'created_at']
    list_filter = ['status']
    search_fields = ['name']
    readonly_fields = ['id', 'status', 'progress', 'created_at']
    filter_horizontal = ['target_players']
