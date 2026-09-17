from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from app.config import get_s3_client

router = APIRouter()

class LifecycleRule(BaseModel):
    rule_id: str
    prefix: str = ""
    expiration_days: Optional[int] = None
    abort_incomplete_days: Optional[int] = None
    status: str = "Enabled"

class LifecycleRequest(BaseModel):
    rules: List[LifecycleRule]

@router.get("/buckets/{bucket}/lifecycle")
def get_lifecycle(bucket: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        resp = s3.get_bucket_lifecycle_configuration(Bucket=bucket)
        return {"rules": resp.get('Rules', [])}
    except Exception as e:
        if 'NoSuchLifecycleConfiguration' in str(e):
            return {"rules": []}
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/buckets/{bucket}/lifecycle")
def put_lifecycle(bucket: str, req: LifecycleRequest, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        rules = []
        for r in req.rules:
            rule = {
                'ID': r.rule_id,
                'Filter': {'Prefix': r.prefix},
                'Status': r.status,
            }
            if r.expiration_days:
                rule['Expiration'] = {'Days': r.expiration_days}
            if r.abort_incomplete_days:
                rule['AbortIncompleteMultipartUpload'] = {'DaysAfterInitiation': r.abort_incomplete_days}
            rules.append(rule)
        s3.put_bucket_lifecycle_configuration(Bucket=bucket, LifecycleConfiguration={'Rules': rules})
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/buckets/{bucket}/lifecycle")
def delete_lifecycle(bucket: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        s3.delete_bucket_lifecycle(Bucket=bucket)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
