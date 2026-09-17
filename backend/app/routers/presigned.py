from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.config import get_s3_client

router = APIRouter()

class PresignedRequest(BaseModel):
    bucket: str
    key: str
    expiry_seconds: int = 3600

@router.post("/presigned/get")
def get_presigned_url(req: PresignedRequest, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        url = s3.generate_presigned_url(
            ClientMethod='get_object',
            Params={'Bucket': req.bucket, 'Key': req.key},
            ExpiresIn=req.expiry_seconds
        )
        return {"url": url, "expires_in": req.expiry_seconds, "method": "GET"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/presigned/put")
def put_presigned_url(req: PresignedRequest, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        url = s3.generate_presigned_url(
            ClientMethod='put_object',
            Params={'Bucket': req.bucket, 'Key': req.key},
            ExpiresIn=req.expiry_seconds
        )
        return {"url": url, "expires_in": req.expiry_seconds, "method": "PUT"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
