"""
Admin Wizard Router — Zero-to-Tenant Provisioning + Teardown
POST /api/admin/wizard/provision  — streams SSE progress while provisioning
POST /api/admin/wizard/teardown   — streams SSE progress while tearing down
POST /api/admin/wizard/preview    — preview CSV/YAML import plan (no changes made)
"""
import json
import time
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from app.config_mgmt import mgmt_get, mgmt_post, mgmt_delete, get_first_cluster

router = APIRouter()


# ─────────────────────────── Models ─────────────────────────────

class WizardUser(BaseModel):
    username: str
    scope: Optional[str] = 'service-user'
    get_s3_access: Optional[bool] = False


class WizardSubtenant(BaseModel):
    name: str
    users: Optional[List[WizardUser]] = []


class WizardDataset(BaseModel):
    name: str
    type: str = 's3'       # block | s3 | posix
    quota: Optional[str] = None
    service_name: Optional[str] = None


class ProvisionRequest(BaseModel):
    tenant: str
    admin_user: str
    admin_password: Optional[str] = 'DDN@Infinia2024!'
    subtenants: Optional[List[WizardSubtenant]] = []
    dataset: Optional[WizardDataset] = None
    s3_expiry: Optional[str] = '1y'
    default_password: Optional[str] = 'DDN@Infinia2024!'


class TeardownRequest(BaseModel):
    tenant: str
    confirm: bool = False    # must be True to actually execute


# ─────────────────────────── SSE helper ──────────────────────────

def sse_event(step: str, name: str, status: str, message: str = '', detail: str = '') -> str:
    payload = json.dumps({
        "step": step,
        "name": name,
        "status": status,       # running | success | failed | skipped
        "message": message,
        "detail": detail,
        "ts": int(time.time()),
    })
    return f"data: {payload}\n\n"


# ─────────────────────────── Provision ───────────────────────────

@router.post("/wizard/provision")
def provision(req: ProvisionRequest):
    """Stream SSE events while provisioning the full tenant structure."""

    def _stream():
        cluster = get_first_cluster()
        if not cluster:
            yield sse_event('init', 'cluster', 'failed', 'Cannot reach management API. Please login first.')
            return

        yield sse_event('init', cluster, 'success', f'Connected to cluster: {cluster}')
        time.sleep(0.3)

        # ── Step 1: Create tenant ──
        # Format from quick-red create_tenant():
        # POST body: {"name": ..., "xattrs": {"RED_INTERNAL": {"primary-admin": ...}}}
        yield sse_event('tenant-create', req.tenant, 'running', f'Creating tenant "{req.tenant}"...')
        r = mgmt_post(
            f"/redapi/v1/clusters/{cluster}/tenants",
            payload={
                "name": req.tenant,
                "xattrs": {
                    "RED_INTERNAL": {
                        "primary-admin": req.admin_user
                    }
                }
            }
        )
        if r.status_code in (200, 201):
            yield sse_event('tenant-create', req.tenant, 'success', f'Tenant "{req.tenant}" created')
        else:
            err = r.text[:200]
            if 'already exists' in err.lower() or r.status_code == 409:
                yield sse_event('tenant-create', req.tenant, 'skipped', f'Tenant "{req.tenant}" already exists')
            else:
                yield sse_event('tenant-create', req.tenant, 'failed', f'Failed to create tenant', err)
                yield sse_event('done', 'provision', 'failed', 'Provisioning stopped due to tenant creation failure.')
                return
        time.sleep(0.3)

        # ── Step 2: Create subtenants + users ──
        for st in (req.subtenants or []):
            # Format from quick-red create_subtenant():
            # POST body: {"name": ..., "xattrs": {}}
            yield sse_event('subtenant-create', st.name, 'running', f'Creating subtenant "{st.name}"...')
            r = mgmt_post(
                f"/redapi/v1/clusters/{cluster}/tenants/{req.tenant}/subtenants",
                payload={
                    "name": st.name,
                    "xattrs": {}
                }
            )
            if r.status_code in (200, 201):
                yield sse_event('subtenant-create', st.name, 'success', f'Subtenant "{st.name}" created')
            elif 'already exists' in r.text.lower() or r.status_code == 409:
                yield sse_event('subtenant-create', st.name, 'skipped', f'Subtenant "{st.name}" already exists')
            else:
                yield sse_event('subtenant-create', st.name, 'failed', 'Failed', r.text[:150])
            time.sleep(0.2)

            # Create users in this subtenant
            for u in (st.users or []):
                if u.username == 'realm_admin':
                    continue
                yield sse_event('user-create', u.username, 'running', f'Creating user "{u.username}"...')
                # Correct endpoint: POST /redapi/v1/user with header params (not /clusters/.../users)
                # Format from redapi.yaml: User_id, caps (tenant:scope), Password as headers
                caps = f"{req.tenant}:{u.scope}" if u.scope else f"{req.tenant}:service-user"
                r = mgmt_post(
                    "/redapi/v1/user",
                    extra_headers={
                        'User_id': u.username,
                        'Password': req.default_password or 'DDN@Infinia2024!',
                        'caps': caps,
                    }
                )
                if r.status_code in (200, 201):
                    yield sse_event('user-create', u.username, 'success', f'User "{u.username}" created')
                elif 'already exists' in r.text.lower() or r.status_code == 409:
                    yield sse_event('user-create', u.username, 'skipped', f'User "{u.username}" already exists')
                else:
                    yield sse_event('user-create', u.username, 'failed', 'Failed', r.text[:150])
                time.sleep(0.2)


                # S3 access for this user
                if u.get_s3_access and req.dataset and req.dataset.type == 's3':
                    svc = req.dataset.service_name or 'redobj'
                    scope = f"{req.tenant}/{st.name}/{svc}"
                    yield sse_event('s3-access', u.username, 'running', f'Adding S3 access for "{u.username}"...')
                    r = mgmt_post(
                        "/redapi/v1/s3/access",
                        extra_headers={'User_id': u.username, 'Scope': scope, 'Expiry': req.s3_expiry or '1y'}
                    )
                    if r.status_code in (200, 201):
                        d = r.json().get('data', {})
                        key = d.get('s3_key', '')
                        secret = d.get('s3_secret', '')
                        yield sse_event('s3-access', u.username, 'success',
                                        f'S3 access granted',
                                        json.dumps({"s3_key": key, "s3_secret": secret, "scope": scope}))
                    else:
                        yield sse_event('s3-access', u.username, 'failed', 'S3 access failed', r.text[:150])
                    time.sleep(0.2)

        yield sse_event('done', 'provision', 'success',
                        f'Tenant "{req.tenant}" fully provisioned with {len(req.subtenants or [])} subtenants.')

    return StreamingResponse(_stream(), media_type="text/event-stream")


