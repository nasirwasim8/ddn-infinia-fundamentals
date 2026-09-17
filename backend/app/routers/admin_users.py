"""
Admin Users Router — fixed to use /redapi/v1/user (realm-level) for listing
since users created via POST /redapi/v1/user live at realm level and are
visible via the /redapi/v1/user GET endpoint, not per-tenant cluster endpoint.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.config_mgmt import mgmt_get, mgmt_post, mgmt_put, mgmt_delete, get_first_cluster

router = APIRouter()


class CreateUserRequest(BaseModel):
    username: str
    tenant: str
    subtenant: Optional[str] = None
    password: Optional[str] = 'DDN@Infinia2024!'
    caps: Optional[str] = None     # e.g. "red:admin" or "red/red:service-user"
    email: Optional[str] = None
    full_name: Optional[str] = None


class UpdateUserRequest(BaseModel):
    password: Optional[str] = None
    caps: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None


def _get_cluster():
    cluster = get_first_cluster()
    if not cluster:
        raise HTTPException(status_code=503, detail="No cluster found. Please login first.")
    return cluster


def _extract_tenant_from_caps(caps: str) -> str:
    """
    Parse primary tenant from caps string.
    Examples:
      "cluster-1/green:admin" → "green"
      "green:service-user" → "green"
      "green/green-tenant-1:service-user" → "green"
      ":admin,cluster-1/[all]:admin" → "[realm]"
      "" → "[realm]"
    """
    if not caps:
        return '[realm]'
    for part in caps.split(','):
        part = part.strip()
        if not part or part.startswith(':'):
            continue
        # Remove cluster prefix segment if present
        segments = part.split('/')
        # segments could be: [cluster, tenant, subtenant:role] or [tenant:role] or [tenant, subtenant:role]
        # Detect cluster prefix: cluster names don't start with letters and have hyphens like "cluster-1"
        start = 0
        if len(segments) > 1 and segments[0].startswith('cluster'):
            start = 1
        tenant_part = segments[start].split(':')[0] if len(segments) > start else ''
        if tenant_part and tenant_part not in ('[all]', '[realm]', ''):
            return tenant_part
    return '[realm]'


@router.get("/users")
def list_users(tenant: Optional[str] = Query(None)):
    """
    List users from the realm-level /redapi/v1/user endpoint.
    All Infinia users live at realm scope. Tenant is derived from their caps.
    """
    r = mgmt_get("/redapi/v1/user")
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    raw = r.json().get('data', {})
    all_users = []

    if isinstance(raw, dict):
        for key, info in raw.items():
            if not isinstance(info, dict):
                continue
            username = info.get('user', '')
            if not username or username == 'realm_admin':
                continue

            # Always derive tenant from caps — the tenant field from API is always "[realm]"
            caps = info.get('caps', '')
            user_tenant = _extract_tenant_from_caps(caps)

            # Filter by tenant if requested
            if tenant and tenant.lower() not in ('all', ''):
                if user_tenant != tenant:
                    continue

            all_users.append({
                "username": username,
                "tenant": user_tenant,
                "email": info.get('email', ''),
                "caps": caps,
                "full_name": info.get('name', ''),
                "id": info.get('id', ''),
            })

    all_users.sort(key=lambda u: (u['tenant'], u['username']))
    return {"users": all_users, "total": len(all_users)}


@router.post("/users")
def create_user(req: CreateUserRequest):
    # Correct endpoint: POST /redapi/v1/user with User_id, caps, Password as headers
    caps = req.caps or f"{req.tenant}:service-user"
    extra = {
        'User_id': req.username,
        'Password': req.password or 'DDN@Infinia2024!',
        'caps': caps,
    }
    if req.email:
        extra['email'] = req.email
    if req.full_name:
        extra['name'] = req.full_name

    r = mgmt_post("/redapi/v1/user", extra_headers=extra)
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return {"status": "success", "username": req.username, "tenant": req.tenant}


@router.put("/users/{username}")
def update_user(username: str, req: UpdateUserRequest, tenant: str = Query(...)):
    extra = {'User_id': username}
    if req.caps:
        extra['caps'] = req.caps
    if req.password:
        extra['newpass'] = req.password
    if req.email:
        extra['email'] = req.email

    r = mgmt_put("/redapi/v1/user", payload={}, extra_headers=extra)
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return {"status": "success", "username": username}


@router.delete("/users/{username}")
def delete_user(username: str, tenant: str = Query(default='')):
    """Delete a user via DELETE /redapi/v1/user with User_id header."""
    r = mgmt_delete("/redapi/v1/user", extra_headers={'User_id': username})
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return {"status": "deleted", "username": username}
