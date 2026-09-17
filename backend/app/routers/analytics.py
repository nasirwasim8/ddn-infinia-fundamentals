from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from app.config import get_s3_client

router = APIRouter()

@router.get("/analytics")
def get_analytics_summary(tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        buckets = s3.list_buckets().get('Buckets', [])
        total_objects = 0
        total_bytes = 0
        bucket_stats = []
        for b in buckets:
            name = b['Name']
            try:
                resp = s3.list_objects_v2(Bucket=name)
                objs = resp.get('Contents', [])
                b_objects = len(objs)
                b_bytes = sum(o.get('Size', 0) for o in objs)
                total_objects += b_objects
                total_bytes += b_bytes
                bucket_stats.append({"name": name, "objects": b_objects, "bytes": b_bytes})
            except:
                bucket_stats.append({"name": name, "objects": 0, "bytes": 0})
        return {
            "total_buckets": len(buckets),
            "total_objects": total_objects,
            "total_bytes": total_bytes,
            "buckets": bucket_stats
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/analytics/{bucket}")
def get_bucket_analytics(bucket: str, tenant: Optional[str] = Query(None)):
    try:
        s3 = get_s3_client(tenant)
        resp = s3.list_objects_v2(Bucket=bucket)
        objects = resp.get('Contents', [])
        if not objects:
            return {"bucket": bucket, "count": 0, "total_bytes": 0, "size_distribution": {}, "largest": []}
        sizes = [o['Size'] for o in objects]
        total = sum(sizes)
        dist = {"<1KB": 0, "1KB-1MB": 0, "1MB-100MB": 0, ">100MB": 0}
        for s in sizes:
            if s < 1024: dist["<1KB"] += 1
            elif s < 1024*1024: dist["1KB-1MB"] += 1
            elif s < 100*1024*1024: dist["1MB-100MB"] += 1
            else: dist[">100MB"] += 1
        largest = sorted(
            [{"key": o['Key'], "size": o['Size'], "last_modified": o['LastModified'].isoformat()} for o in objects],
            key=lambda x: -x['size']
        )[:10]
        return {
            "bucket": bucket,
            "count": len(objects),
            "total_bytes": total,
            "avg_size": total // len(objects),
            "size_distribution": dist,
            "largest": largest
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
