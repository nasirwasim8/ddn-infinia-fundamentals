"""
Tenant Isolation Proof — NCP Demo
Two endpoints:
  GET  /api/isolation/tenants              — list all configured S3 tenants with metadata
  POST /api/isolation/cross-tenant-test    — try to access owner's object using attacker's credentials
"""
from fastapi import APIRouter
from pydantic import BaseModel
from botocore.exceptions import ClientError
from app.config import load_s3_tenants, get_s3_client

router = APIRouter()


# ── List configured S3 tenants ────────────────────────────────────────────────

@router.get("/isolation/tenants")
def list_isolation_tenants():
    """Return all tenants that have S3 credentials configured."""
    tenants = load_s3_tenants()
    result = []
    for label, cfg in tenants.items():
        # Quick health check — try listing buckets
        status = "unknown"
        bucket_count = 0
        try:
            s3 = get_s3_client(label)
            resp = s3.list_buckets()
            bucket_count = len(resp.get('Buckets', []))
            status = "reachable"
        except Exception:
            status = "unreachable"

        result.append({
            "label":        label,
            "tenant_name":  cfg.get("tenant_name", label),
            "endpoint":     cfg.get("endpoint", ""),
            "access_key":   cfg.get("access_key", ""),
            "description":  cfg.get("description", ""),
            "bucket_count": bucket_count,
            "status":       status,
        })
    return {"tenants": result}


# ── Cross-tenant access test ──────────────────────────────────────────────────

class IsolationTestRequest(BaseModel):
    owner_tenant:    str   # tenant that owns the bucket/object
    attacker_tenant: str   # tenant whose credentials we use to attack
    bucket:          str   # bucket in owner tenant
    key:             str   # object key to attempt access


@router.post("/isolation/cross-tenant-test")
def cross_tenant_test(req: IsolationTestRequest):
    """
    Attempt to GET an object that belongs to owner_tenant
    using attacker_tenant's S3 credentials.
    Returns the HTTP status, error code, and verdict.
    """
    steps = []

    # Step 1 — confirm object exists for owner
    try:
        owner_s3 = get_s3_client(req.owner_tenant)
        owner_s3.head_object(Bucket=req.bucket, Key=req.key)
        steps.append({
            "step": "owner_verify",
            "status": "success",
            "message": f'Object "{req.key}" confirmed in bucket "{req.bucket}" (tenant: {req.owner_tenant})'
        })
    except ClientError as e:
        code = e.response['Error']['Code']
        steps.append({
            "step": "owner_verify",
            "status": "failed",
            "message": f'Could not verify object in owner tenant: {code}'
        })
        return {
            "verdict": "error",
            "steps": steps,
            "http_status": None,
            "error_code": code,
            "message": "Object not found in owner tenant — check bucket and key.",
        }
    except Exception as e:
        steps.append({"step": "owner_verify", "status": "failed", "message": str(e)})
        return {"verdict": "error", "steps": steps, "http_status": None,
                "error_code": "Unknown", "message": str(e)}

    # Step 2 — attempt cross-tenant access with attacker credentials
    try:
        attacker_s3 = get_s3_client(req.attacker_tenant)
        attacker_s3.get_object(Bucket=req.bucket, Key=req.key)

        # If we get here — isolation FAILED (object was accessible!)
        steps.append({
            "step": "cross_access",
            "status": "breach",
            "message": f'BREACH: attacker tenant "{req.attacker_tenant}" successfully accessed owner object!'
        })
        return {
            "verdict":     "BREACH",
            "steps":       steps,
            "http_status": 200,
            "error_code":  None,
            "message":     "Tenant isolation FAILED — attacker could read owner object.",
        }

    except ClientError as e:
        http_status = e.response['ResponseMetadata']['HTTPStatusCode']
        error_code  = e.response['Error']['Code']
        error_msg   = e.response['Error'].get('Message', str(e))
        steps.append({
            "step":    "cross_access",
            "status":  "isolated",
            "message": f'Access denied ({http_status} {error_code}) — attacker credentials rejected by Infinia'
        })
        return {
            "verdict":     "ISOLATED",
            "steps":       steps,
            "http_status": http_status,
            "error_code":  error_code,
            "message":     error_msg,
        }

    except Exception as e:
        steps.append({"step": "cross_access", "status": "error", "message": str(e)})
        return {
            "verdict":     "error",
            "steps":       steps,
            "http_status": None,
            "error_code":  "NetworkError",
            "message":     str(e),
        }
