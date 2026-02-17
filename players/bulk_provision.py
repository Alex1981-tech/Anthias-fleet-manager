"""Bulk provisioning: network scanning + batch player provisioning."""

import ipaddress
import logging
import socket
import subprocess

import paramiko
from celery import shared_task

logger = logging.getLogger(__name__)

DEFAULT_SSH_TIMEOUT = 3


def scan_network_arp():
    """Scan local network using ARP table. Returns list of IP strings."""
    ips = []
    try:
        result = subprocess.run(
            ['ip', 'neigh'],
            capture_output=True, text=True, timeout=10,
        )
        for line in result.stdout.strip().split('\n'):
            parts = line.split()
            if len(parts) >= 1 and parts[-1] in ('REACHABLE', 'STALE', 'DELAY'):
                ip = parts[0]
                try:
                    ipaddress.ip_address(ip)
                    ips.append(ip)
                except ValueError:
                    pass
    except Exception as e:
        logger.warning('ARP scan failed: %s', e)

    # Also try arp -a as fallback
    if not ips:
        try:
            result = subprocess.run(
                ['arp', '-a'],
                capture_output=True, text=True, timeout=10,
            )
            for line in result.stdout.strip().split('\n'):
                # Parse: hostname (ip) at mac ...
                if '(' in line and ')' in line:
                    ip = line.split('(')[1].split(')')[0]
                    try:
                        ipaddress.ip_address(ip)
                        ips.append(ip)
                    except ValueError:
                        pass
        except Exception as e:
            logger.warning('arp -a fallback failed: %s', e)

    return sorted(set(ips))


def scan_network_range(start_ip, end_ip):
    """Scan IP range by trying SSH connect (port 22). Returns list of IPs with SSH open."""
    start = ipaddress.ip_address(start_ip)
    end = ipaddress.ip_address(end_ip)
    ips = []

    current = start
    while current <= end:
        ip_str = str(current)
        if _check_ssh_port(ip_str):
            ips.append(ip_str)
        current = ipaddress.ip_address(int(current) + 1)
        if len(ips) >= 50:  # Safety limit
            break

    return ips


def _check_ssh_port(ip, port=22, timeout=2):
    """Check if SSH port is open on given IP."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((ip, port))
        sock.close()
        return result == 0
    except Exception:
        return False


def check_is_raspberry_pi(ip, ssh_user='pi', ssh_password='', timeout=5):
    """Try SSH and check if host is a Raspberry Pi (aarch64)."""
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            hostname=ip,
            username=ssh_user,
            password=ssh_password,
            timeout=timeout,
            look_for_keys=False,
            allow_agent=False,
        )
        _, stdout, _ = client.exec_command('uname -m', timeout=5)
        arch = stdout.read().decode().strip()
        client.close()
        return arch in ('aarch64', 'armv7l', 'armv8l')
    except Exception:
        return False


@shared_task(bind=True)
def bulk_provision_task(self, task_id):
    """Celery task: provision multiple players sequentially."""
    from .models import BulkProvisionTask
    from .provision import provision_player_sync

    try:
        task = BulkProvisionTask.objects.get(pk=task_id)
    except BulkProvisionTask.DoesNotExist:
        logger.error('BulkProvisionTask %s not found', task_id)
        return

    task.status = 'provisioning'
    task.save(update_fields=['status'])

    ssh_password = task.get_ssh_password()
    results = {}

    for ip in task.selected_ips:
        results[ip] = {'status': 'provisioning'}
        task.results = results
        task.save(update_fields=['results'])

        try:
            # Create individual ProvisionTask and run it via Celery (synchronously awaited)
            from .provision import ProvisionTask, provision_player
            prov_task = ProvisionTask.objects.create(
                ip_address=ip,
                ssh_user=task.ssh_user,
                ssh_port=22,
                player_name=f'Player-{ip.replace(".", "-")}',
                status='pending',
                total_steps=12,
            )
            # Call the Celery task directly (not .delay()) to run synchronously in this worker
            provision_player(str(prov_task.id), ssh_password)

            prov_task.refresh_from_db()
            results[ip] = {
                'status': prov_task.status,
                'player_id': str(prov_task.player_id) if prov_task.player_id else None,
                'task_id': str(prov_task.id),
                'error': prov_task.error_message,
            }
        except Exception as e:
            logger.exception('Bulk provision failed for %s', ip)
            results[ip] = {
                'status': 'failed',
                'error': str(e),
            }

        task.results = results
        task.save(update_fields=['results'])

    # Determine overall status
    statuses = [r.get('status') for r in results.values()]
    if all(s == 'success' for s in statuses):
        task.status = 'completed'
    elif any(s == 'success' for s in statuses):
        task.status = 'completed'  # partial success
    else:
        task.status = 'failed'
    task.save(update_fields=['status'])
