"""
Admin Auth Router
POST /api/admin/auth/login   — authenticate, store JWT
GET  /api/admin/auth/status  — validate current token + return user info
POST /api/admin/auth/logout  — clear token
"""
import requests
import warnings
from urllib3.exceptions import InsecureRequestWarning
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.config_mgmt import (
    get_mgmt_base, save_token, load_token, get_bearer_token, mgmt_get, load_config
)

warnings.simplefilter('ignore', InsecureRequestWarning)
router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str
    server: str = ''   # optional override


@router.post("/auth/login")
def admin_login(req: LoginRequest):
    cfg = load_config()
    server = req.server or cfg.get('mgmt_server', '192.168.147.129')
    url = f"https://{server}/redapi/v1/auth_user"
    headers = {
        'User_id': req.username,
        'Password': req.password,
        'accept': 'application/json',
    }
    try:
        r = requests.get(url, headers=headers, verify=False, timeout=15)
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail=f"Login failed: {r.text}")
        data = r.json()
        token = data.get('data', {}).get('token')
        if not token:
            raise HTTPException(status_code=401, detail="No token in response")
        save_token({'token': token, 'username': req.username, 'server': server})
        return {"status": "success", "username": req.username, "server": server}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/auth/status")
def admin_status():
    token = get_bearer_token()
    if not token:
        return {"authenticated": False, "message": "Not logged in"}
    cfg = load_config()
    server = cfg.get('mgmt_server', '192.168.147.129')
    url = f"https://{server}/redapi/v1/accessible"
    headers = {
        'accept': 'application/json',
        'Authorization': f'Bearer {token}',
    }
    try:
        r = requests.get(url, headers=headers, verify=False, timeout=10)
        if r.status_code == 200:
            data = r.json()
            token_data = load_token()
            return {
                "authenticated": True,
                "username": token_data.get('username', 'unknown'),
                "server": server,
                "title": data.get('title', 'Accessible'),
            }
        return {"authenticated": False, "message": "Token expired or invalid"}
    except Exception as e:
        return {"authenticated": False, "message": str(e)}


@router.post("/auth/logout")
def admin_logout():
    save_token({})
    return {"status": "logged out"}
