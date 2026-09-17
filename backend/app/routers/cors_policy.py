from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from app.config import get_s3_client
import json

router = APIRouter()

class CorsRule(BaseModel):
    allowed_origins: List[str]
    allowed_methods: List[str]
    allowed_headers: List[str] = ["*"]
    max_age_seconds: int = 3600

class CorsRequest(BaseModel):
    rules: List[CorsRule]

class PolicyRequest(BaseModel):
    policy: str  # JSON string

@router.get("/buckets/{bucket}/cors")
def get_cors(bucket: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        resp = s3.get_bucket_cors(Bucket=bucket)
        return {"rules": resp.get('CORSRules', [])}
    except Exception as e:
        if 'NoSuchCORSConfiguration' in str(e):
            return {"rules": []}
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/buckets/{bucket}/cors")
def put_cors(bucket: str, req: CorsRequest, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        rules = []
        for r in req.rules:
            rules.append({
                'AllowedOrigins': r.allowed_origins,
                'AllowedMethods': r.allowed_methods,
                'AllowedHeaders': r.allowed_headers,
                'MaxAgeSeconds': r.max_age_seconds
            })
        s3.put_bucket_cors(Bucket=bucket, CORSConfiguration={'CORSRules': rules})
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/buckets/{bucket}/cors")
def delete_cors(bucket: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        s3.delete_bucket_cors(Bucket=bucket)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/buckets/{bucket}/policy")
def get_policy(bucket: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        resp = s3.get_bucket_policy(Bucket=bucket)
        return {"policy": json.loads(resp.get('Policy', '{}'))}
    except Exception as e:
        if 'NoSuchBucketPolicy' in str(e):
            return {"policy": None}
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/buckets/{bucket}/policy")
def put_policy(bucket: str, req: PolicyRequest, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        json.loads(req.policy)  # validate JSON
        s3.put_bucket_policy(Bucket=bucket, Policy=req.policy)
        return {"status": "success"}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON policy")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/buckets/{bucket}/policy")
def delete_policy(bucket: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        s3.delete_bucket_policy(Bucket=bucket)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
