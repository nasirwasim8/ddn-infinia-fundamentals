"""
SSH helper — execute redcli commands on the Infinia node via SSH.
Credentials are stored in infinia_config.json under 'ssh_host', 'ssh_user', 'ssh_password'.
"""
import re
import paramiko
from app.config_mgmt import load_config


def get_ssh_config() -> dict:
    cfg = load_config()
    return {
        'host':     cfg.get('ssh_host', cfg.get('mgmt_server', '192.168.147.129')),
        'user':     cfg.get('ssh_user', 'nwasim'),
        'password': cfg.get('ssh_password', ''),
        'port':     int(cfg.get('ssh_port', 22)),
    }


def ssh_exec(command: str) -> tuple[int, str, str]:
    """
    Run a command on the Infinia node via SSH.
    Returns (exit_code, stdout, stderr).
    """
    cfg = get_ssh_config()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=cfg['host'],
            port=cfg['port'],
            username=cfg['user'],
            password=cfg['password'],
            timeout=30,
            look_for_keys=False,
            allow_agent=False,
        )
        stdin, stdout, stderr = client.exec_command(command)
        exit_code = stdout.channel.recv_exit_status()
        return exit_code, stdout.read().decode(), stderr.read().decode()
    finally:
        client.close()


def redcli_s3_access_add(username: str, tenant: str, expiry: str = '1y') -> dict:
    """
    Run: redcli s3 access add <username> -t <tenant> -e <expiry>
    Parse and return {s3_key, s3_secret, expiration, tenant, username}.
    Raises RuntimeError on failure.
    """
    cmd = f"redcli s3 access add {username} -t {tenant} -e {expiry}"
    exit_code, stdout, stderr = ssh_exec(cmd)

    output = stdout + stderr

    # Parse table output:
    # │     S3_KEY │                     8T0OVNJ4AOHGR852T8X0 │
    def extract(label: str) -> str:
        m = re.search(rf'│\s*{label}\s*│\s*(\S+)\s*│', output)
        return m.group(1) if m else ''

    s3_key    = extract('S3_KEY')
    s3_secret = extract('S3_SECRET')
    expiration = extract('EXPIRATION') or extract('EXPIRATION │')

    # Fallback: try alternate regex for the full expiration date (has spaces)
    if not expiration:
        m = re.search(r'EXPIRATION\s*│\s*([\d\-: ]+?)\s*│', output)
        expiration = m.group(1).strip() if m else ''

    if not s3_key or not s3_secret:
        raise RuntimeError(f"redcli failed or key not in output.\nSTDOUT: {stdout}\nSTDERR: {stderr}")

    return {
        's3_key':     s3_key,
        's3_secret':  s3_secret,
        'expiration': expiration,
        'tenant':     tenant,
        'username':   username,
    }


def redcli_user_add(username: str, tenant: str, password: str = 'DDN@Infinia2024!') -> bool:
    """
    Run: redcli user add <username> -t <tenant> -p <password>
    Returns True on success.
    """
    cmd = f"redcli user add {username} -t {tenant} -p '{password}'"
    exit_code, stdout, stderr = ssh_exec(cmd)
    output = stdout + stderr
    return 'has been added' in output or 'already exists' in output.lower()


def redcli_user_grant(username: str, scope: str) -> bool:
    """
    Run: redcli user grant <username> <scope>
    e.g. scope = 'yellow/yellow-subtenant-1/yellowobj:data-access'
    """
    cmd = f"redcli user grant {username} {scope}"
    exit_code, stdout, stderr = ssh_exec(cmd)
    output = stdout + stderr
    return 'granted' in output.lower()


def redcli_s3_access_list(tenant: str) -> list:
    """
    Run: redcli s3 access list -t <tenant> -a
    Output is a box-drawing table:
      │ USER_NAME │ TENANT │ S3_KEY │ EXPIRATION │ GROUP │ EXPIRED │
      │ s3admin   │ red    │ ABCDE  │ 2027-...   │       │ false   │
    Parse by splitting each row on │ and mapping to header columns.
    """
    cmd = f"redcli s3 access list -t {tenant} -a"
    exit_code, stdout, stderr = ssh_exec(cmd)
    records = []
    headers: list = []
    lines = (stdout + stderr).split('\n')

    def parse_cells(line: str) -> list:
        cells = [c.strip() for c in line.split('│')]
        # Strip only leading and trailing empty strings from │ at line edges
        while cells and not cells[0]:
            cells.pop(0)
        while cells and not cells[-1]:
            cells.pop()
        return cells

    for line in lines:
        if '│' not in line:
            continue
        cells = parse_cells(line)
        if not cells:
            continue
        # Detect header row
        if 'USER_NAME' in cells or 'S3_KEY' in cells:
            headers = cells
            continue
        # Skip box-drawing separator rows (─── only)
        if cells and all(set(c) <= set('─┼┬┴├┤ ') for c in cells):
            continue
        # Data row — must match header column count
        if headers and len(cells) == len(headers):
            rec = dict(zip(headers, cells))
            records.append({
                'user_name':  rec.get('USER_NAME', ''),
                'username':   rec.get('USER_NAME', ''),
                'tenant':     rec.get('TENANT', tenant),
                's3_key':     rec.get('S3_KEY', ''),
                'expiration': rec.get('EXPIRATION', ''),
                'expired':    rec.get('EXPIRED', ''),
            })
    return records
