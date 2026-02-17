"""WebSocket consumer for SSH terminal to players."""

import asyncio
import json
import logging

import paramiko
from channels.generic.websocket import AsyncWebsocketConsumer

from fleet_manager.permissions import _user_role

logger = logging.getLogger(__name__)

IDLE_TIMEOUT = 1800  # 30 min


class TerminalConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.player_id = self.scope['url_route']['kwargs']['player_id']
        self.ssh_client = None
        self.ssh_channel = None
        self._reader_task = None
        self._idle_timer = None

        # Auth check
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        role = await asyncio.to_thread(_user_role, user)
        if role != 'admin':
            await self.close(code=4003)
            return

        # Get player
        from .models import Player
        try:
            self.player = await asyncio.to_thread(
                Player.objects.get, pk=self.player_id
            )
        except Player.DoesNotExist:
            await self.close(code=4004)
            return

        await self.accept()
        await self.send(text_data=f'\x1b[33mConnecting to {self.player.name}...\x1b[0m\r\n')

        # Start SSH in background
        try:
            await self._connect_ssh()
        except Exception as e:
            await self.send(text_data=f'\x1b[31mSSH connection failed: {e}\x1b[0m\r\n')
            await self.close()
            return

        # Start reading SSH output
        self._reader_task = asyncio.ensure_future(self._read_ssh())
        self._reset_idle_timer()

    async def _connect_ssh(self):
        """Establish SSH connection to the player."""
        ip = self.player.url.replace('http://', '').replace('https://', '').split(':')[0].rstrip('/')
        password = await asyncio.to_thread(self.player.get_password)

        self.ssh_client = paramiko.SSHClient()
        self.ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        await asyncio.to_thread(
            self.ssh_client.connect,
            hostname=ip,
            username=self.player.username or 'pi',
            password=password,
            timeout=10,
            look_for_keys=False,
            allow_agent=False,
        )

        transport = self.ssh_client.get_transport()
        self.ssh_channel = transport.open_session()
        self.ssh_channel.get_pty(term='xterm-256color', width=120, height=30)
        self.ssh_channel.invoke_shell()

        await self.send(text_data='\x1b[32mConnected.\x1b[0m\r\n')

    async def _read_ssh(self):
        """Read from SSH channel and forward to WebSocket."""
        try:
            while True:
                if self.ssh_channel is None or self.ssh_channel.closed:
                    break
                data = await asyncio.to_thread(self._recv_ssh)
                if data:
                    # Send raw terminal output directly (no JSON wrapping)
                    await self.send(text_data=data)
                else:
                    await asyncio.sleep(0.05)
        except Exception as e:
            logger.debug('SSH reader stopped: %s', e)
        finally:
            try:
                await self.send(text_data='\r\n\x1b[31mConnection closed.\x1b[0m\r\n')
            except Exception:
                pass
            await self.close()

    def _recv_ssh(self):
        """Blocking SSH recv — called in thread."""
        if self.ssh_channel and self.ssh_channel.recv_ready():
            return self.ssh_channel.recv(4096).decode('utf-8', errors='replace')
        return None

    async def receive(self, text_data=None, bytes_data=None):
        """Handle input from browser."""
        self._reset_idle_timer()

        if not text_data:
            return

        try:
            msg = json.loads(text_data)
        except json.JSONDecodeError:
            # Plain text input
            if self.ssh_channel and not self.ssh_channel.closed:
                await asyncio.to_thread(self.ssh_channel.send, text_data)
            return

        msg_type = msg.get('type', 'input')

        if msg_type == 'input':
            data = msg.get('data', '')
            if self.ssh_channel and not self.ssh_channel.closed:
                await asyncio.to_thread(self.ssh_channel.send, data)

        elif msg_type == 'resize':
            cols = msg.get('cols', 120)
            rows = msg.get('rows', 30)
            if self.ssh_channel and not self.ssh_channel.closed:
                await asyncio.to_thread(
                    self.ssh_channel.resize_pty, width=cols, height=rows
                )

    async def disconnect(self, close_code):
        """Clean up SSH resources."""
        if self._reader_task:
            self._reader_task.cancel()
        if self._idle_timer:
            self._idle_timer.cancel()
        if self.ssh_channel:
            try:
                self.ssh_channel.close()
            except Exception:
                pass
        if self.ssh_client:
            try:
                self.ssh_client.close()
            except Exception:
                pass

    def _reset_idle_timer(self):
        """Reset the idle disconnect timer."""
        if self._idle_timer:
            self._idle_timer.cancel()
        loop = asyncio.get_event_loop()
        self._idle_timer = loop.call_later(IDLE_TIMEOUT, self._idle_disconnect)

    def _idle_disconnect(self):
        """Called when terminal has been idle too long."""
        asyncio.ensure_future(self._do_idle_disconnect())

    async def _do_idle_disconnect(self):
        await self.send(text_data='\r\n\x1b[33mDisconnected due to inactivity.\x1b[0m\r\n')
        await self.close()
