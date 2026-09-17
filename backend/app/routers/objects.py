from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from app.config import get_s3_client
import json

router = APIRouter()

class CopyRequest(BaseModel):
    dest_bucket: str
    dest_key: str

class BatchDeleteRequest(BaseModel):
    keys: List[str]

class TagsRequest(BaseModel):
    tags: List[dict]

@router.get("/buckets/{bucket}/objects")
def list_objects(bucket: str, prefix: str = "", tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
        objects = resp.get('Contents', [])
        for obj in objects:
            if 'LastModified' in obj:
                obj['LastModified'] = obj['LastModified'].isoformat()
        return {"objects": objects, "count": len(objects), "prefix": prefix}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/buckets/{bucket}/objects")
def upload_object(bucket: str, file: UploadFile = File(...), key: str = Form(None)):
    try:
        s3 = get_s3_client(tenant)
        obj_key = key if key else file.filename
        s3.upload_fileobj(file.file, bucket, obj_key)
        return {"status": "success", "key": obj_key, "bucket": bucket}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/buckets/{bucket}/objects/{key:path}/meta")
def head_object(bucket: str, key: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        resp = s3.head_object(Bucket=bucket, Key=key)
        if 'LastModified' in resp:
            resp['LastModified'] = resp['LastModified'].isoformat()
        if 'Expires' in resp:
            resp['Expires'] = str(resp['Expires'])
        if 'ResponseMetadata' in resp:
            del resp['ResponseMetadata']
        return resp
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/buckets/{bucket}/objects/{key:path}/download")
def get_object(bucket: str, key: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        obj = s3.get_object(Bucket=bucket, Key=key)
        content_type = obj.get('ContentType', 'application/octet-stream')
        return StreamingResponse(
            obj['Body'],
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{key.split("/")[-1]}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/buckets/{bucket}/objects/{key:path}")
def delete_object(bucket: str, key: str, version_id: str = None, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        kwargs = {'Bucket': bucket, 'Key': key}
        if version_id:
            kwargs['VersionId'] = version_id
        s3.delete_object(**kwargs)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/buckets/{bucket}/copy")
def copy_object(bucket: str, req: CopyRequest, src_key: str = "", tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        s3.copy_object(
            CopySource={'Bucket': bucket, 'Key': src_key},
            Bucket=req.dest_bucket,
            Key=req.dest_key
        )
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/buckets/{bucket}/batch-delete")
def batch_delete(bucket: str, req: BatchDeleteRequest, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        objects = [{'Key': k} for k in req.keys]
        resp = s3.delete_objects(Bucket=bucket, Delete={'Objects': objects})
        return {
            "deleted": len(resp.get('Deleted', [])),
            "errors": resp.get('Errors', [])
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/buckets/{bucket}/objects/{key:path}/tags")
def get_object_tags(bucket: str, key: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        resp = s3.get_object_tagging(Bucket=bucket, Key=key)
        return {"tags": resp.get('TagSet', [])}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/buckets/{bucket}/objects/{key:path}/tags")
def put_object_tags(bucket: str, key: str, req: TagsRequest, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        s3.put_object_tagging(Bucket=bucket, Key=key, Tagging={'TagSet': req.tags})
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
