"""
Management plane client for DDN Infinia.
Uses Bearer JWT token auth against https://{server}/redapi/v1/...
Token is acquired via GET /redapi/v1/auth_user (User_id + Password headers)
"""
import json
import os
import requests
import warnings
from urllib3.exceptions import InsecureRequestWarning

warnings.simplefilter('ignore', InsecureRequestWarning)

CONFIG_PATH = os.path.join(os.path.dirname(__file__), '..', 'infinia_config.json')
TOKEN_PATH = os.path.join(os.path.dirname(__file__), '..', 'infinia_token.json')

def load_config():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {}

def load_token() -> dict:
    if os.path.exists(TOKEN_PATH):
        with open(TOKEN_PATH) as f:
            return json.load(f)
    return {}

def save_token(data: dict):
    with open(TOKEN_PATH, 'w') as f:
        json.dump(data, f, indent=2)

def get_mgmt_base() -> str:
    cfg = load_config()
    server = cfg.get('mgmt_server', '192.168.147.129')
    return f"https://{server}"

def get_bearer_token() -> str | None:
    data = load_token()
    return data.get('token')

def mgmt_get(path: str, extra_headers: dict = None) -> requests.Response:
    """Make an authenticated GET to the management API."""
    token = get_bearer_token()
    headers = {
        'accept': 'application/json',
        'Authorization': f'Bearer {token}',
    }
    if extra_headers:
        headers.update(extra_headers)
    url = get_mgmt_base() + path
    return requests.get(url, headers=headers, verify=False, timeout=30)

def mgmt_post(path: str, payload: dict = None, extra_headers: dict = None) -> requests.Response:
    """Make an authenticated POST to the management API."""
    token = get_bearer_token()
    headers = {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}',
    }
    if extra_headers:
        headers.update(extra_headers)
    url = get_mgmt_base() + path
    return requests.post(url, headers=headers, json=payload or {}, verify=False, timeout=30)

def mgmt_put(path: str, payload: dict = None, extra_headers: dict = None) -> requests.Response:
    token = get_bearer_token()
    headers = {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}',
    }
    if extra_headers:
        headers.update(extra_headers)
    url = get_mgmt_base() + path
    return requests.put(url, headers=headers, json=payload or {}, verify=False, timeout=30)

def mgmt_delete(path: str, extra_headers: dict = None) -> requests.Response:
    token = get_bearer_token()
    headers = {
        'accept': 'application/json',
        'Authorization': f'Bearer {token}',
    }
    if extra_headers:
        headers.update(extra_headers)
    url = get_mgmt_base() + path
    return requests.delete(url, headers=headers, verify=False, timeout=30)

def get_first_cluster() -> str | None:
    """Helper: return the first cluster name."""
    r = mgmt_get('/redapi/v1/clusters')
    if r.status_code == 200:
        data = r.json().get('data', {})
        clusters = list(data.keys()) if isinstance(data, dict) else []
        return clusters[0] if clusters else None
    return None
