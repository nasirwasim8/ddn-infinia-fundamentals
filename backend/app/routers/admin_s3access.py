"""
Admin S3 Access Router
GET    /api/admin/s3/access          — list all S3 keys across tenants/users
POST   /api/admin/s3/access          — add S3 access for a user (via SSH+redcli)
DELETE /api/admin/s3/access/{key}    — revoke S3 key
GET    /api/admin/s3/endpoints       — list S3 endpoints

NOTE: S3 access creation MUST go through SSH+redcli because the REST API
      only recognises users in the S3 daemon's internal tenant user store,
      which can only be populated via `redcli user add -t <tenant>`.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.config_mgmt import mgmt_get, mgmt_delete, get_first_cluster
from app.ssh_helper import redcli_s3_access_add, redcli_user_add, redcli_user_grant

router = APIRouter()


class AddS3AccessRequest(BaseModel):
    username: str
    tenant: str
    subtenant: Optional[str] = None
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
        # Get users in this tenant from the S3 daemon user store
        ur = mgmt_get(f"/redapi/v1/clusters/{cluster}/users?tenants={tenant}")
        if ur.status_code != 200:
            continue
        users_data = ur.json().get('data', {}).get('users', {})
        user_ids = [v.get('user') for v in users_data.values() if isinstance(v, dict) and v.get('user')]

        for user in user_ids:
            # Try REST API first (works for red tenant)
            sr = mgmt_get(
                "/redapi/v1/s3/access",
                extra_headers={
                    'User_id': user,
                    'level':   f"{cluster}/{tenant}",
                }
            )
            if sr.status_code == 200:
                items = sr.json().get('data', {})
                if isinstance(items, dict):
                    for s3_key, item in items.items():
                        if isinstance(item, dict):
                            all_keys.append({
                                "s3_key":    s3_key,
                                "s3_secret": item.get('s3_secret', '***'),
                                "user_id":   item.get('user_id', user),
                                "username":  user,
                                "tenant":    item.get('tenant', tenant),
                                "expired":   item.get('expired', False),
                                "expiry":    item.get('expiry', ''),
                            })
                    continue  # REST worked, skip SSH

            # Fallback: use SSH+redcli to list (handles tenants created via redcli)
            try:
                from app.ssh_helper import redcli_s3_access_list
                records = redcli_s3_access_list(tenant)
                for rec in records:
                    if rec.get('username') == user:
                        all_keys.append({
                            "s3_key":    rec.get('s3_key', ''),
                            "s3_secret": '***',  # hidden in list
                            "username":  user,
                            "tenant":    tenant,
                            "expired":   rec.get('expired', 'false').lower() == 'true',
                            "expiry":    rec.get('expiry', ''),
                        })
                        break
            except Exception:
                pass

    return {"access_keys": all_keys}


@router.post("/s3/access")
def add_s3_access(req: AddS3AccessRequest):
    """
    Creates S3 access for a user via SSH + redcli.
    Workflow per Glean/DDN docs:
      1. redcli user add <username> -t <tenant>        (registers in S3 daemon store)
      2. redcli user grant <username> <scope>           (grants subtenant access)
      3. redcli s3 access add <username> -t <tenant> -e <expiry>
    """
    cluster = _get_cluster()
    subtenant = req.subtenant or req.tenant  # default subtenant = same as tenant

    try:
        # Step 1 — Register user in the S3 daemon's tenant user store
        added = redcli_user_add(req.username, req.tenant)
        if not added:
            raise HTTPException(status_code=400,
                detail=f"Could not add user '{req.username}' to tenant '{req.tenant}' via redcli. "
                       "Check SSH credentials in configuration.")

        # Step 2 — Grant subtenant access
        redcli_user_grant(req.username, f"{req.tenant}/{subtenant}")

        # Step 3 — Create S3 access key
        result = redcli_s3_access_add(req.username, req.tenant, req.expiry or '1y')

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SSH/redcli error: {str(e)}")

    # Step 4 — Auto-register this tenant in infinia_s3_tenants.json
    # so it immediately appears in S3 Configuration without manual entry.
    try:
        from app.config import load_config, save_s3_tenant
        from app.config_mgmt import mgmt_get
        base_cfg = load_config()
        base_endpoint = base_cfg.get('endpoint', 'https://192.168.147.129:8111')

        # Look up the S3 service for this tenant to get the vhost/endpoint
        svc_endpoint = base_endpoint  # fallback to default
        try:
            sr = mgmt_get(f"/redapi/v1/clusters/{cluster}/services")
            if sr.status_code == 200:
                for svc in sr.json().get('data', {}).get('items', []):
                    scope = svc.get('scope', '')
                    # scope: cluster-1/blue/blue-subtenant-1/blueobj
                    if f"/{req.tenant}/" in scope and svc.get('protocol') == 's3':
                        vhost = svc.get('vhost', '')
                        if vhost:
                            port = base_endpoint.split(':')[-1].rstrip('/')
                            svc_endpoint = f"https://{vhost}:{port}"
                        break
        except Exception:
            pass  # use base_endpoint

        save_s3_tenant(req.tenant, {
            "tenant_name": req.tenant,
            "endpoint":    svc_endpoint,
            "access_key":  result['s3_key'],
            "secret_key":  result['s3_secret'],
            "description": f"Auto-registered: user {req.username}",
        })
    except Exception:
        pass  # auto-register is best-effort; don't fail the key creation

    return {
        "status":     "success",
        "s3_key":     result['s3_key'],
        "s3_secret":  result['s3_secret'],
        "expiration": result.get('expiration', ''),
        "tenant":     req.tenant,
        "username":   req.username,
        "auto_registered": True,
    }




@router.delete("/s3/access/{s3_key}")
def revoke_s3_access(s3_key: str, username: str = '', tenant: str = ''):
    cluster = _get_cluster()
    r = mgmt_delete(
        "/redapi/v1/s3/access",
        extra_headers={
            'user_id': username,
            'level':   f"{cluster}/{tenant}",
            's3_key':  s3_key,
        }
    )
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return {"status": "revoked", "s3_key": s3_key}


@router.get("/s3/endpoints")
def list_s3_endpoints():
    r = mgmt_get("/redapi/v1/s3/config")
    if r.status_code != 200:
        # Fallback: list services from cluster
        cluster = _get_cluster()
        sr = mgmt_get(f"/redapi/v1/clusters/{cluster}/services")
        if sr.status_code == 200:
            items = sr.json().get('data', {}).get('items', [])
            endpoints = [
                {
                    "name":     svc.get('name'),
                    "scope":    svc.get('scope'),
                    "protocol": svc.get('protocol'),
                    "url":      (svc.get('endpoints') or [''])[0],
                    "vhost":    svc.get('vhost', ''),
                }
                for svc in items
            ]
            return {"endpoints": endpoints}
        raise HTTPException(status_code=r.status_code, detail=r.text)
    data = r.json().get('data', {})
    endpoints = []
    if isinstance(data, list):
        endpoints = data
    elif isinstance(data, dict):
        for key, val in data.items():
            endpoints.append({"name": key, **val} if isinstance(val, dict) else {"name": key, "url": val})
    return {"endpoints": endpoints}
