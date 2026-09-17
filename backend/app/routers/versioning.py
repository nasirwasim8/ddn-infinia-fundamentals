from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.config import get_s3_client

router = APIRouter()

class VersioningRequest(BaseModel):
    status: str  # Enabled | Suspended

@router.get("/buckets/{bucket}/versioning")
def get_versioning(bucket: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        resp = s3.get_bucket_versioning(Bucket=bucket)
        return {"status": resp.get('Status', 'Disabled')}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/buckets/{bucket}/versioning")
def set_versioning(bucket: str, req: VersioningRequest, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        s3.put_bucket_versioning(
            Bucket=bucket,
            VersioningConfiguration={'Status': req.status}
        )
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/buckets/{bucket}/versions")
def list_versions(bucket: str, prefix: str = "", tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        kwargs = {'Bucket': bucket}
        if prefix:
            kwargs['Prefix'] = prefix
        resp = s3.list_object_versions(**kwargs)
        versions = resp.get('Versions', [])
        delete_markers = resp.get('DeleteMarkers', [])
        for v in versions:
            if 'LastModified' in v:
                v['LastModified'] = v['LastModified'].isoformat()
        for d in delete_markers:
            if 'LastModified' in d:
                d['LastModified'] = d['LastModified'].isoformat()
        return {"versions": versions, "delete_markers": delete_markers}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
