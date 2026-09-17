from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.config import get_s3_client

router = APIRouter()

class LegalHoldRequest(BaseModel):
    status: str  # ON | OFF

@router.get("/buckets/{bucket}/objects/{key:path}/legal-hold")
def get_legal_hold(bucket: str, key: str, version_id: str = None, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        kwargs = {'Bucket': bucket, 'Key': key}
        if version_id:
            kwargs['VersionId'] = version_id
        resp = s3.get_object_legal_hold(**kwargs)
        return resp.get('LegalHold', {'Status': 'OFF'})
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/buckets/{bucket}/objects/{key:path}/legal-hold")
def put_legal_hold(bucket: str, key: str, req: LegalHoldRequest, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        s3.put_object_legal_hold(
            Bucket=bucket,
            Key=key,
            LegalHold={'Status': req.status}
        )
        return {"status": "success", "hold_status": req.status}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/buckets/{bucket}/objects/{key:path}/try-delete-held")
def try_delete_held(bucket: str, key: str, tenant: Optional[str] = Query(None)):
    """Demo endpoint: attempts delete while legal hold is ON, returns outcome"""
    try:
        s3 = get_s3_client(tenant)
        s3.delete_object(Bucket=bucket, Key=key)
        return {"blocked": False, "message": "Object deleted (no legal hold active)"}
    except Exception as e:
        error_msg = str(e)
        if 'AccessDenied' in error_msg or 'hold' in error_msg.lower() or 'protected' in error_msg.lower():
            return {"blocked": True, "message": "Deletion BLOCKED by Legal Hold.", "error": error_msg}
        return {"blocked": False, "message": f"Delete failed: {error_msg}"}