# ─────────────────────────── Teardown ────────────────────────────

@router.post("/wizard/teardown")
def teardown(req: TeardownRequest):
    """Stream SSE events while tearing down a tenant in dependency order."""

    def _stream():
        if not req.confirm:
            yield sse_event('init', req.tenant, 'failed', 'confirm=true is required to execute teardown.')
            return

        cluster = get_first_cluster()
        if not cluster:
            yield sse_event('init', 'cluster', 'failed', 'Cannot reach management API. Please login first.')
            return

        yield sse_event('init', cluster, 'success', f'Starting teardown of tenant "{req.tenant}"')

        # Get subtenants
        r = mgmt_get(f"/redapi/v1/clusters/{cluster}/tenants/{req.tenant}/subtenants?recurse=true")
        subtenants = []
        if r.status_code == 200:
            raw = r.json().get('data', [])
            subtenants = [s.get('name', s) for s in raw] if isinstance(raw, list) else list(raw.keys())

        # For each subtenant: get users → delete users → delete subtenant
        for st in reversed(subtenants):
            ur = mgmt_get(f"/redapi/v1/clusters/{cluster}/users?tenants={req.tenant}")
            user_ids = []
            if ur.status_code == 200:
                users_data = ur.json().get('data', {}).get('users', {})
                user_ids = [v.get('user') for v in users_data.values()
                            if isinstance(v, dict) and v.get('user') and v.get('user') != 'realm_admin']

            for user in user_ids:
                yield sse_event('user-delete', user, 'running', f'Deleting user "{user}"...')
                dr = mgmt_delete(
                    f"/redapi/v1/clusters/{cluster}/users/{user}",
                    extra_headers={'tenant': req.tenant}
                )
                status = 'success' if dr.status_code in (200, 204) else 'failed'
                yield sse_event('user-delete', user, status,
                                f'User "{user}" deleted' if status == 'success' else dr.text[:100])
                time.sleep(0.2)

            yield sse_event('subtenant-delete', st, 'running', f'Deleting subtenant "{st}"...')
            dr = mgmt_delete(
                f"/redapi/v1/clusters/{cluster}/tenants/{req.tenant}/subtenants/{st}",
                extra_headers={'tenant': req.tenant, 'subtenant': st}
            )
            status = 'success' if dr.status_code in (200, 204) else 'failed'
            yield sse_event('subtenant-delete', st, status,
                            f'Subtenant "{st}" deleted' if status == 'success' else dr.text[:100])
            time.sleep(0.3)

        # Finally delete the tenant
        yield sse_event('tenant-delete', req.tenant, 'running', f'Deleting tenant "{req.tenant}"...')
        dr = mgmt_delete(
            f"/redapi/v1/clusters/{cluster}/tenants/{req.tenant}",
            extra_headers={'tenant': req.tenant}
        )
        status = 'success' if dr.status_code in (200, 204) else 'failed'
        yield sse_event('tenant-delete', req.tenant, status,
                        f'Tenant "{req.tenant}" deleted' if status == 'success' else dr.text[:100])
        yield sse_event('done', 'teardown', status,
                        f'Teardown of "{req.tenant}" complete.' if status == 'success'
                        else f'Teardown completed with errors.')

    return StreamingResponse(_stream(), media_type="text/event-stream")



