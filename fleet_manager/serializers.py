from django.contrib.auth.models import User
from rest_framework import serializers

from .permissions import _user_role


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name',
                  'is_active', 'role', 'last_login', 'date_joined']
        read_only_fields = ['id', 'last_login', 'date_joined']

    def get_role(self, obj):
        return _user_role(obj)


class CreateUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    role = serializers.ChoiceField(choices=['viewer', 'editor', 'admin'])

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'password', 'role']

    def create(self, validated_data):
        role = validated_data.pop('role')
        password = validated_data.pop('password')
        user = User.objects.create_user(**validated_data, password=password)
        self._assign_role(user, role)
        return user

    @staticmethod
    def _assign_role(user, role):
        from django.contrib.auth.models import Group
        user.groups.clear()
        try:
            group = Group.objects.get(name=role)
            user.groups.add(group)
        except Group.DoesNotExist:
            pass


class UpdateUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=6)
    role = serializers.ChoiceField(choices=['viewer', 'editor', 'admin'], required=False)

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'last_name', 'password',
                  'role', 'is_active']

    def update(self, instance, validated_data):
        role = validated_data.pop('role', None)
        password = validated_data.pop('password', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)

        instance.save()

        if role:
            CreateUserSerializer._assign_role(instance, role)

        return instance
