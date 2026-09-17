# DDN Infinia Platform Console

A full-stack web application for managing and demonstrating DDN Infinia Object Store features — built with **React + FastAPI**.

![DDN](https://img.shields.io/badge/DDN-Infinia%202.4.0-red?style=flat-square)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green?style=flat-square)
![React](https://img.shields.io/badge/React-18-blue?style=flat-square)

---

## What It Does

This application provides a **GUI alternative to the `redcli` CLI** for DDN Infinia, covering two planes:

### 🔴 Platform Admin (RED API — Management Plane)
| Feature | Description |
|---|---|
| Admin Dashboard | Live stats: clusters, nodes, tenants, users, Infinia version |
| Tenant Manager | Create/delete tenants + subtenants with cascade cleanup; CLI verification commands |
| User Manager | Realm-level user listing with tenant parsed from caps; create/delete |
| S3 Access Keys | View and manage S3 credentials per tenant |
| Infrastructure | Nodes, drives, HSN networks |
| Provision Wizard | Zero-to-working tenant: tenant → subtenant → S3 user → S3 key, with SSE live log |
| Teardown Wizard | Safe cascade teardown of tenants |
| CSV / YAML Import | Bulk provisioning from structured files |

### 📦 Object Store (S3 API — Data Plane)
| Feature | Description |
|---|---|
| S3 Configuration | Multi-tenant credential manager; add/test/delete per-tenant S3 keys |
| Bucket Manager | Real S3 list/create/delete with versioning & lock status |
| Object Explorer | Browse, upload, download objects |
| Versioning | Enable/disable bucket versioning, list versions |
| Object Lock / WORM | Retention modes and periods |
| Legal Hold | Per-object legal hold toggle |
| Multipart Upload | Chunked large-file upload |
| Presigned URLs | Generate time-limited signed GET/PUT URLs |
| Lifecycle Rules | Create and manage expiry/transition rules |
| CORS & Policy | Bucket CORS configuration and policy JSON editor |
| Performance | Throughput benchmark |
| Analytics | Object counts and storage by bucket |

---

## Architecture

```
┌─────────────────────────────────────────┐
│           React Frontend (Vite)          │  port 5177
│  Admin Section  │  Setup/Storage/...    │
└────────┬────────┴──────────┬────────────┘
         │                   │
         ▼                   ▼
┌─────────────────────────────────────────┐
│         FastAPI Backend                  │  port 8003
│  /api/admin/*   (RED API proxy)          │
│  /api/buckets, /api/objects, ...         │
│  /api/s3-tenants  (multi-tenant store)   │
└────────┬────────────────────────────────┘
         │
    ┌────┴──────────────────────┐
    │  DDN Infinia              │  192.168.147.129
    │  RED API  (port 443)      │  management plane
    │  S3 API   (port 8111)     │  data plane
    └───────────────────────────┘
```

---

## Quick Start

### Prerequisites
- Python 3.10+, Node.js 18+
- DDN Infinia installation with REST API access

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Copy and edit config
cp backend/infinia_config.json.example backend/infinia_config.json
uvicorn main:app --host 0.0.0.0 --port 8003 --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev   # starts on http://localhost:5177
```

### Configuration
1. Open the app → **Admin** → **Admin Dashboard**
2. Log in with your Infinia `realm_admin` credentials
3. Go to **Setup** → **S3 Configuration** → **Add Tenant** with your S3 key/secret
4. Switch tenants via the **Active Tenant** dropdown in the sidebar

---

## Sample Files

- `samples/sample_5tenants.yaml` — bulk-provision 5 tenants via CSV/YAML Import
- `samples/sample_5tenants.csv`

---

## Infinia API Reference

| Operation | Endpoint | Auth |
|---|---|---|
| Auth | `GET /redapi/v1/auth_user` | `User_id` + `Password` headers → Bearer JWT |
| List tenants | `GET /redapi/v1/clusters/{cluster}/tenants` | Bearer JWT |
| Create tenant | `POST /redapi/v1/clusters/{cluster}/tenants` | Bearer JWT |
| Create user | `POST /redapi/v1/user` | Bearer JWT + `User_id`, `caps`, `Password` headers |
| S3 buckets | `GET/POST/DELETE /api/buckets?tenant=red` | S3 SigV4 (boto3) |

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Lucide icons, react-hot-toast
- **Backend**: FastAPI, boto3 (S3), requests (RED API), uvicorn
- **Design**: DDN brand colours (`#ED2738`), `articulat-cf` font, dark/light mode

---

*Built for DDN Engineering — showcasing DDN Infinia 2.4.0 capabilities via a modern web UI.*