# ─────────────────────────── Helpers ─────────────────────────────

def parse_yaml_import(raw: str) -> dict:
    """Parse YAML in quick-red test_config.yaml format → internal plan dict."""
    import yaml as _yaml
    data = _yaml.safe_load(raw)
    default_password = data.get('user_default_password', 'DDN@Infinia2024!')
    tenants_raw = data.get('tenants', {})
    result = {'default_password': default_password, 'tenants': []}
    for tenant_name, td in tenants_raw.items():
        tenant = {
            'name': tenant_name,
            'admin': td.get('admin', f'{tenant_name}-admin'),
            'admin_password': default_password,
            'subtenants': [],
        }
        for st_name, st_data in (td.get('subtenants') or {}).items():
            subtenant = {
                'name': st_name,
                'users': [{'username': u, 'scope': 'service-user', 'get_s3_access': False}
                          for u in (st_data.get('users') or [])],
            }
            tenant['subtenants'].append(subtenant)
        result['tenants'].append(tenant)
    return result


def parse_csv_import(raw: str) -> dict:
    """Parse flat CSV: tenant,subtenant,username,scope,default_password"""
    import csv, io
    reader = csv.DictReader(io.StringIO(raw.strip()))
    tenants: dict = {}
    default_password = 'DDN@Infinia2024!'
    for row in reader:
        t = row.get('tenant', '').strip()
        st = row.get('subtenant', '').strip()
        user = row.get('username', '').strip()
        scope = row.get('scope', 'service-user').strip()
        pw = row.get('default_password', default_password).strip() or default_password
        if pw: default_password = pw
        if not t: continue
        if t not in tenants:
            tenants[t] = {'name': t, 'admin': f'{t}-admin', 'admin_password': pw, 'subtenants': {}}
        if st and st not in tenants[t]['subtenants']:
            tenants[t]['subtenants'][st] = {'name': st, 'users': []}
        if st and user:
            tenants[t]['subtenants'][st]['users'].append({'username': user, 'scope': scope, 'get_s3_access': False})
    # Convert subtenants dict → list
    result_tenants = []
    for td in tenants.values():
        result_tenants.append({
            'name': td['name'], 'admin': td['admin'], 'admin_password': td['admin_password'],
            'subtenants': list(td['subtenants'].values()),
        })
    return {'default_password': default_password, 'tenants': result_tenants}


def plan_to_preview(parsed: dict) -> list:
    plan = []
    for t in parsed['tenants']:
        plan.append({'type': 'tenant', 'name': t['name'], 'admin': t.get('admin', ''), 'tenant': '', 'subtenant': ''})
        for st in t.get('subtenants', []):
            plan.append({'type': 'subtenant', 'name': st['name'], 'tenant': t['name'], 'subtenant': ''})
            for u in st.get('users', []):
                uname = u if isinstance(u, str) else u.get('username', '')
                plan.append({'type': 'user', 'name': uname, 'tenant': t['name'], 'subtenant': st['name']})
    return plan


# ─────────────────────────── Preview (YAML or CSV) ───────────────

class ImportBody(BaseModel):
    content: str
    format: Optional[str] = 'yaml'   # 'yaml' | 'csv'


