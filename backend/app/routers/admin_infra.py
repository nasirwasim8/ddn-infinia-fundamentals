"""
Admin Infrastructure Router
GET /api/admin/infra/clusters  — cluster list + health
GET /api/admin/infra/nodes     — node list
GET /api/admin/infra/drives    — drive inventory + summary
GET /api/admin/infra/networks  — network interfaces
GET /api/admin/infra/hsn       — HSN IPs
GET /api/admin/infra/version   — version info
GET /api/admin/infra/realm     — realm info
"""
from fastapi import APIRouter, HTTPException
from app.config_mgmt import mgmt_get, get_first_cluster

router = APIRouter()


@router.get("/infra/clusters")
def get_clusters():
    r = mgmt_get("/redapi/v1/clusters")
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    raw = r.json().get('data', {})
    clusters = []
    if isinstance(raw, dict):
        for name, info in raw.items():
            clusters.append({"name": name, **(info if isinstance(info, dict) else {})})
    elif isinstance(raw, list):
        clusters = raw
    return {"clusters": clusters}


@router.get("/infra/nodes")
def get_nodes():
    r = mgmt_get("/redapi/v1/inventory")
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    data = r.json()
    nodes_raw = data.get('data', {}).get('nodes', {})
    nodes = []
    for node_id, node in nodes_raw.items():
        nodes.append({
            "id": node_id,
            "hostname": node.get('hostname', node_id),
            "ctrl_plane_ip": node.get('ctrl_plane_ip', ''),
            "status": node.get('status', 'unknown'),
        })
    nodes.sort(key=lambda x: x['hostname'])
    return {"nodes": nodes, "count": len(nodes)}


@router.get("/infra/networks")
def get_networks():
    r = mgmt_get("/redapi/v1/inventory")
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    nodes_raw = r.json().get('data', {}).get('nodes', {})
    interfaces = []
    for node_id, node in nodes_raw.items():
        hostname = node.get('hostname', node_id)
        for iface_name, iface in node.get('interfaces', {}).items():
            if iface_name == 'lo':
                continue
            interfaces.append({
                "hostname": hostname,
                "interface": iface_name,
                "nettype": iface.get('nettype', ''),
                "ipv4_cidr": iface.get('ipv4_cidr', ''),
                "speed_mbps": iface.get('speed', 0),
            })
    interfaces.sort(key=lambda x: (x['hostname'], -x['speed_mbps']))
    return {"interfaces": interfaces}


@router.get("/infra/drives")
def get_drives():
    r = mgmt_get("/redapi/v1/hmi/drives")
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    raw = r.json().get('data', {})
    drives = []
    summary = {"total": 0, "by_status": {}, "by_model": {}}
    for node_name, node_drives in raw.items():
        if not isinstance(node_drives, list):
            continue
        for d in node_drives:
            status = d.get('status', 'unknown')
            model = d.get('model', 'Unknown')
            drives.append({
                "node": node_name,
                "name": d.get('name', ''),
                "size": d.get('size', ''),
                "type": d.get('type', ''),
                "status": status,
                "fw_version": d.get('fw_version', ''),
                "model": model,
                "healthy": status == 1,
            })
            summary["total"] += 1
            summary["by_status"][str(status)] = summary["by_status"].get(str(status), 0) + 1
            summary["by_model"][model] = summary["by_model"].get(model, 0) + 1
    return {"drives": drives, "summary": summary}


@router.get("/infra/hsn")
def get_hsn_ips():
    r = mgmt_get("/redapi/v1/inventory")
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    nodes_raw = r.json().get('data', {}).get('nodes', {})
    hsn = []
    for node_id, node in nodes_raw.items():
        hostname = node.get('hostname', node_id)
        for iface_name, iface in node.get('interfaces', {}).items():
            if iface.get('nettype', '').lower() in ('hsn', 'high-speed', 'ib', 'roce'):
                hsn.append({
                    "hostname": hostname,
                    "interface": iface_name,
                    "ip": iface.get('ipv4_cidr', ''),
                    "speed_mbps": iface.get('speed', 0),
                })
    return {"hsn_ips": hsn}


@router.get("/infra/version")
def get_version():
    r = mgmt_get("/redapi/v1/version")
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    raw = r.json().get('data', r.json())

    # Response structure: { "<server-ip>": { "<service>": { "version": "2.4.0", "hostname": "...", "ddn.red.build.date": "..." } } }
    # Extract version from the first real service (prefer "redapi" or "hmi")
    version_str = None
    hostname = None
    build_date = None
    hostname_val = None
    preferred = ['redapi', 'hmi', 'reds3', 'redagent', 'redsetup']

    if isinstance(raw, dict):
        for server_ip, services in raw.items():
            if not isinstance(services, dict):
                continue
            hostname_val = server_ip
            # Try preferred services first
            for svc in preferred:
                if svc in services and isinstance(services[svc], dict):
                    info = services[svc]
                    v = info.get('version', '-')
                    if v and v != '-':
                        version_str = v
                        hostname = info.get('hostname', server_ip)
                        bd = info.get('ddn.red.build.date', '')
                        # Convert epoch to readable date if numeric
                        if bd and bd != '-':
                            try:
                                from datetime import datetime, timezone
                                build_date = datetime.fromtimestamp(int(bd), tz=timezone.utc).strftime('%Y-%m-%d')
                            except Exception:
                                build_date = bd
                        break
            if version_str:
                break

    return {
        "version": version_str or "Unknown",
        "hostname": hostname or hostname_val or "Unknown",
        "build_date": build_date or "-",
        "raw": raw,
    }


@router.get("/infra/realm")
def get_realm():
    r = mgmt_get("/redapi/v1/info?detailed=true")
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r.json().get('data', r.json())
