import ipaddress

from rest_framework import serializers

from .provision import ProvisionTask


class ProvisionTaskCreateSerializer(serializers.Serializer):
    ip_address = serializers.IPAddressField()
    ssh_user = serializers.CharField(max_length=100, default='pi')
    ssh_password = serializers.CharField(max_length=200, write_only=True)
    ssh_port = serializers.IntegerField(default=22, min_value=1, max_value=65535)
    player_name = serializers.CharField(max_length=200, required=False, default='')

    def validate_ip_address(self, value):
        addr = ipaddress.ip_address(value)
        if addr.is_loopback:
            raise serializers.ValidationError('Cannot provision localhost.')
        return value

    def validate(self, attrs):
        # Reject if same IP already has a running task
        ip = attrs.get('ip_address')
        if ProvisionTask.objects.filter(ip_address=ip, status='running').exists():
            raise serializers.ValidationError(
                {'ip_address': 'A provisioning task is already running for this IP.'}
            )
        return attrs


class ProvisionTaskSerializer(serializers.ModelSerializer):
    player_id = serializers.UUIDField(source='player.id', read_only=True, default=None)
    player_name_result = serializers.CharField(source='player.name', read_only=True, default=None)

    class Meta:
        model = ProvisionTask
        fields = [
            'id', 'ip_address', 'ssh_user', 'ssh_port', 'player_name',
            'status', 'current_step', 'total_steps', 'steps',
            'error_message', 'log_output',
            'player_id', 'player_name_result',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields


class ProvisionRetrySerializer(serializers.Serializer):
    ssh_password = serializers.CharField(max_length=200, write_only=True)
