"""
Auto-update nginx.conf in the nginx container via Docker exec API.
Called from docker-entrypoint.sh on web container startup.
This ensures Watchtower image updates also propagate nginx config changes,
even when nginx.conf is bind-mounted from the host.
"""
import http.client
import json
import socket
import struct
import base64

DOCKER_SOCK = '/var/run/docker.sock'
NGINX_CONF_PATH = '/app/nginx.conf'


class DockerAPI(http.client.HTTPConnection):
    def __init__(self):
        super().__init__('localhost')

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(DOCKER_SOCK)


def find_nginx_container():
    conn = DockerAPI()
    conn.request('GET', '/containers/json')
    resp = conn.getresponse()
    containers = json.loads(resp.read())

    for c in containers:
        names = c.get('Names', [])
        for name in names:
            if 'nginx' in name.lower() and 'fleet' in name.lower():
                return c['Id']
    return None


def get_nginx_current_config(container_id):
    """Read current nginx config from the container via exec."""
    conn = DockerAPI()
    body = json.dumps({
        'Cmd': ['cat', '/etc/nginx/conf.d/default.conf'],
        'AttachStdout': True,
    })
    conn.request(
        'POST',
        f'/containers/{container_id}/exec',
        body=body,
        headers={'Content-Type': 'application/json'},
    )
    resp = conn.getresponse()
    if resp.status != 201:
        return None
    exec_id = json.loads(resp.read())['Id']

    conn2 = DockerAPI()
    conn2.request(
        'POST',
        f'/exec/{exec_id}/start',
        body=json.dumps({'Detach': False}),
        headers={'Content-Type': 'application/json'},
    )
    resp2 = conn2.getresponse()
    raw = resp2.read()

    # Docker multiplexed stream: 8-byte header per frame
    output = b''
    pos = 0
    while pos < len(raw):
        if pos + 8 > len(raw):
            break
        _type, size = struct.unpack('>BxxxI', raw[pos:pos + 8])
        pos += 8
        output += raw[pos:pos + size]
        pos += size
    return output.decode('utf-8', errors='replace')


def write_config_via_exec(container_id, config_content):
    """Write nginx config using exec + sh -c 'cat <<EOF > file'."""
    # Base64 encode to avoid shell escaping issues
    b64 = base64.b64encode(config_content.encode()).decode()

    conn = DockerAPI()
    body = json.dumps({
        'Cmd': ['sh', '-c', f'echo "{b64}" | base64 -d > /etc/nginx/conf.d/default.conf'],
        'AttachStdout': True,
        'AttachStderr': True,
    })
    conn.request(
        'POST',
        f'/containers/{container_id}/exec',
        body=body,
        headers={'Content-Type': 'application/json'},
    )
    resp = conn.getresponse()
    if resp.status != 201:
        return False
    exec_id = json.loads(resp.read())['Id']

    conn2 = DockerAPI()
    conn2.request(
        'POST',
        f'/exec/{exec_id}/start',
        body=json.dumps({'Detach': False}),
        headers={'Content-Type': 'application/json'},
    )
    resp2 = conn2.getresponse()
    resp2.read()

    # Check exit code
    conn3 = DockerAPI()
    conn3.request('GET', f'/exec/{exec_id}/json')
    resp3 = conn3.getresponse()
    info = json.loads(resp3.read())
    return info.get('ExitCode', 1) == 0


def reload_nginx(container_id):
    conn = DockerAPI()
    conn.request('POST', f'/containers/{container_id}/kill?signal=HUP')
    resp = conn.getresponse()
    resp.read()
    return resp.status == 204


if __name__ == '__main__':
    nginx_id = find_nginx_container()
    if not nginx_id:
        print('Nginx container not found, skipping config update')
        exit(0)

    with open(NGINX_CONF_PATH) as f:
        desired_config = f.read()

    current_config = get_nginx_current_config(nginx_id)
    if current_config and current_config.strip() == desired_config.strip():
        print('Nginx config already up to date')
        exit(0)

    if write_config_via_exec(nginx_id, desired_config):
        if reload_nginx(nginx_id):
            print('Nginx config updated and reloaded successfully')
        else:
            print('Nginx config written but reload failed')
    else:
        print('Failed to write nginx config')
        exit(1)
