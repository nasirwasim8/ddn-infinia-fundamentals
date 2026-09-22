from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.config import load_config, save_config, get_s3_client

router = APIRouter()

class ConfigModel(BaseModel):
    # S3 endpoint (default / red tenant)
    endpoint: str = "https://192.168.147.129:8111"
    access_key: str = ""
    secret_key: str = ""
    test_bucket: str = "ddn-infinia-rag-01"
    # Management API
    mgmt_server: str = "192.168.147.129"
    mgmt_endpoint: str = "https://192.168.147.129:12023"
    mgmt_user: str = "realm_admin"
    mgmt_password: str = ""
    # SSH access (for redcli)
    ssh_host: str = ""
    ssh_user: str = ""
    ssh_password: str = ""
    ssh_port: int = 22

MASK = "***"

@router.get("/config")
def get_config():
    cfg = load_config()
    masked = dict(cfg)
    for field in ("secret_key", "mgmt_password", "ssh_password"):
        if masked.get(field):
            masked[field] = MASK
    return masked

@router.post("/config")
def set_config(config: ConfigModel):
    data = config.dict()
    existing = load_config()
    # Preserve masked-out secrets
    for field in ("secret_key", "mgmt_password", "ssh_password"):
        if data.get(field) == MASK:
            data[field] = existing.get(field, "")
    save_config(data)
    return {"status": "success"}

@router.post("/config/test")
def test_connection():
    try:
        s3 = get_s3_client()
        response = s3.list_buckets()
        buckets = response.get('Buckets', [])
        owner = response.get('Owner', {})
        return {
            "status": "connected",
            "buckets_count": len(buckets),
            "owner": owner.get('DisplayName', 'N/A'),
            "endpoint": load_config().get('endpoint', '')
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/config/test-ssh")
def test_ssh():
    """Test SSH connectivity to the Infinia node and verify redcli is available."""
    try:
        from app.ssh_helper import ssh_exec
        rc, out, err = ssh_exec("whoami && redcli version 2>&1 | head -3")
        if rc == 0 or out.strip():
            return {
                "status": "connected",
                "user": out.split('\n')[0].strip(),
                "redcli": '\n'.join(out.split('\n')[1:]).strip() or "OK"
            }
        raise Exception(err or "SSH command returned no output")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/config/test-mgmt")
def test_mgmt():
    """Test management API connectivity with the configured realm_admin credentials."""
    try:
        from app.config_mgmt import get_bearer_token, mgmt_get
        token = get_bearer_token()
        if not token:
            raise Exception("Failed to authenticate — check realm_admin credentials")
        r = mgmt_get("/redapi/v1/clusters")
        if r.status_code == 200:
            clusters = r.json().get('data', {})
            return {"status": "connected", "clusters": list(clusters.keys()) if isinstance(clusters, dict) else clusters}
        raise Exception(f"API returned {r.status_code}: {r.text[:100]}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

