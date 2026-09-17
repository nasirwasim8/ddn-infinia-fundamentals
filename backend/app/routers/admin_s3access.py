"""
Admin S3 Access Router
GET    /api/admin/s3/access          — list all S3 keys across tenants/users
POST   /api/admin/s3/access          — add S3 access for a user
DELETE /api/admin/s3/access/{key}    — revoke S3 key
GET    /api/admin/s3/endpoints       — list S3 endpoints
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.config_mgmt import mgmt_get, mgmt_post, mgmt_delete, get_first_cluster

router = APIRouter()


class AddS3AccessRequest(BaseModel):
    username: str
    tenant: str
    subtenant: Optional[str] = None
    service: Optional[str] = 'redobj'
    expiry: Optional[str] = '1y'   # e.g. "1y", "90d", "30d"


def _get_cluster():
    cluster = get_first_cluster()
    if not cluster:
        raise HTTPException(status_code=503, detail="No cluster found. Please login first.")
    return cluster


@router.get("/s3/access")
def list_s3_access():
    cluster = _get_cluster()
    # Get all tenants
    r = mgmt_get(f"/redapi/v1/clusters/{cluster}/tenants")
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail="Failed to get tenants")
    tenants_raw = r.json().get('data', {})
    tenant_names = list(tenants_raw.keys()) if isinstance(tenants_raw, dict) else []

    all_keys = []
    for tenant in tenant_names:
        # Get users in this tenant
        ur = mgmt_get(f"/redapi/v1/clusters/{cluster}/users?tenants={tenant}")
        if ur.status_code != 200:
            continue
        users_data = ur.json().get('data', {}).get('users', {})
        user_ids = [v.get('user') for v in users_data.values() if isinstance(v, dict) and v.get('user')]

        for user in user_ids:
            sr = mgmt_get(
                "/redapi/v1/s3/access",
                extra_headers={
                    'User_id': user,
                    'Level': f"{cluster}/{tenant}",
                }
            )
            if sr.status_code != 200:
                continue
            items = sr.json().get('data', {})
            if isinstance(items, dict):
                for s3_key, item in items.items():
                    if isinstance(item, dict):
                        all_keys.append({
                            "s3_key": s3_key,
                            "s3_secret": item.get('s3_secret', ''),
                            "user_id": item.get('user_id', user),
                            "tenant": item.get('tenant', tenant),
                            "subtenant": item.get('subtenant', ''),
                            "expired": item.get('expired', False),
                            "expiry": item.get('expiry', ''),
                        })
    return {"access_keys": all_keys}


@router.post("/s3/access")
def add_s3_access(req: AddS3AccessRequest):
    scope_parts = [req.tenant]
    if req.subtenant:
        scope_parts.append(req.subtenant)
        if req.service:
            scope_parts.append(req.service)
    scope = '/'.join(scope_parts)

    r = mgmt_post(
        "/redapi/v1/s3/access",
        extra_headers={
            'User_id': req.username,
            'Scope': scope,
            'Expiry': req.expiry or '1y',
        }
    )
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=r.status_code, detail=r.text)
    data = r.json().get('data', {})
    return {
        "status": "success",
        "s3_key": data.get('s3_key', ''),
        "s3_secret": data.get('s3_secret', ''),
        "scope": scope,
        "expiry": req.expiry,
    }


@router.delete("/s3/access/{s3_key}")
def revoke_s3_access(s3_key: str, username: str = '', tenant: str = ''):
    r = mgmt_delete(
        f"/redapi/v1/s3/access/{s3_key}",
        extra_headers={'User_id': username, 'tenant': tenant}
    )
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return {"status": "revoked", "s3_key": s3_key}


@router.get("/s3/endpoints")
def list_s3_endpoints():
    r = mgmt_get("/redapi/v1/s3/config")
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    data = r.json().get('data', {})
    endpoints = []
    if isinstance(data, list):
        endpoints = data
    elif isinstance(data, dict):
        for key, val in data.items():
            endpoints.append({"name": key, **val} if isinstance(val, dict) else {"name": key, "url": val})
    return {"endpoints": endpoints}
