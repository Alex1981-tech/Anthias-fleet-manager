import ipaddress
from urllib.parse import urlparse

from rest_framework import serializers

from .models import Group, PlaybackLog, Player, PlayerSnapshot

# Tailscale uses CGNAT range 100.64.0.0/10
TAILSCALE_NETWORK = ipaddress.ip_network('100.64.0.0/10')


def _extract_tailscale_ip(url):
    """If the URL host is a Tailscale CGNAT IP, return it; else None."""
    try:
        host = urlparse(url).hostname
        if host and ipaddress.ip_address(host) in TAILSCALE_NETWORK:
            return host
    except (ValueError, TypeError):
        pass
    return None


class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class PlayerSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        default='',
    )
    group_detail = GroupSerializer(source='group', read_only=True)

    class Meta:
        model = Player
        fields = [
            'id',
            'name',
            'url',
            'username',
            'password',
            'group',
            'group_detail',
            'is_online',
            'last_seen',
            'last_status',
            'tailscale_ip',
            'tailscale_enabled',
            'created_at',
        ]
        read_only_fields = ['id', 'is_online', 'last_seen', 'last_status', 'created_at']

    def create(self, validated_data):
        raw_password = validated_data.pop('password', '')
        # Auto-detect Tailscale IP from URL
        if not validated_data.get('tailscale_ip'):
            ts_ip = _extract_tailscale_ip(validated_data.get('url', ''))
            if ts_ip:
                validated_data['tailscale_ip'] = ts_ip
                validated_data.setdefault('tailscale_enabled', True)
        player = Player(**validated_data)
        player.set_password(raw_password)
        player.save()
        return player

    def update(self, instance, validated_data):
        raw_password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if raw_password is not None:
            instance.set_password(raw_password)
        # Auto-detect Tailscale IP from URL if not explicitly set
        if not instance.tailscale_ip:
            ts_ip = _extract_tailscale_ip(instance.url)
            if ts_ip:
                instance.tailscale_ip = ts_ip
                instance.tailscale_enabled = True
        instance.save()
        return instance


class PlayerListSerializer(serializers.ModelSerializer):
    group = GroupSerializer(read_only=True)

    class Meta:
        model = Player
        fields = [
            'id',
            'name',
            'url',
            'group',
            'is_online',
            'last_seen',
            'last_status',
            'tailscale_ip',
            'tailscale_enabled',
        ]
        read_only_fields = fields


class PlayerSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlayerSnapshot
        fields = [
            'id',
            'player',
            'is_online',
            'assets_count',
            'free_space',
            'load_avg',
            'timestamp',
        ]
        read_only_fields = fields


class PlaybackLogSerializer(serializers.ModelSerializer):
    player_name = serializers.CharField(source='player.name', read_only=True)

    class Meta:
        model = PlaybackLog
        fields = [
            'id',
            'player',
            'player_name',
            'asset_id',
            'asset_name',
            'mimetype',
            'event',
            'timestamp',
        ]
        read_only_fields = fields
