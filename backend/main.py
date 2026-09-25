import warnings
import urllib3
warnings.filterwarnings("ignore")
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import (
    config_router, buckets, objects, versioning,
    object_lock, legal_hold, multipart, presigned,
    lifecycle, cors_policy, benchmark, analytics, management,
    admin_auth, admin_tenants, admin_users, admin_s3access,
    admin_infra, admin_wizard, isolation, seeddata,
)
from app.routers.config_s3 import router as config_s3_router

app = FastAPI(
    title="DDN Infinia Platform Console API",
    description="Unified management + S3 validation for DDN Infinia",
    version="2.0.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── S3 Data Plane routes (existing) ──
app.include_router(config_router.router, prefix="/api")
app.include_router(buckets.router,       prefix="/api")
app.include_router(objects.router,       prefix="/api")
app.include_router(versioning.router,    prefix="/api")
app.include_router(object_lock.router,   prefix="/api")
app.include_router(legal_hold.router,    prefix="/api")
app.include_router(multipart.router,     prefix="/api")
app.include_router(presigned.router,     prefix="/api")
app.include_router(lifecycle.router,     prefix="/api")
app.include_router(cors_policy.router,   prefix="/api")
app.include_router(benchmark.router,     prefix="/api")
app.include_router(analytics.router,     prefix="/api")
app.include_router(management.router,    prefix="/api")
app.include_router(config_s3_router,     prefix="/api", tags=["S3 Tenant Configs"])

# ── NCP / Isolation / Seed Data ──
app.include_router(isolation.router,  prefix="/api", tags=["NCP: Tenant Isolation"])
app.include_router(seeddata.router,   prefix="/api/admin", tags=["NCP: Sample Data Generator"])

# ── Management Plane routes (new) ──
app.include_router(admin_auth.router,     prefix="/api/admin", tags=["Admin: Auth"])
app.include_router(admin_tenants.router,  prefix="/api/admin", tags=["Admin: Tenants"])
app.include_router(admin_users.router,    prefix="/api/admin", tags=["Admin: Users"])
app.include_router(admin_s3access.router, prefix="/api/admin", tags=["Admin: S3 Access"])
app.include_router(admin_infra.router,    prefix="/api/admin", tags=["Admin: Infrastructure"])
app.include_router(admin_wizard.router,   prefix="/api/admin", tags=["Admin: Wizard"])


@app.get("/")
def root():
    return {
        "name": "DDN Infinia Platform Console",
        "version": "2.0.0",
        "docs": "/docs",
        "planes": {
            "s3_data": "/api/buckets",
            "management": "/api/admin",
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8003, reload=True)
