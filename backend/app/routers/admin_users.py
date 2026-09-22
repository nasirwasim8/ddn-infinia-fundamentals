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
    List users from both:
      1. Realm store  — GET /redapi/v1/user  (realm_admin, tenant admins)
      2. S3 tenant store — redcli s3 access list -t <tenant>  (users from Provision/S3 Access wizards)
    Results are merged and tagged with source='realm' or source='s3-tenant'.
    """
    all_users = []
    seen = set()   # (username, tenant) pairs to avoid duplicates

    # ── 1. Realm users from REST API ──
    try:
        r = mgmt_get("/redapi/v1/user")
        if r.status_code == 200:
            raw = r.json().get('data', {})
            if isinstance(raw, dict):
                for key, info in raw.items():
                    if not isinstance(info, dict):
                        continue
                    username = info.get('user', '')
                    if not username or username == 'realm_admin':
                        continue
                    caps = info.get('caps', '')
                    user_tenant = _extract_tenant_from_caps(caps)
                    if tenant and tenant.lower() not in ('all', ''):
                        if user_tenant != tenant:
                            continue
                    seen.add((username, user_tenant))
                    all_users.append({
                        "username":   username,
                        "tenant":     user_tenant,
                        "email":      info.get('email', ''),
                        "caps":       caps,
                        "full_name":  info.get('name', ''),
                        "id":         info.get('id', ''),
                        "source":     "realm",
                        "type":       "Realm User",
                    })
    except Exception:
        pass   # continue to redcli even if REST API fails

    # ── 2. S3 tenant users from redcli s3 access list ──
    try:
        from app.ssh_helper import redcli_s3_access_list
        from app.config_mgmt import mgmt_get as _mgmt_get

        # Determine which tenants to query
        if tenant and tenant.lower() not in ('all', ''):
            tenant_names = [tenant]
        else:
            cluster = _get_cluster()
            tr = mgmt_get(f"/redapi/v1/clusters/{cluster}/tenants")
            if tr.status_code == 200:
                td = tr.json().get('data', [])
                # data is a list of {name, id, ...} objects
                if isinstance(td, list):
                    tenant_names = [t['name'] for t in td if t.get('name')]
                elif isinstance(td, dict):
                    tenant_names = list(td.keys())
                else:
                    tenant_names = []
            else:
                tenant_names = []

        for t_name in tenant_names:
            try:
                records = redcli_s3_access_list(t_name)
                for rec in records:
                    uname = rec.get('user_name', rec.get('username', ''))
                    if not uname:
                        continue
                    if (uname, t_name) in seen:
                        # Realm user already listed — enrich with S3 key info
                        for u in all_users:
                            if u['username'] == uname and u['tenant'] == t_name:
                                u['s3_key']    = rec.get('s3_key', '')
                                u['s3_expiry'] = rec.get('expiration', '')
                        continue
                    seen.add((uname, t_name))
                    all_users.append({
                        "username":   uname,
                        "tenant":     t_name,
                        "email":      "",
                        "caps":       f"{t_name}:s3-access",
                        "full_name":  "",
                        "id":         "",
                        "source":     "s3-tenant",
                        "type":       "S3 Tenant User",
                        "s3_key":     rec.get('s3_key', ''),
                        "s3_expiry":  rec.get('expiration', ''),
                    })
            except Exception:
                continue   # skip tenant on error, show what we have
    except Exception:
        pass   # SSH helper not available — show realm users only

    all_users.sort(key=lambda u: (u['tenant'], u['username']))
    return {"users": all_users, "total": len(all_users)}


@router.post("/users")
def create_user(req: CreateUserRequest):
    cluster = _get_cluster()
    caps = req.caps or f"{req.tenant}:admin"

    # Step 1: Create user at realm level with caps + password
    # POST /redapi/v1/user  with User_id, Password, caps as headers
    r = mgmt_post(
        "/redapi/v1/user",
        extra_headers={
            'User_id':  req.username,
            'Password': req.password or 'DDN@Infinia2024!',
            'caps':     caps,
        }
    )
    if r.status_code not in (200, 201):
        if 'already exists' in r.text.lower() or r.status_code == 409:
            pass  # user exists — continue to grant step
        else:
            raise HTTPException(status_code=r.status_code, detail=r.text)

    # Step 2: Grant tenant-level caps via PUT /redapi/v1/user/grant
    # This makes the user visible in tenant S3 access checks
    # Grant both "tenant" and "tenant/subtenant" levels (matching quick-red pattern)
    for grant_caps in [req.tenant, f"{req.tenant}/{req.tenant}"]:
        mgmt_put(
            "/redapi/v1/user/grant",
            payload={},
            extra_headers={
                'user_id': req.username,
                'caps':    grant_caps,
            }
        )

    return {"status": "success", "username": req.username, "tenant": req.tenant, "caps": caps}


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
