from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.config import load_config, save_config, get_s3_client

router = APIRouter()

class ConfigModel(BaseModel):
    endpoint: str = "https://192.168.147.129:8111"
    access_key: str = ""
    secret_key: str = ""
    test_bucket: str = "ddn-infinia-rag-01"
    mgmt_endpoint: str = "https://192.168.147.129:12023"
    mgmt_user: str = "realm_admin"
    mgmt_password: str = ""

@router.get("/config")
def get_config():
    cfg = load_config()
    masked = dict(cfg)
    if masked.get("secret_key"):
        masked["secret_key"] = "***"
    if masked.get("mgmt_password"):
        masked["mgmt_password"] = "***"
    return masked

@router.post("/config")
def set_config(config: ConfigModel):
    data = config.dict()
    existing = load_config()
    if data["secret_key"] == "***":
        data["secret_key"] = existing.get("secret_key", "")
    if data["mgmt_password"] == "***":
        data["mgmt_password"] = existing.get("mgmt_password", "")
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
