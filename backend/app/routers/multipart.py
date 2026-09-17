from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from typing import List
from app.config import get_s3_client

router = APIRouter()

class InitiateRequest(BaseModel):
    key: str
    content_type: str = "application/octet-stream"

class CompleteRequest(BaseModel):
    key: str
    upload_id: str
    parts: List[dict]  # [{"PartNumber": 1, "ETag": "..."}]

class AbortRequest(BaseModel):
    key: str
    upload_id: str

@router.post("/buckets/{bucket}/multipart/initiate")
def initiate_multipart(bucket: str, req: InitiateRequest, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        resp = s3.create_multipart_upload(
            Bucket=bucket,
            Key=req.key,
            ContentType=req.content_type
        )
        return {"upload_id": resp['UploadId'], "key": req.key, "bucket": bucket}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/buckets/{bucket}/multipart/complete")
def complete_multipart(bucket: str, req: CompleteRequest, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        resp = s3.complete_multipart_upload(
            Bucket=bucket,
            Key=req.key,
            UploadId=req.upload_id,
            MultipartUpload={'Parts': req.parts}
        )
        return {"status": "success", "location": resp.get('Location', ''), "etag": resp.get('ETag', '')}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/buckets/{bucket}/multipart/abort")
def abort_multipart(bucket: str, req: AbortRequest, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        s3.abort_multipart_upload(Bucket=bucket, Key=req.key, UploadId=req.upload_id)
        return {"status": "aborted"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/buckets/{bucket}/multipart")
def list_multipart_uploads(bucket: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        resp = s3.list_multipart_uploads(Bucket=bucket)
        uploads = resp.get('Uploads', [])
        for u in uploads:
            if 'Initiated' in u:
                u['Initiated'] = u['Initiated'].isoformat()
        return {"uploads": uploads}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