@router.post("/wizard/preview")
async def preview_import(body: ImportBody):
    """Parse YAML or CSV and return preview plan — no changes made."""
    try:
        if body.format == 'csv':
            parsed = parse_csv_import(body.content)
        else:
            parsed = parse_yaml_import(body.content)
        plan = plan_to_preview(parsed)
        return {
            "plan": plan,
            "total": len(plan),
            "tenant_count": len(parsed['tenants']),
            "default_password": parsed.get('default_password', 'DDN@Infinia2024!'),
            "parsed": parsed,   # returned so frontend can pass to bulk-provision
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Parse error: {str(e)}")


# ─────────────────────────── Bulk Provision (SSE) ────────────────

class BulkProvisionRequest(BaseModel):
    content: str
    format: Optional[str] = 'yaml'
    s3_expiry: Optional[str] = '1y'


@router.post("/wizard/bulk-provision")
def bulk_provision(req: BulkProvisionRequest):
    """Parse YAML/CSV and provision ALL tenants in one SSE stream."""

    def _stream():
        try:
            if req.format == 'csv':
                parsed = parse_csv_import(req.content)
            else:
                parsed = parse_yaml_import(req.content)
        except Exception as e:
            yield sse_event('init', 'parse', 'failed', f'Parse error: {str(e)}')
            return

        cluster = get_first_cluster()
        if not cluster:
            yield sse_event('init', 'cluster', 'failed', 'Cannot reach management API. Login first.')
            return

        tenants = parsed.get('tenants', [])
        default_pw = parsed.get('default_password', 'DDN@Infinia2024!')
        yield sse_event('init', cluster, 'success',
                        f'Cluster: {cluster} | Provisioning {len(tenants)} tenants…')
        time.sleep(0.2)

        total_ok = total_err = 0

        for t in tenants:
            tname = t['name']
            tadmin = t.get('admin', f'{tname}-admin')
            tadmin_pw = t.get('admin_password', default_pw)

            # ── Create tenant ──
            yield sse_event('tenant-create', tname, 'running', f'Creating tenant "{tname}"…')
            r = mgmt_post(
                f"/redapi/v1/clusters/{cluster}/tenants",
                payload={
                    "name": tname,
                    "xattrs": {"RED_INTERNAL": {"primary-admin": tadmin}}
                }
            )
            if r.status_code in (200, 201):
                yield sse_event('tenant-create', tname, 'success', f'✅ Tenant "{tname}" created')
                total_ok += 1
            elif 'already exists' in r.text.lower() or r.status_code == 409:
                yield sse_event('tenant-create', tname, 'skipped', f'⏭ Tenant "{tname}" already exists')
            else:
                yield sse_event('tenant-create', tname, 'failed', f'❌ Tenant "{tname}" failed', r.text[:150])
                total_err += 1
                time.sleep(0.2)
                continue   # skip subtenants/users if tenant creation fails
            time.sleep(0.2)

            # ── Create subtenants + users ──
            for st in t.get('subtenants', []):
                stname = st['name']
                yield sse_event('subtenant-create', stname, 'running', f'  Creating subtenant "{tname}/{stname}"…')
                r = mgmt_post(
                    f"/redapi/v1/clusters/{cluster}/tenants/{tname}/subtenants",
                    payload={"name": stname, "xattrs": {}}
                )
                if r.status_code in (200, 201):
                    yield sse_event('subtenant-create', stname, 'success', f'  ✅ Subtenant "{stname}" created')
                elif 'already exists' in r.text.lower() or r.status_code == 409:
                    yield sse_event('subtenant-create', stname, 'skipped', f'  ⏭ Subtenant "{stname}" exists')
                else:
                    yield sse_event('subtenant-create', stname, 'failed', f'  ❌ Subtenant "{stname}" failed', r.text[:100])
                time.sleep(0.15)

                for u in st.get('users', []):
                    uname = u if isinstance(u, str) else u.get('username', '')
                    uscope = 'service-user' if isinstance(u, str) else u.get('scope', 'service-user')
                    if not uname or uname == 'realm_admin': continue
                    yield sse_event('user-create', uname, 'running', f'    Creating user "{uname}"…')
                    # POST /redapi/v1/user with caps header (correct endpoint)
                    caps = f"{tname}:{uscope}"
                    r = mgmt_post(
                        "/redapi/v1/user",
                        extra_headers={
                            'User_id': uname,
                            'Password': default_pw,
                            'caps': caps,
                        }
                    )
                    if r.status_code in (200, 201):
                        yield sse_event('user-create', uname, 'success', f'    ✅ User "{uname}" created')
                        total_ok += 1
                    elif 'already exists' in r.text.lower() or r.status_code == 409:
                        yield sse_event('user-create', uname, 'skipped', f'    ⏭ User "{uname}" exists')
                    else:
                        yield sse_event('user-create', uname, 'failed', f'    ❌ User "{uname}" failed', r.text[:100])
                        total_err += 1
                    time.sleep(0.1)



        status = 'success' if total_err == 0 else 'failed'
        yield sse_event('done', 'bulk-provision', status,
                        f'Bulk provisioning done — {total_ok} created, {total_err} errors across {len(tenants)} tenants.')

    return StreamingResponse(_stream(), media_type="text/event-stream")

