from fastapi import APIRouter, HTTPException
from app.config import get_mgmt_client

router = APIRouter()

@router.get("/management/health")
def get_health():
    try:
        client = get_mgmt_client()
        resp = client.get("/api/v1/system/health")
        if resp.status_code == 200:
            return resp.json()
        return {"status": "error", "http_status": resp.status_code, "detail": resp.text}
    except Exception as e:
        return {"status": "unreachable", "detail": str(e)}

@router.get("/management/usage")
def get_usage():
    try:
        client = get_mgmt_client()
        resp = client.get("/api/v1/system/usage")
        if resp.status_code == 200:
            return resp.json()
        return {"status": "error", "http_status": resp.status_code}
    except Exception as e:
        return {"status": "unreachable", "detail": str(e)}

@router.get("/management/tenants")
def get_tenants():
    try:
        client = get_mgmt_client()
        resp = client.get("/api/v1/tenants")
        if resp.status_code == 200:
            return resp.json()
        return {"tenants": [], "status": "error"}
    except Exception as e:
        return {"tenants": [], "status": "unreachable", "detail": str(e)}

@router.get("/management/cluster")
def get_cluster():
    try:
        client = get_mgmt_client()
        resp = client.get("/api/v1/clusters")
        if resp.status_code == 200:
            return resp.json()
        return {"status": "error", "http_status": resp.status_code}
    except Exception as e:
        return {"status": "unreachable", "detail": str(e)}
