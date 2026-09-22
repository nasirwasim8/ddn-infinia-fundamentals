import boto3
import json
import os
from botocore.config import Config

CONFIG_PATH = os.path.join(os.path.dirname(__file__), '..', 'infinia_config.json')
S3_TENANTS_PATH = os.path.join(os.path.dirname(__file__), '..', 'infinia_s3_tenants.json')

# ── Global config (mgmt server, legacy single S3) ─────────────────
def load_config() -> dict:
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {}

def save_config(data: dict):
    with open(CONFIG_PATH, 'w') as f:
        json.dump(data, f, indent=2)

# ── Per-tenant S3 credential store ────────────────────────────────
def load_s3_tenants() -> dict:
    """Return dict of {tenant_label: {endpoint, access_key, secret_key, tenant_name}}"""
    if os.path.exists(S3_TENANTS_PATH):
        with open(S3_TENANTS_PATH) as f:
            return json.load(f)
    # Bootstrap from legacy single config
    cfg = load_config()
    if cfg.get('access_key'):
        tenants = {
            'red': {
                'label': 'red',
                'tenant_name': 'red',
                'endpoint': cfg.get('endpoint', 'https://192.168.147.129:8111'),
                'access_key': cfg.get('access_key', ''),
                'secret_key': cfg.get('secret_key', ''),
                'description': 'Default (from S3 config)',
            }
        }
        _save_s3_tenants(tenants)
        return tenants
    return {}

def _save_s3_tenants(tenants: dict):
    with open(S3_TENANTS_PATH, 'w') as f:
        json.dump(tenants, f, indent=2)

def save_s3_tenant(label: str, data: dict):
    tenants = load_s3_tenants()
    tenants[label] = data
    _save_s3_tenants(tenants)

def delete_s3_tenant(label: str):
    tenants = load_s3_tenants()
    tenants.pop(label, None)
    _save_s3_tenants(tenants)

# ── S3 client factory ─────────────────────────────────────────────
def get_s3_client(tenant: str = None):
    """
    Return a boto3 S3 client.
    - If tenant is specified, use that tenant's stored credentials.
    - If tenant is None or not found, fall back to the global (legacy) config.
    """
    if tenant:
        tenants = load_s3_tenants()
        creds = tenants.get(tenant)
        if creds:
            return boto3.client(
                's3',
                endpoint_url=creds.get('endpoint', 'https://192.168.147.129:8111'),
                aws_access_key_id=creds.get('access_key', ''),
                aws_secret_access_key=creds.get('secret_key', ''),
                verify=False,
                config=Config(signature_version='s3v4', s3={'addressing_style': 'path'})
            )
    # Fall back to global config
    cfg = load_config()
    return boto3.client(
        's3',
        endpoint_url=cfg.get('endpoint', 'https://192.168.147.129:8111'),
        aws_access_key_id=cfg.get('access_key', ''),
        aws_secret_access_key=cfg.get('secret_key', ''),
        verify=False,
        config=Config(signature_version='s3v4', s3={'addressing_style': 'path'})
    )


# ── Compatibility shim for management.py ──────────────────────────
import httpx as _httpx

def get_mgmt_client():
    cfg = load_config()
    return _httpx.Client(
        base_url=cfg.get('mgmt_endpoint', 'https://192.168.147.129:12023'),
        auth=(cfg.get('mgmt_user', 'realm_admin'), cfg.get('mgmt_password', '')),
        verify=False,
        timeout=30
    )
