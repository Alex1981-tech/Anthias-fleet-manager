"""
Custom DRF permission classes for role-based access control.

Three roles: viewer (read-only), editor (viewer + create/update), admin (full access).
Roles are stored as Django Group memberships.
"""

from rest_framework.permissions import BasePermission


def _user_role(user):
    """Return the highest role for a user: admin > editor > viewer."""
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return 'admin'
    groups = set(user.groups.values_list('name', flat=True))
    if 'admin' in groups:
        return 'admin'
    if 'editor' in groups:
        return 'editor'
    if 'viewer' in groups:
        return 'viewer'
    # Authenticated user with no group — treat as viewer
    return 'viewer'


class IsViewer(BasePermission):
    """Any authenticated user (read-only access)."""

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated


class IsEditor(BasePermission):
    """User in editor or admin group (create/update)."""

    def has_permission(self, request, view):
        role = _user_role(request.user)
        return role in ('editor', 'admin')


class IsAdmin(BasePermission):
    """User in admin group or is_superuser (full access)."""

    def has_permission(self, request, view):
        role = _user_role(request.user)
        return role == 'admin'


class IsEditorOrReadOnly(BasePermission):
    """Editor/admin for write ops; any authenticated user for read."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return _user_role(request.user) in ('editor', 'admin')


class IsAdminOrReadOnly(BasePermission):
    """Admin for write ops; any authenticated user for read."""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return _user_role(request.user) == 'admin'
