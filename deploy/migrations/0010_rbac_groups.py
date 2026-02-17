"""Data migration to create RBAC groups and assign admin group to superusers."""

from django.db import migrations


def create_rbac_groups(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    User = apps.get_model('auth', 'User')

    # Create the three role groups
    viewer_group, _ = Group.objects.get_or_create(name='viewer')
    editor_group, _ = Group.objects.get_or_create(name='editor')
    admin_group, _ = Group.objects.get_or_create(name='admin')

    # Assign all superusers to admin group
    for user in User.objects.filter(is_superuser=True):
        user.groups.add(admin_group)


def remove_rbac_groups(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Group.objects.filter(name__in=['viewer', 'editor', 'admin']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('deploy', '0009_cctv_media_integration'),
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.RunPython(create_rbac_groups, remove_rbac_groups),
    ]
