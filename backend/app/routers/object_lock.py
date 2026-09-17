from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.config import get_s3_client
from datetime import datetime, timezone

router = APIRouter()

class ObjectLockConfig(BaseModel):
    mode: str  # GOVERNANCE | COMPLIANCE
    days: Optional[int] = None
    years: Optional[int] = None

class ObjectRetentionConfig(BaseModel):
    mode: str  # GOVERNANCE | COMPLIANCE
    retain_until_date: str  # ISO format

@router.get("/buckets/{bucket}/object-lock")
def get_object_lock(bucket: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        resp = s3.get_object_lock_configuration(Bucket=bucket)
        config = resp.get('ObjectLockConfiguration', {})
        rule = config.get('Rule', {})
        default_retention = rule.get('DefaultRetention', {})
        return {
            "enabled": config.get('ObjectLockEnabled', 'Disabled'),
            "mode": default_retention.get('Mode', ''),
            "days": default_retention.get('Days'),
            "years": default_retention.get('Years'),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/buckets/{bucket}/object-lock")
def put_object_lock(bucket: str, req: ObjectLockConfig, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        default_retention = {'Mode': req.mode}
        if req.days:
            default_retention['Days'] = req.days
        if req.years:
            default_retention['Years'] = req.years
        s3.put_object_lock_configuration(
            Bucket=bucket,
            ObjectLockConfiguration={
                'ObjectLockEnabled': 'Enabled',
                'Rule': {'DefaultRetention': default_retention}
            }
        )
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/buckets/{bucket}/objects/{key:path}/retention")
def get_retention(bucket: str, key: str, version_id: str = None, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        kwargs = {'Bucket': bucket, 'Key': key}
        if version_id:
            kwargs['VersionId'] = version_id
        resp = s3.get_object_retention(**kwargs)
        ret = resp.get('Retention', {})
        if 'RetainUntilDate' in ret:
            ret['RetainUntilDate'] = ret['RetainUntilDate'].isoformat()
        return ret
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/buckets/{bucket}/objects/{key:path}/retention")
def set_retention(bucket: str, key: str, req: ObjectRetentionConfig, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        retain_date = datetime.fromisoformat(req.retain_until_date.replace('Z', '+00:00'))
        s3.put_object_retention(
            Bucket=bucket,
            Key=key,
            Retention={
                'Mode': req.mode,
                'RetainUntilDate': retain_date
            }
        )
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/buckets/{bucket}/objects/{key:path}/try-delete-locked")
def try_delete_locked(bucket: str, key: str, tenant: Optional[str] = Query(None)):
    """Demo endpoint: attempts to delete a locked object and returns the error as success for demo"""
    try:
        s3 = get_s3_client(tenant)
        s3.delete_object(Bucket=bucket, Key=key)
        return {"blocked": False, "message": "Object was deleted (not locked)"}
    except Exception as e:
        error_msg = str(e)
        if 'AccessDenied' in error_msg or 'locked' in error_msg.lower() or 'protected' in error_msg.lower() or 'retention' in error_msg.lower():
            return {"blocked": True, "message": "Object is WORM-protected. Deletion BLOCKED by Object Lock.", "error": error_msg}
        return {"blocked": False, "message": f"Delete failed: {error_msg}", "error": error_msg}
