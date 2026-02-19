import logging
import socket
import time
import uuid
from string import Template

from django.conf import settings
from django.core.cache import cache
from django.db import models
from django.utils import timezone

logger = logging.getLogger(__name__)


class ProvisionTask(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('running', 'Running'),
        ('success', 'Success'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ip_address = models.GenericIPAddressField()
    ssh_user = models.CharField(max_length=100, default='pi')
    ssh_port = models.IntegerField(default=22)
    player_name = models.CharField(max_length=200, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    current_step = models.IntegerField(default=0)
    total_steps = models.IntegerField(default=12)
    steps = models.JSONField(default=list)
    error_message = models.CharField(max_length=1000, blank=True, default='')
    log_output = models.TextField(blank=True, default='')
    player = models.ForeignKey(
        'Player', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='provision_tasks',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Provision {self.ip_address} [{self.status}]'


def _update_step(task, step_num, name, status, message=''):
    """Update a step in the task's steps JSONField."""
    entry = {
        'step': step_num,
        'name': name,
        'status': status,
        'message': message,
        'timestamp': timezone.now().isoformat(),
    }
    steps = list(task.steps)
    # Replace existing step or append
    found = False
    for i, s in enumerate(steps):
        if s.get('step') == step_num:
            steps[i] = entry
            found = True
            break
    if not found:
        steps.append(entry)
    task.steps = steps
    task.current_step = step_num
    task.updated_at = timezone.now()
    task.save(update_fields=['steps', 'current_step', 'updated_at'])


def _append_log(task, text):
    """Append text to task log output."""
    task.log_output += text + '\n'
    task.save(update_fields=['log_output'])


def _ssh_run(ssh, cmd, sudo_password=None, timeout=30, check=True):
    """Execute command via SSH, return (stdout, stderr, exit_code).

    Uses channel.settimeout() to prevent indefinite blocking on
    recv_exit_status() — a known Paramiko issue with long-running commands.
    """
    if sudo_password and cmd.strip().startswith('sudo '):
        # Use stdin for sudo password
        cmd_to_run = f'echo {_shell_quote(sudo_password)} | sudo -S bash -c {_shell_quote(cmd[5:])}'
    else:
        cmd_to_run = cmd

    stdin, stdout, stderr = ssh.exec_command(cmd_to_run, timeout=timeout)
    # Set channel timeout so recv_exit_status doesn't block forever
    channel = stdout.channel
    channel.settimeout(timeout)
    try:
        exit_code = channel.recv_exit_status()
    except socket.timeout:
        # Force close the channel on timeout
        channel.close()
        raise RuntimeError(f'SSH command timed out after {timeout}s: {cmd[:100]}')

    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')

    if check and exit_code != 0:
        raise RuntimeError(f'Command failed (exit {exit_code}): {err or out}')

    return out, err, exit_code


def _shell_quote(s):
    """Simple shell quoting."""
    return "'" + s.replace("'", "'\\''") + "'"


def _render_compose(ip_address, ssh_user, watchtower_token, mac_address='', device_type='pi4'):
    """Render docker-compose template with variables."""
    import os
    template_name = (
        'docker-compose-player-pi5.yml' if device_type == 'pi5'
        else 'docker-compose-player.yml'
    )
    template_path = os.path.join(
        settings.BASE_DIR, 'provision', 'templates', template_name,
    )
    with open(template_path) as f:
        template = Template(f.read())
    return template.safe_substitute(
        PI_IP=ip_address,
        PI_USER=ssh_user,
        WATCHTOWER_TOKEN=watchtower_token,
        MAC_ADDRESS=mac_address,
    )


try:
    from celery import shared_task

    @shared_task(bind=True, max_retries=0, time_limit=1800, soft_time_limit=1700)
    def provision_player(self, task_id, ssh_password, fm_server_url=''):
        """Provision a new Anthias player on a Raspberry Pi via SSH."""
        import paramiko

        task = ProvisionTask.objects.get(id=task_id)
        task.status = 'running'
        task.save(update_fields=['status'])

        ssh = None
        sftp = None

        try:
            # Step 1: SSH Connect (with retry)
            _update_step(task, 1, 'ssh_connect', 'running', 'Connecting via SSH...')
            _append_log(task, f'[Step 1] Connecting to {task.ip_address}:{task.ssh_port}...')

            # Pre-check: TCP connect to SSH port
            def _check_port(host, port, timeout=3):
                try:
                    s = socket.create_connection((host, port), timeout=timeout)
                    s.close()
                    return True
                except (socket.timeout, ConnectionRefusedError, OSError):
                    return False

            if not _check_port(task.ip_address, task.ssh_port):
                _append_log(task, f'Port {task.ssh_port} on {task.ip_address} is not open. Waiting for host to come online...')
                _update_step(task, 1, 'ssh_connect', 'running', 'Waiting for host to come online...')
                # Wait up to 60s for SSH port to open
                port_ok = False
                for wait_i in range(12):
                    time.sleep(5)
                    if _check_port(task.ip_address, task.ssh_port):
                        port_ok = True
                        _append_log(task, f'SSH port is open after ~{(wait_i + 1) * 5}s')
                        break
                if not port_ok:
                    raise RuntimeError(
                        f'Host {task.ip_address}:{task.ssh_port} is unreachable. '
                        'Check that the device is powered on, connected to the network, and SSH is enabled.'
                    )

            ssh = paramiko.SSHClient()
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            # SSH connect with retry (device may still be booting)
            max_ssh_attempts = 5
            ssh_delays = [5, 10, 15, 20, 25]  # backoff delays
            last_error = None
            for attempt in range(1, max_ssh_attempts + 1):
                try:
                    ssh.connect(
                        hostname=task.ip_address,
                        port=task.ssh_port,
                        username=task.ssh_user,
                        password=ssh_password,
                        timeout=15,
                        look_for_keys=False,
                        allow_agent=False,
                    )
                    last_error = None
                    break
                except paramiko.AuthenticationException as e:
                    # Auth errors won't fix themselves — fail immediately
                    raise RuntimeError(
                        f'SSH authentication failed for user "{task.ssh_user}". '
                        'Check username and password.'
                    ) from e
                except (socket.timeout, TimeoutError, OSError, paramiko.SSHException) as e:
                    last_error = e
                    if attempt < max_ssh_attempts:
                        delay = ssh_delays[attempt - 1]
                        _append_log(
                            task,
                            f'SSH attempt {attempt}/{max_ssh_attempts} failed: {e}. '
                            f'Retrying in {delay}s...',
                        )
                        _update_step(
                            task, 1, 'ssh_connect', 'running',
                            f'SSH retry {attempt}/{max_ssh_attempts}...',
                        )
                        time.sleep(delay)
                except Exception as e:
                    raise RuntimeError(f'SSH connection failed: {e}') from e

            if last_error is not None:
                # Classify the final error
                if isinstance(last_error, (socket.timeout, TimeoutError)):
                    raise RuntimeError(
                        f'SSH connection timed out after {max_ssh_attempts} attempts. '
                        'The device may still be booting or SSH service is not running.'
                    ) from last_error
                elif isinstance(last_error, ConnectionRefusedError):
                    raise RuntimeError(
                        f'SSH connection refused on port {task.ssh_port}. '
                        'SSH server may not be enabled on the device.'
                    ) from last_error
                else:
                    raise RuntimeError(
                        f'SSH connection failed after {max_ssh_attempts} attempts: {last_error}'
                    ) from last_error

            out, _, _ = _ssh_run(ssh, 'uname -m', timeout=10)
            arch = out.strip()
            _append_log(task, f'Connected. Architecture: {arch}')
            if arch not in ('aarch64', 'armv7l'):
                raise RuntimeError(f'Unsupported architecture: {arch}. Expected aarch64 or armv7l.')

            # Detect Pi model (Pi4 vs Pi5)
            model_out, _, _ = _ssh_run(ssh, 'cat /proc/device-tree/model 2>/dev/null || echo ""', timeout=5, check=False)
            model_str = model_out.strip().rstrip('\x00')
            if 'Raspberry Pi 5' in model_str or 'Compute Module 5' in model_str:
                device_type = 'pi5'
            elif 'Raspberry Pi 4' in model_str or 'Compute Module 4' in model_str:
                device_type = 'pi4'
            else:
                device_type = 'pi4'  # fallback
            _append_log(task, f'Device type: {device_type} ({model_str})')
            _update_step(task, 1, 'ssh_connect', 'success', f'Connected ({arch}, {device_type})')

            # Step 2: Prerequisites check
            task = ProvisionTask.objects.get(id=task_id)
            if task.status == 'failed':
                return
            _update_step(task, 2, 'prerequisites', 'running', 'Checking disk space...')
            _append_log(task, '[Step 2] Checking prerequisites...')

            out, _, _ = _ssh_run(ssh, 'df -BG / | tail -1', timeout=30)
            _append_log(task, f'Disk: {out.strip()}')

            # Check internet (try curl docker, fallback to ping)
            _, _, rc = _ssh_run(ssh, 'curl -sf --max-time 10 https://download.docker.com > /dev/null 2>&1', timeout=15, check=False)
            if rc != 0:
                _, _, rc2 = _ssh_run(ssh, 'ping -c 1 -W 5 8.8.8.8 > /dev/null 2>&1', timeout=10, check=False)
                if rc2 != 0:
                    raise RuntimeError('No internet connection. Check network settings.')
                _append_log(task, 'Internet: available (ping ok, curl to docker.com failed)')
            else:
                _append_log(task, 'Internet: available')
            _update_step(task, 2, 'prerequisites', 'success', 'Prerequisites OK')

            # Step 3: Install Docker
            task = ProvisionTask.objects.get(id=task_id)
            if task.status == 'failed':
                return
            _update_step(task, 3, 'install_docker', 'running', 'Installing Docker...')
            _append_log(task, '[Step 3] Installing Docker...')

            docker_freshly_installed = False
            _, _, rc = _ssh_run(ssh, 'command -v docker', timeout=10, check=False)
            if rc == 0:
                _append_log(task, 'Docker already installed, skipping.')
                # Also ensure docker compose plugin
                _, _, rc2 = _ssh_run(ssh, 'docker compose version', timeout=10, check=False)
                if rc2 != 0:
                    _append_log(task, 'Installing docker-compose-plugin...')
                    _ssh_run(ssh, 'sudo apt-get update -qq && sudo apt-get install -y -qq docker-compose-plugin',
                             sudo_password=ssh_password, timeout=120)
            else:
                _append_log(task, 'Installing Docker via get.docker.com...')
                _ssh_run(
                    ssh,
                    'curl -fsSL https://get.docker.com | sh',
                    timeout=300,
                )
                _append_log(task, 'Adding user to docker group...')
                _ssh_run(ssh, f'sudo usermod -aG docker {task.ssh_user}',
                         sudo_password=ssh_password, timeout=10)
                docker_freshly_installed = True

            out, _, _ = _ssh_run(ssh, 'docker --version', timeout=10)
            _append_log(task, f'Docker: {out.strip()}')

            # Reconnect SSH to pick up new docker group membership
            if docker_freshly_installed:
                _append_log(task, 'Reconnecting SSH to apply docker group...')
                if sftp:
                    sftp.close()
                    sftp = None
                ssh.close()
                time.sleep(2)
                ssh = paramiko.SSHClient()
                ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                for attempt in range(1, 4):
                    try:
                        ssh.connect(
                            hostname=task.ip_address,
                            port=task.ssh_port,
                            username=task.ssh_user,
                            password=ssh_password,
                            timeout=15,
                            look_for_keys=False,
                            allow_agent=False,
                        )
                        break
                    except Exception as e:
                        if attempt == 3:
                            raise RuntimeError(f'SSH reconnect failed after docker install: {e}') from e
                        _append_log(task, f'SSH reconnect attempt {attempt}/3 failed: {e}. Retrying in 5s...')
                        time.sleep(5)
                _append_log(task, 'SSH reconnected.')

            _update_step(task, 3, 'install_docker', 'success', 'Docker installed')

            # Step 4: Create directories
            task = ProvisionTask.objects.get(id=task_id)
            if task.status == 'failed':
                return
            _update_step(task, 4, 'create_dirs', 'running', 'Creating directories...')
            _append_log(task, '[Step 4] Creating directories...')

            home = f'/home/{task.ssh_user}'
            _ssh_run(ssh, f'sudo mkdir -p {home}/screenly/viewer {home}/screenly/staticfiles {home}/.screenly {home}/screenly_assets', sudo_password=ssh_password, timeout=10)
            _ssh_run(ssh, f'sudo chown -R {task.ssh_user}:{task.ssh_user} {home}/screenly {home}/.screenly {home}/screenly_assets', sudo_password=ssh_password, timeout=10)
            # Create placeholder files for bind mounts (docker compose fails if source files don't exist)
            _ssh_run(ssh, f'touch {home}/screenly/viewer/__init__.py {home}/screenly/viewer/media_player.py', timeout=10)
            _append_log(task, 'Directories created.')
            _update_step(task, 4, 'create_dirs', 'success', 'Directories created')

            # Step 5: Upload docker-compose.yml
            task = ProvisionTask.objects.get(id=task_id)
            if task.status == 'failed':
                return
            _update_step(task, 5, 'upload_compose', 'running', 'Uploading docker-compose.yml...')
            _append_log(task, '[Step 5] Uploading docker-compose.yml...')

            watchtower_token = 'anthias-player-update'
            # Read host MAC address for passing to container
            host_mac, _, _ = _ssh_run(
                ssh,
                "cat /sys/class/net/eth0/address 2>/dev/null || "
                "cat /sys/class/net/end0/address 2>/dev/null || "
                "cat /sys/class/net/wlan0/address 2>/dev/null || "
                "echo ''",
                timeout=5, check=False,
            )
            host_mac = host_mac.strip()
            compose_content = _render_compose(task.ip_address, task.ssh_user, watchtower_token, host_mac, device_type)
            sftp = ssh.open_sftp()
            compose_path = f'{home}/screenly/docker-compose.yml'
            with sftp.file(compose_path, 'w') as f:
                f.write(compose_content)
            _append_log(task, f'Uploaded {compose_path}')
            _update_step(task, 5, 'upload_compose', 'success', 'docker-compose.yml uploaded')

            # Step 6: Upload configs
            task = ProvisionTask.objects.get(id=task_id)
            if task.status == 'failed':
                return
            _update_step(task, 6, 'upload_configs', 'running', 'Uploading configs...')
            _append_log(task, '[Step 6] Uploading configuration files...')

            # .asoundrc for HDMI audio
            asoundrc = (
                'pcm.!default {\n'
                '  type hw\n'
                '  card 0\n'
                '}\n'
                'ctl.!default {\n'
                '  type hw\n'
                '  card 0\n'
                '}\n'
            )
            with sftp.file(f'{home}/.asoundrc', 'w') as f:
                f.write(asoundrc)
            _append_log(task, 'Uploaded .asoundrc')

            # screenly.conf (minimal defaults)
            screenly_conf = (
                '[viewer]\n'
                'player_name =\n'
                'show_splash = no\n'
                'audio_output = hdmi\n'
                'shuffle_playlist = no\n'
                'default_duration = 10\n'
                'default_streaming_duration = 300\n'
                'use_24_hour_clock = yes\n'
                'date_format = YYYY/MM/DD\n'
                'debug_logging = no\n'
                'verify_ssl = no\n'
            )
            with sftp.file(f'{home}/.screenly/screenly.conf', 'w') as f:
                f.write(screenly_conf)
            _append_log(task, 'Uploaded screenly.conf')

            # media_player.py (bind-mounted into viewer container)
            import os
            media_player_src = os.path.join(
                settings.BASE_DIR, 'provision', 'templates', 'media_player.py'
            )
            if os.path.exists(media_player_src):
                with open(media_player_src, 'r') as src:
                    mp_content = src.read()
                with sftp.file(f'{home}/screenly/viewer/media_player.py', 'w') as f:
                    f.write(mp_content)
                _append_log(task, 'Uploaded viewer/media_player.py')
            else:
                _append_log(task, 'WARNING: media_player.py template not found, skipping')

            _update_step(task, 6, 'upload_configs', 'success', 'Configs uploaded')

            # Step 7: Docker pull (one image at a time for reliability + progress)
            task = ProvisionTask.objects.get(id=task_id)
            if task.status == 'failed':
                return
            _update_step(task, 7, 'docker_pull', 'running', 'Pulling Docker images...')
            _append_log(task, '[Step 7] Pulling Docker images (this may take a while)...')

            # Pull images one-by-one instead of `docker compose pull` which can hang
            tag = f'latest-{device_type}-64'
            images = [
                ('redis', f'ghcr.io/alex1981-tech/anthias-redis:{tag}'),
                ('watchtower', 'containrrr/watchtower:latest'),
                ('nginx', f'ghcr.io/alex1981-tech/anthias-nginx:{tag}'),
                ('websocket', f'ghcr.io/alex1981-tech/anthias-websocket:{tag}'),
                ('server', f'ghcr.io/alex1981-tech/anthias-server:{tag}'),
                ('celery', f'ghcr.io/alex1981-tech/anthias-celery:{tag}'),
                ('viewer', f'ghcr.io/alex1981-tech/anthias-viewer:{tag}'),
            ]
            for idx, (name, image) in enumerate(images, 1):
                task = ProvisionTask.objects.get(id=task_id)
                if task.status == 'failed':
                    return
                _update_step(task, 7, 'docker_pull', 'running',
                             f'Pulling {name} ({idx}/{len(images)})...')
                _append_log(task, f'  Pulling {name} ({idx}/{len(images)}): {image}')
                out, err, _ = _ssh_run(
                    ssh,
                    f'docker pull {image} 2>&1',
                    timeout=600,
                )
                # Log last 500 chars of output (digest/status)
                short_out = out.strip().split('\n')[-1] if out.strip() else ''
                _append_log(task, f'  -> {short_out}')

            _update_step(task, 7, 'docker_pull', 'success', f'All {len(images)} images pulled')

            # Step 8: Docker up
            task = ProvisionTask.objects.get(id=task_id)
            if task.status == 'failed':
                return
            _update_step(task, 8, 'docker_up', 'running', 'Starting containers...')
            _append_log(task, '[Step 8] Starting containers...')

            out, err, _ = _ssh_run(
                ssh,
                f'cd {home}/screenly && docker compose up -d 2>&1',
                timeout=120,
            )
            _append_log(task, out[-1000:] if len(out) > 1000 else out)
            _update_step(task, 8, 'docker_up', 'success', 'Containers started')

            # Step 9: Wait for player to be ready
            task = ProvisionTask.objects.get(id=task_id)
            if task.status == 'failed':
                return
            _update_step(task, 9, 'wait_ready', 'running', 'Waiting for player API...')
            _append_log(task, '[Step 9] Waiting for player to be ready...')

            ready = False
            for attempt in range(24):
                time.sleep(5)
                _, _, rc = _ssh_run(
                    ssh,
                    'curl -sf --max-time 5 http://localhost/api/v2/info > /dev/null 2>&1',
                    timeout=10,
                    check=False,
                )
                if rc == 0:
                    ready = True
                    _append_log(task, f'Player API ready (attempt {attempt + 1})')
                    break
                _append_log(task, f'Attempt {attempt + 1}/24: not ready yet...')

            if not ready:
                raise RuntimeError('Player API did not become ready within 2 minutes.')
            _update_step(task, 9, 'wait_ready', 'success', 'Player is ready')

            # Step 10: Install phone-home timer
            task = ProvisionTask.objects.get(id=task_id)
            if task.status == 'failed':
                return
            _update_step(task, 10, 'phonehome', 'running', 'Installing phone-home...')
            _append_log(task, '[Step 10] Installing phone-home timer...')

            if fm_server_url:
                # Get register token from settings
                register_token = getattr(settings, 'PLAYER_REGISTER_TOKEN', '')

                auth_header = ''
                if register_token:
                    auth_header = f'\n  -H "Authorization: Bearer {register_token}" \\'

                phonehome_script = f'''#!/bin/bash
# Anthias phone-home script
SERVER="{fm_server_url}"
URL="http://$(hostname -I | awk '{{print $1}}')"
NAME="$(hostname)"
INFO=$(curl -sf http://localhost/api/v2/info 2>/dev/null || echo '{{}}')

# Detect hardware MAC address (prefer wired, then wireless)
MAC=""
for iface in eth0 end0 wlan0; do
  [ -f "/sys/class/net/$iface/address" ] && MAC=$(cat "/sys/class/net/$iface/address") && break
done
MAC_FIELD=""
if [ -n "$MAC" ]; then
  MAC_FIELD=",\\"mac_address\\":\\"$MAC\\""
fi

# Detect Tailscale IP if available
TS_IP=""
if command -v tailscale >/dev/null 2>&1; then
  TS_IP=$(tailscale ip -4 2>/dev/null || true)
fi
TS_FIELD=""
if [ -n "$TS_IP" ]; then
  TS_FIELD=",\\"tailscale_ip\\":\\"$TS_IP\\""
fi

curl -sf -X POST "${{SERVER}}/api/players/register/" \\
  -H "Content-Type: application/json" \\{auth_header}
  -d "{{\\"url\\":\\"${{URL}}\\",\\"name\\":\\"${{NAME}}\\",\\"info\\":${{INFO}}$MAC_FIELD$TS_FIELD}}"
'''
                _ssh_run(ssh, f'sudo mkdir -p /usr/local/bin', sudo_password=ssh_password, timeout=10)
                with sftp.file(f'{home}/anthias-phonehome.sh', 'w') as f:
                    f.write(phonehome_script)
                _ssh_run(ssh, f'sudo mv {home}/anthias-phonehome.sh /usr/local/bin/anthias-phonehome.sh',
                         sudo_password=ssh_password, timeout=10)
                _ssh_run(ssh, 'sudo chmod +x /usr/local/bin/anthias-phonehome.sh',
                         sudo_password=ssh_password, timeout=10)

                # systemd service
                service_unit = '''[Unit]
Description=Anthias Phone Home
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/anthias-phonehome.sh
'''
                with sftp.file(f'{home}/anthias-phonehome.service', 'w') as f:
                    f.write(service_unit)
                _ssh_run(ssh, f'sudo mv {home}/anthias-phonehome.service /etc/systemd/system/',
                         sudo_password=ssh_password, timeout=10)

                # systemd timer
                timer_unit = '''[Unit]
Description=Anthias Phone Home Timer

[Timer]
OnBootSec=30
OnUnitActiveSec=5min
Unit=anthias-phonehome.service

[Install]
WantedBy=timers.target
'''
                with sftp.file(f'{home}/anthias-phonehome.timer', 'w') as f:
                    f.write(timer_unit)
                _ssh_run(ssh, f'sudo mv {home}/anthias-phonehome.timer /etc/systemd/system/',
                         sudo_password=ssh_password, timeout=10)

                _ssh_run(ssh, 'sudo systemctl daemon-reload && sudo systemctl enable --now anthias-phonehome.timer',
                         sudo_password=ssh_password, timeout=15)
                _append_log(task, 'Phone-home timer installed and started.')
            else:
                _append_log(task, 'No FM server URL provided, skipping phone-home.')

            _update_step(task, 10, 'phonehome', 'success', 'Phone-home installed')

            # Step 11: Install Tailscale (optional, non-fatal)
            task = ProvisionTask.objects.get(id=task_id)
            if task.status == 'failed':
                return
            _update_step(task, 11, 'tailscale', 'running', 'Installing Tailscale...')
            _append_log(task, '[Step 11] Installing Tailscale (optional)...')

            tailscale_ip = None
            try:
                # Check if FM has a Tailscale authkey configured
                ts_authkey_encrypted = cache.get('system:tailscale_authkey')
                if ts_authkey_encrypted:
                    from players.models import _get_fernet as _get_model_fernet
                    try:
                        f = _get_model_fernet()
                        ts_authkey = f.decrypt(ts_authkey_encrypted.encode()).decode()
                    except Exception:
                        ts_authkey = ''

                    if ts_authkey:
                        # Install Tailscale
                        _, _, rc = _ssh_run(ssh, 'command -v tailscale', timeout=10, check=False)
                        if rc != 0:
                            _append_log(task, 'Installing Tailscale...')
                            _ssh_run(
                                ssh,
                                'curl -fsSL https://tailscale.com/install.sh | sh',
                                timeout=120,
                            )
                        else:
                            _append_log(task, 'Tailscale already installed.')

                        # Authenticate
                        _append_log(task, 'Authenticating with Tailscale...')
                        _ssh_run(
                            ssh,
                            f'sudo tailscale up --authkey={_shell_quote(ts_authkey)}',
                            sudo_password=ssh_password,
                            timeout=30,
                        )

                        # Get Tailscale IP
                        out, _, _ = _ssh_run(ssh, 'tailscale ip -4', timeout=10)
                        tailscale_ip = out.strip()
                        _append_log(task, f'Tailscale connected: {tailscale_ip}')
                        _update_step(task, 11, 'tailscale', 'success', f'Tailscale: {tailscale_ip}')
                    else:
                        _append_log(task, 'Tailscale authkey decryption failed, skipping.')
                        _update_step(task, 11, 'tailscale', 'skipped', 'Auth key error')
                else:
                    _append_log(task, 'No Tailscale authkey configured in FM settings, skipping.')
                    _update_step(task, 11, 'tailscale', 'skipped', 'No auth key configured')
            except Exception as e:
                _append_log(task, f'Tailscale setup failed (non-fatal): {e}')
                _update_step(task, 11, 'tailscale', 'skipped', f'Non-fatal: {e}')

            # Step 12: Silent boot (non-fatal)
            task = ProvisionTask.objects.get(id=task_id)
            if task.status == 'failed':
                return
            _update_step(task, 12, 'silent_boot', 'running', 'Configuring silent boot...')
            _append_log(task, '[Step 12] Configuring silent boot (non-fatal)...')

            try:
                silent_boot_script = '''#!/bin/bash
set -e
FLAG="$HOME/.screenly/.silent-boot-done"
[ -f "$FLAG" ] && exit 0

# Disable rainbow splash
sudo bash -c 'grep -q "disable_splash" /boot/firmware/config.txt 2>/dev/null || echo "disable_splash=1" >> /boot/firmware/config.txt'
# Force HDMI output even without monitor (creates /dev/fb0 always)
sudo bash -c 'grep -q "hdmi_force_hotplug" /boot/firmware/config.txt 2>/dev/null || echo "hdmi_force_hotplug=1" >> /boot/firmware/config.txt'
# Hide kernel text, redirect console to tty3
sudo bash -c 'if [ -f /boot/firmware/cmdline.txt ]; then sed -i "s/console=tty1/console=tty3/" /boot/firmware/cmdline.txt; fi'
sudo bash -c 'if [ -f /boot/firmware/cmdline.txt ]; then grep -q "quiet" /boot/firmware/cmdline.txt || sed -i "s/$/ quiet loglevel=0 logo.nologo vt.global_cursor_default=0 consoleblank=0/" /boot/firmware/cmdline.txt; fi'
# Disable login prompt on tty1
sudo systemctl disable getty@tty1.service 2>/dev/null || true

touch "$FLAG"
'''
                with sftp.file(f'{home}/setup-silent-boot.sh', 'w') as f:
                    f.write(silent_boot_script)
                _ssh_run(ssh, f'chmod +x {home}/setup-silent-boot.sh && bash {home}/setup-silent-boot.sh',
                         sudo_password=ssh_password, timeout=30, check=False)
                # Disable cursor immediately (kernel param takes effect after reboot)
                _ssh_run(ssh, 'sudo bash -c "echo 0 > /sys/class/graphics/fbcon/cursor_blink; '
                         'setterm -cursor off > /dev/tty1 2>/dev/null; '
                         'setterm -cursor off > /dev/tty0 2>/dev/null" || true',
                         sudo_password=ssh_password, timeout=10, check=False)
                _append_log(task, 'Silent boot configured + cursor hidden.')
                _update_step(task, 12, 'silent_boot', 'success', 'Silent boot configured')
            except Exception as e:
                _append_log(task, f'Silent boot setup failed (non-fatal): {e}')
                _update_step(task, 12, 'silent_boot', 'skipped', f'Non-fatal: {e}')

            # All done — create Player record
            from .models import Player
            player_name = task.player_name or f'Player {task.ip_address}'
            player_url = f'http://{task.ip_address}'

            player_defaults = {
                'name': player_name,
                'is_online': True,
                'last_seen': timezone.now(),
                'device_type': device_type,
                'mac_address': host_mac,
            }
            if tailscale_ip:
                player_defaults['tailscale_ip'] = tailscale_ip
                player_defaults['tailscale_enabled'] = True
                player_defaults['url'] = f'http://{tailscale_ip}'
            else:
                player_defaults['url'] = player_url

            # Match by MAC first (avoids duplicates when IP changes),
            # then fall back to URL match, then create new.
            player = None
            created = False
            if host_mac:
                player = Player.objects.filter(mac_address=host_mac).first()
            if not player:
                player = Player.objects.filter(url=player_url).first()

            if player:
                player.name = player_name
                player.url = player_defaults['url']
                player.is_online = True
                player.last_seen = timezone.now()
                player.device_type = device_type
                player.mac_address = host_mac
                if tailscale_ip:
                    player.tailscale_ip = tailscale_ip
                    player.tailscale_enabled = True
                player.save(update_fields=['name', 'url', 'is_online', 'last_seen',
                                           'device_type', 'mac_address',
                                           'tailscale_ip', 'tailscale_enabled'])
            else:
                player = Player.objects.create(**player_defaults)
                created = True

            task.player = player
            task.status = 'success'
            task.save(update_fields=['player', 'status'])
            _append_log(task, f'Provisioning complete! Player "{player.name}" added.')

        except Exception as e:
            logger.exception('Provisioning failed for task %s', task_id)
            task = ProvisionTask.objects.get(id=task_id)
            task.status = 'failed'
            task.error_message = str(e)[:1000]
            task.save(update_fields=['status', 'error_message'])
            _append_log(task, f'ERROR: {e}')

            # Mark current step as failed
            if task.steps:
                last_step = task.steps[-1]
                if last_step.get('status') == 'running':
                    _update_step(
                        task, last_step['step'], last_step['name'],
                        'failed', str(e)[:200],
                    )

        finally:
            if sftp:
                try:
                    sftp.close()
                except Exception:
                    pass
            if ssh:
                try:
                    ssh.close()
                except Exception:
                    pass

except ImportError:
    # Celery not available (e.g., during migrations)
    pass
