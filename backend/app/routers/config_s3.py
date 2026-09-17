"""
S3 Tenant Config Router — per-tenant S3 credential management
GET    /api/s3-tenants          — list all configured tenant S3 credentials
POST   /api/s3-tenants          — add or update a tenant S3 config
DELETE /api/s3-tenants/{label}  — remove a tenant config
POST   /api/s3-tenants/{label}/test — test-connect for a tenant config
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import boto3
from botocore.config import Config
from app.config import load_s3_tenants, save_s3_tenant, delete_s3_tenant, get_s3_client

router = APIRouter()


class S3TenantConfig(BaseModel):
    label: str                     # display name / key (e.g. "red", "green")
    tenant_name: Optional[str] = ''  # Infinia tenant name for reference
    endpoint: str                  # https://192.168.147.129:8111
    access_key: str
    secret_key: str
    description: Optional[str] = ''


@router.get("/s3-tenants")
def list_s3_tenants():
    tenants = load_s3_tenants()
    # Mask secret_key for display
    result = []
    for label, cfg in tenants.items():
        result.append({
            "label": label,
            "tenant_name": cfg.get("tenant_name", ""),
            "endpoint": cfg.get("endpoint", ""),
            "access_key": cfg.get("access_key", ""),
            "secret_key_masked": cfg.get("secret_key", "")[:4] + "****" if cfg.get("secret_key") else "",
            "description": cfg.get("description", ""),
        })
    return {"tenants": result, "total": len(result)}


@router.post("/s3-tenants")
def add_s3_tenant(req: S3TenantConfig):
    data = {
        "label": req.label,
        "tenant_name": req.tenant_name or req.label,
        "endpoint": req.endpoint,
        "access_key": req.access_key,
        "secret_key": req.secret_key,
        "description": req.description or "",
    }
    save_s3_tenant(req.label, data)
    return {"status": "saved", "label": req.label}


@router.delete("/s3-tenants/{label}")
def remove_s3_tenant(label: str):
    delete_s3_tenant(label)
    return {"status": "deleted", "label": label}


@router.post("/s3-tenants/{label}/test")
def test_s3_tenant(label: str):
    """Test-connect to the S3 endpoint for this tenant config."""
    try:
        s3 = get_s3_client(tenant=label)
        resp = s3.list_buckets()
        bucket_count = len(resp.get("Buckets", []))
        return {
            "status": "connected",
            "label": label,
            "bucket_count": bucket_count,
            "message": f"Connected — {bucket_count} bucket(s) visible",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/s3-tenants/test-new")
def test_new_s3_config(req: S3TenantConfig):
    """Test a new config before saving it."""
    try:
        s3 = boto3.client(
            's3',
            endpoint_url=req.endpoint,
            aws_access_key_id=req.access_key,
            aws_secret_access_key=req.secret_key,
            verify=False,
            config=Config(signature_version='s3v4', s3={'addressing_style': 'path'})
        )
        resp = s3.list_buckets()
        bucket_count = len(resp.get("Buckets", []))
        return {
            "status": "connected",
            "bucket_count": bucket_count,
            "message": f"Connected — {bucket_count} bucket(s) visible",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
