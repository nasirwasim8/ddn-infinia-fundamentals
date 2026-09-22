"""
Admin Tenants Router — fixed to use JSON body (not headers) matching quick-red.py exactly.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.config_mgmt import mgmt_get, mgmt_post, mgmt_put, mgmt_delete, get_first_cluster

router = APIRouter()


class CreateTenantRequest(BaseModel):
    name: str
    admin_user: str
    admin_password: Optional[str] = None
    io_priority: Optional[str] = None


class UpdateTenantRequest(BaseModel):
    admin_user: Optional[str] = None
    admin_password: Optional[str] = None
    io_priority: Optional[str] = None


class CreateSubtenantRequest(BaseModel):
    name: str
    admins: Optional[List[str]] = None
    viewers: Optional[List[str]] = None


def _get_cluster():
    cluster = get_first_cluster()
    if not cluster:
        raise HTTPException(status_code=503, detail="No cluster found or management API unreachable. Please login first.")
    return cluster


@router.get("/tenants")
def list_tenants():
    cluster = _get_cluster()
    r = mgmt_get(f"/redapi/v1/clusters/{cluster}/tenants")
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    raw = r.json().get('data', [])
    tenants = []
    if isinstance(raw, list):
        for t in raw:
            xattrs = (t.get("xattrs") or {}) if isinstance(t, dict) else {}
            tenants.append({
                "name": t.get("name", t) if isinstance(t, dict) else t,
                "admin": (xattrs.get("RED_INTERNAL") or {}).get("primary-admin", ""),
                "cluster": cluster,
            })
    elif isinstance(raw, dict):
        for name, info in raw.items():
            tenants.append({"name": name, "admin": "", "cluster": cluster})
    return {"tenants": tenants, "cluster": cluster}


@router.post("/tenants")
def create_tenant(req: CreateTenantRequest):
    """Create tenant using the exact JSON body format from quick-red.py."""
    cluster = _get_cluster()

    # Exact format from quick-red create_tenant():
    # {"name": tenant_name, "xattrs": {"RED_INTERNAL": {"primary-admin": primary_admin}}}
    body = {
        "name": req.name,
        "xattrs": {
            "RED_INTERNAL": {
                "primary-admin": req.admin_user
            }
        }
    }

    r = mgmt_post(f"/redapi/v1/clusters/{cluster}/tenants", payload=body)
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return {"status": "success", "tenant": req.name}


@router.put("/tenants/{tenant}")
def update_tenant(tenant: str, req: UpdateTenantRequest):
    cluster = _get_cluster()
    body: dict = {"xattrs": {"RED_INTERNAL": {}}}
    if req.admin_user:
        body["xattrs"]["RED_INTERNAL"]["primary-admin"] = req.admin_user
    if req.admin_password:
        body["xattrs"]["RED_INTERNAL"]["primary-password"] = req.admin_password
    r = mgmt_put(f"/redapi/v1/clusters/{cluster}/tenants/{tenant}", payload=body)
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return {"status": "success", "tenant": tenant}





@router.get("/tenants/{tenant}/subtenants")
def list_subtenants(tenant: str):
    cluster = _get_cluster()
    # Do NOT use ?recurse=true — that returns a nested structure with tenant wrapper
    r = mgmt_get(f"/redapi/v1/clusters/{cluster}/tenants/{tenant}/subtenants")
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    raw = r.json().get('data', [])
    subtenants = []
    if isinstance(raw, list):
        for s in raw:
            subtenants.append({
                "name": s.get("name", s) if isinstance(s, dict) else s,
                "tenant": tenant,
                "admins": s.get("admins", []) if isinstance(s, dict) else [],
                "viewers": s.get("viewers", []) if isinstance(s, dict) else [],
            })
    elif isinstance(raw, dict):
        for name, info in raw.items():
            subtenants.append({"name": name, "tenant": tenant})
    return {"subtenants": subtenants, "tenant": tenant}


@router.post("/tenants/{tenant}/subtenants")
def create_subtenant(tenant: str, req: CreateSubtenantRequest):
    """Create subtenant using the exact JSON body format from quick-red.py."""
    cluster = _get_cluster()

    body: dict = {
        "name": req.name,
        "xattrs": {}
    }
    if req.admins:
        body["admins"] = req.admins
    if req.viewers:
        body["viewers"] = req.viewers

    r = mgmt_post(
        f"/redapi/v1/clusters/{cluster}/tenants/{tenant}/subtenants",
        payload=body
    )
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return {"status": "success", "subtenant": req.name, "tenant": tenant}


@router.delete("/tenants/{tenant}/subtenants/{subtenant}")
def delete_subtenant(tenant: str, subtenant: str):
    cluster = _get_cluster()
    r = mgmt_delete(
        f"/redapi/v1/clusters/{cluster}/tenants/{tenant}/subtenants/{subtenant}"
    )
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return {"status": "deleted", "subtenant": subtenant, "tenant": tenant}


@router.delete("/tenants/{tenant}")
def delete_tenant_cascade(tenant: str):
    """Delete tenant — cascade: deletes all tenant users, then subtenants, then the tenant."""
    cluster = _get_cluster()

    # Step 1: Find and delete users belonging to this tenant
    # Users live at realm level — find them via /redapi/v1/user and filter by caps
    users_deleted = []
    ur = mgmt_get("/redapi/v1/user")
    if ur.status_code == 200:
        all_users = ur.json().get('data', {})
        for key, info in all_users.items():
            if not isinstance(info, dict):
                continue
            username = info.get('user', '')
            caps = info.get('caps', '')
            if not username or username == 'realm_admin':
                continue
            # Check if this user's caps reference this tenant
            # Match "tenant:" or "cluster-X/tenant:" patterns
            tenant_markers = [f"{tenant}:", f"/{tenant}:", f"/{tenant}/"]
            if any(m in caps for m in tenant_markers) or (not caps and False):
                dr = mgmt_delete("/redapi/v1/user", extra_headers={'User_id': username})
                if dr.status_code in (200, 204):
                    users_deleted.append(username)

    # Step 2: List and delete subtenants
    sr = mgmt_get(f"/redapi/v1/clusters/{cluster}/tenants/{tenant}/subtenants")
    subtenants = []
    if sr.status_code == 200:
        raw = sr.json().get('data', [])
        if isinstance(raw, list):
            subtenants = [s.get("name", s) if isinstance(s, dict) else s for s in raw]

    failed_subs = []
    for sub in subtenants:
        dr = mgmt_delete(f"/redapi/v1/clusters/{cluster}/tenants/{tenant}/subtenants/{sub}")
        if dr.status_code not in (200, 204):
            failed_subs.append(f"{sub} ({dr.status_code})")

    if failed_subs:
        raise HTTPException(
            status_code=400,
            detail=f"Could not delete subtenants: {', '.join(failed_subs)}"
        )

    # Step 3: Delete the tenant itself
    r = mgmt_delete(f"/redapi/v1/clusters/{cluster}/tenants/{tenant}")
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=r.status_code, detail=r.text)

    return {
        "status": "deleted",
        "tenant": tenant,
        "subtenants_deleted": len(subtenants),
        "users_deleted": len(users_deleted),
        "users_deleted_list": users_deleted,
    }
