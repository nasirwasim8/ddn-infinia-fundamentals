from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from app.config import get_s3_client, load_config

router = APIRouter()

class CreateBucketRequest(BaseModel):
    name: str
    enable_versioning: bool = False
    enable_object_lock: bool = False

class TagsRequest(BaseModel):
    tags: List[dict]

@router.get("/buckets")
def list_buckets(tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        response = s3.list_buckets()
        buckets = response.get('Buckets', [])
        for b in buckets:
            b_name = b['Name']
            if 'CreationDate' in b:
                b['CreationDate'] = b['CreationDate'].isoformat()
            try:
                ver = s3.get_bucket_versioning(Bucket=b_name)
                b['Versioning'] = ver.get('Status', 'Disabled')
            except:
                b['Versioning'] = 'Unknown'
            try:
                lock = s3.get_object_lock_configuration(Bucket=b_name)
                b['ObjectLock'] = lock.get('ObjectLockConfiguration', {}).get('ObjectLockEnabled', 'Disabled')
            except:
                b['ObjectLock'] = 'Disabled'
        return {"buckets": buckets}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/buckets")
def create_bucket(req: CreateBucketRequest, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        kwargs = {'Bucket': req.name}
        if req.enable_object_lock:
            kwargs['ObjectLockEnabledForBucket'] = True
        s3.create_bucket(**kwargs)
        if req.enable_versioning and not req.enable_object_lock:
            s3.put_bucket_versioning(
                Bucket=req.name,
                VersioningConfiguration={'Status': 'Enabled'}
            )
        return {"status": "success", "name": req.name}
    except Exception as e:
        err_str = str(e)
        t = tenant or "red"
        if "AccessDenied" in err_str or "Access Denied" in err_str:
            raise HTTPException(status_code=403, detail={
                "error": "AccessDenied",
                "message": "S3 credentials do not have bucket creation rights. Check S3 Configuration.",
                "fix_steps": [
                    f"redcli s3 bucket create {req.name} -t {t} -s {t} -u s3admin",
                ],
                "raw_error": err_str,
            })
        raise HTTPException(status_code=400, detail=err_str)


@router.delete("/buckets/{name}")
def delete_bucket(name: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        s3.delete_bucket(Bucket=name)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/buckets/{name}/tags")
def get_bucket_tags(name: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        resp = s3.get_bucket_tagging(Bucket=name)
        return {"tags": resp.get('TagSet', [])}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/buckets/{name}/acl")
def get_bucket_acl(name: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        resp = s3.get_bucket_acl(Bucket=name)
        if 'ResponseMetadata' in resp:
            del resp['ResponseMetadata']
        return resp
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
