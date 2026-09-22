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

            # Create users in this subtenant via SSH+redcli
            # (REST API /redapi/v1/user doesn't work for tenant users)
            for u in (st.users or []):
                if u.username == 'realm_admin':
                    continue

                # ── Create tenant user via redcli ──
                yield sse_event('user-create', u.username, 'running', f'Creating user "{u.username}"...')
                try:
                    from app.ssh_helper import ssh_exec, redcli_user_add, redcli_s3_access_add
                    added = redcli_user_add(u.username, req.tenant)
                    if added:
                        yield sse_event('user-create', u.username, 'success', f'User "{u.username}" created')
                    else:
                        yield sse_event('user-create', u.username, 'skipped', f'User "{u.username}" already exists (or skipped)')
                except Exception as e:
                    yield sse_event('user-create', u.username, 'failed', f'Failed: {e}')
                time.sleep(0.2)

                # ── S3 access + service creation ──
                if u.get_s3_access and req.dataset and req.dataset.type == 's3':
                    svc_name = req.dataset.service_name or f'{req.tenant}obj'
                    vhost    = f's3.{req.tenant}.infinia.io'
                    yield sse_event('s3-access', u.username, 'running', f'Adding S3 access for "{u.username}"...')
                    try:
                        result = redcli_s3_access_add(u.username, req.tenant, req.s3_expiry or '1y')
                        s3_key    = result.get('s3_key', '')
                        s3_secret = result.get('s3_secret', '')
                        yield sse_event('s3-access', u.username, 'success', 'S3 keys generated',
                                        json.dumps({'s3_key': s3_key, 's3_secret': s3_secret}))
                    except Exception as e:
                        yield sse_event('s3-access', u.username, 'failed', f'S3 access failed: {e}')
                        s3_key = s3_secret = ''
                    time.sleep(0.2)

                    # ── Create S3 service (registers user in reds3 daemon) ──
                    yield sse_event('s3-service', svc_name, 'running', f'Creating S3 service "{svc_name}"...')
                    try:
                        svc_cmd = (
                            f'redcli service create {svc_name}'
                            f' -T file-and-object -P s3'
                            f' -t {req.tenant} -s {st.name}'
                            f' -V {vhost}'
                            f' -A {u.username}'
                        )
                        rc, out, err = ssh_exec(svc_cmd)
                        combined = out + err
                        if 'added' in combined.lower() or rc == 0:
                            yield sse_event('s3-service', svc_name, 'success', f'Service "{svc_name}" created — vhost: {vhost}')
                        elif 'already exists' in combined.lower():
                            yield sse_event('s3-service', svc_name, 'skipped', f'Service "{svc_name}" already exists')
                        else:
                            yield sse_event('s3-service', svc_name, 'failed', combined[:150])
                    except Exception as e:
                        yield sse_event('s3-service', svc_name, 'failed', str(e))
                    time.sleep(0.2)

                    # ── Add vhost to WSL /etc/hosts ──
                    try:
                        import subprocess as _sp
                        from app.config import load_config as _lc
                        _ssh_pass = _lc().get('ssh_password', 'admin')
                        hosts_entry = f'192.168.147.129  {vhost}'
                        existing = open('/etc/hosts').read()
                        if vhost not in existing:
                            result = _sp.run(
                                f'echo {_ssh_pass} | sudo -S tee -a /etc/hosts',
                                input=f'\n{hosts_entry}\n',
                                shell=True, text=True, capture_output=True
                            )
                            if vhost in open('/etc/hosts').read():
                                yield sse_event('hosts', vhost, 'success', f'/etc/hosts updated: {hosts_entry}')
                            else:
                                yield sse_event('hosts', vhost, 'failed', f'Could not write /etc/hosts — add manually: {hosts_entry}')
                        else:
                            yield sse_event('hosts', vhost, 'skipped', f'{vhost} already in /etc/hosts')
                    except Exception as e:
                        yield sse_event('hosts', vhost, 'skipped', f'/etc/hosts not updated: {e}')
                    time.sleep(0.1)

                    # ── Auto-save credentials to infinia_s3_tenants.json ──
                    if s3_key and s3_secret:
                        try:
                            from app.config import load_config, save_s3_tenant
                            base_cfg = load_config()
                            port = base_cfg.get('endpoint', 'https://192.168.147.129:8111').split(':')[-1].rstrip('/')
                            save_s3_tenant(req.tenant, {
                                'tenant_name': req.tenant,
                                'endpoint':    f'https://{vhost}:{port}',
                                'access_key':  s3_key,
                                'secret_key':  s3_secret,
                                'description': f'Provisioned: user {u.username}',
                            })
                            yield sse_event('config', req.tenant, 'success',
                                           f'S3 credentials saved — tenant "{req.tenant}" ready in S3 Configuration')
                        except Exception as e:
                            yield sse_event('config', req.tenant, 'skipped', f'Credential save skipped: {e}')

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
            yield sse_event('init', cluster, 'failed', 'Cannot reach management API. Please login first.')
            return

        yield sse_event('init', cluster, 'success', f'Starting teardown of tenant "{req.tenant}"')

        try:
            from app.ssh_helper import ssh_exec
            from app.config_mgmt import load_config as _cfg
        except Exception as e:
            yield sse_event('init', 'ssh', 'failed', f'Cannot import SSH helper: {e}')
            return

        tenant = req.tenant
        cfg = _cfg()
        mgmt_user = cfg.get('mgmt_user', 'realm_admin')
        mgmt_pass = cfg.get('mgmt_password', '')

        # ── Step 1: Login as realm_admin via CLI ──
        yield sse_event('login', mgmt_user, 'running', f'Authenticating as {mgmt_user}...')
        rc, out, err = ssh_exec(f'redcli user login {mgmt_user} -p {mgmt_pass}')
        combined = out + err
        if 'logged in' in combined.lower() or rc == 0:
            yield sse_event('login', mgmt_user, 'success', f'Authenticated as {mgmt_user}')
        else:
            yield sse_event('login', mgmt_user, 'failed', combined[:100])
            # continue anyway — CLI may already be logged in from a previous session

        # ── Step 2: List and delete all services for this tenant ──
        rc, out, err = ssh_exec(f'redcli service list -t {tenant} -o json')
        services = []
        try:
            import json as _json
            svc_data = _json.loads(out)
            # Format: {"data": {"items": [...]}}
            items = svc_data.get('data', {}).get('items', [])
            for item in (items or []):
                name = item.get('name', '')
                scope = item.get('scope', '')  # e.g. "cluster-1/green/green-sub1/greenobj"
                parts = scope.split('/')
                # scope has 4 parts: cluster/tenant/subtenant/service
                subtenant = parts[2] if len(parts) >= 4 else (parts[1] if len(parts) >= 3 else '')
                if name:
                    services.append({'name': name, 'subtenant': subtenant})
        except Exception:
            # Tabular fallback: parse │ greenobj │ green/green-sub1/greenobj │ ...
            for line in (out + err).splitlines():
                if '│' in line and tenant in line:
                    cols = [c.strip() for c in line.split('│') if c.strip()]
                    if len(cols) >= 2:
                        scope_col = cols[1]  # e.g. "green/green-sub1/greenobj"
                        parts = scope_col.split('/')
                        sub = parts[1] if len(parts) >= 3 else ''
                        services.append({'name': cols[0], 'subtenant': sub})

        for svc in services:
            svc_name = svc['name']
            svc_sub = svc['subtenant']
            yield sse_event('service-delete', svc_name, 'running', f'Deleting service "{svc_name}"...')
            cmd = f'redcli service delete {svc_name} -t {tenant}'
            if svc_sub:
                cmd += f' -s {svc_sub}'
            cmd += ' -f'
            rc, out, err = ssh_exec(cmd)
            combined = out + err
            if rc == 0 or 'deleted' in combined.lower() or 'success' in combined.lower():
                yield sse_event('service-delete', svc_name, 'success', f'Service "{svc_name}" deleted')
            else:
                yield sse_event('service-delete', svc_name, 'failed', combined.strip()[:120])
            time.sleep(0.4)

        # ── Step 3: List and delete all subtenants ──
        rc, out, err = ssh_exec(f'redcli subtenant list -t {tenant} -o json')
        subtenants = []
        try:
            import json as _json
            st_data = _json.loads(out)
            # Format: {"data": [{name: "green-sub1", ...}]}  — data is a direct list
            items = st_data.get('data', [])
            if isinstance(items, dict):
                items = items.get('items', [])
            for item in (items or []):
                name = item.get('name', '')
                if name:
                    subtenants.append(name)
        except Exception:
            # Tabular fallback
            for line in (out + err).splitlines():
                if '│' in line and line.strip().startswith('│'):
                    cols = [c.strip() for c in line.split('│') if c.strip()]
                    if cols and cols[0] not in ('NAME', 'name', 'ALLOCATED', 'USAGE'):
                        subtenants.append(cols[0])

        for st in subtenants:
            yield sse_event('subtenant-delete', st, 'running', f'Deleting subtenant "{st}"...')
            rc, out, err = ssh_exec(f'redcli subtenant delete {st} -t {tenant} -f')
            combined = out + err
            if rc == 0 or 'deleted' in combined.lower() or 'success' in combined.lower():
                yield sse_event('subtenant-delete', st, 'success', f'Subtenant "{st}" deleted')
            else:
                msg = combined.strip()[:120]
                status = 'failed' if 'error' in msg.lower() else 'success'
                yield sse_event('subtenant-delete', st, status,
                                f'Subtenant "{st}" deleted' if status == 'success' else msg)
            time.sleep(0.4)

        # ── Step 4: Delete the tenant ──
        yield sse_event('tenant-delete', tenant, 'running', f'Deleting tenant "{tenant}"...')
        rc, out, err = ssh_exec(f'redcli tenant delete {tenant} -f')
        combined = out + err
        if rc == 0 or 'deleted' in combined.lower() or 'success' in combined.lower():
            yield sse_event('tenant-delete', tenant, 'success', f'Tenant "{tenant}" deleted successfully')
            yield sse_event('done', 'teardown', 'success', f'Tenant "{tenant}" fully removed.')
        else:
            msg = combined.strip()[:200]
            yield sse_event('tenant-delete', tenant, 'failed', msg)
            yield sse_event('done', 'teardown', 'failed', 'Teardown completed with errors.')



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

