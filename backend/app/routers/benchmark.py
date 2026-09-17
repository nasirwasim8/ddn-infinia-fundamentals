from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.config import get_s3_client
import time
import io
import concurrent.futures
import statistics

router = APIRouter()

class BenchmarkRequest(BaseModel):
    bucket: str
    object_size_kb: int = 64
    count: int = 10
    concurrency: int = 5

def _upload_one(s3_factory, bucket: str, key: str, data: bytes) -> dict:
    start = time.perf_counter()
    try:
        s3 = s3_factory()
        s3.put_object(Bucket=bucket, Key=key, Body=data)
        elapsed = time.perf_counter() - start
        return {"key": key, "duration": elapsed, "success": True, "size": len(data)}
    except Exception as e:
        elapsed = time.perf_counter() - start
        return {"key": key, "duration": elapsed, "success": False, "error": str(e)}

def _download_one(s3_factory, bucket: str, key: str) -> dict:
    start = time.perf_counter()
    ttfb = None
    try:
        s3 = s3_factory()
        obj = s3.get_object(Bucket=bucket, Key=key)
        ttfb = time.perf_counter() - start
        data = obj['Body'].read()
        elapsed = time.perf_counter() - start
        return {"key": key, "duration": elapsed, "ttfb": ttfb, "success": True, "size": len(data)}
    except Exception as e:
        elapsed = time.perf_counter() - start
        return {"key": key, "duration": elapsed, "ttfb": ttfb, "success": False, "error": str(e)}

@router.post("/benchmark/run")
def run_benchmark(req: BenchmarkRequest, tenant: Optional[str] = Query(None)):
    try:
        from app.config import get_s3_client as _get_s3
        data = b'x' * (req.object_size_kb * 1024)
        keys = [f"benchmark-{i:04d}.bin" for i in range(req.count)]
        total_bytes = len(data) * req.count

        # Upload phase
        upload_start = time.perf_counter()
        with concurrent.futures.ThreadPoolExecutor(max_workers=req.concurrency) as executor:
            upload_futures = [
                executor.submit(_upload_one, _get_s3, req.bucket, k, data)
                for k in keys
            ]
            upload_results = [f.result() for f in upload_futures]
        upload_elapsed = time.perf_counter() - upload_start

        upload_successes = [r for r in upload_results if r['success']]
        upload_durations = [r['duration'] for r in upload_successes]

        # Download phase
        download_start = time.perf_counter()
        with concurrent.futures.ThreadPoolExecutor(max_workers=req.concurrency) as executor:
            download_futures = [
                executor.submit(_download_one, _get_s3, req.bucket, k)
                for k in keys
            ]
            download_results = [f.result() for f in download_futures]
        download_elapsed = time.perf_counter() - download_start

        download_successes = [r for r in download_results if r['success']]
        download_durations = [r['duration'] for r in download_successes]
        ttfbs = [r['ttfb'] for r in download_successes if r.get('ttfb')]

        # Cleanup
        try:
            s3 = _get_s3()
            s3.delete_objects(Bucket=req.bucket, Delete={'Objects': [{'Key': k} for k in keys]})
        except:
            pass

        def safe_stat(lst, fn):
            return round(fn(lst) * 1000, 1) if lst else 0

        upload_mbps = round((total_bytes / 1024 / 1024) / upload_elapsed, 2) if upload_elapsed > 0 else 0
        download_mbps = round((total_bytes / 1024 / 1024) / download_elapsed, 2) if download_elapsed > 0 else 0

        return {
            "upload_mbps": upload_mbps,
            "download_mbps": download_mbps,
            "avg_upload_latency_ms": safe_stat(upload_durations, statistics.mean),
            "p99_upload_latency_ms": safe_stat(sorted(upload_durations), lambda x: x[int(len(x) * 0.99)] if len(x) > 1 else x[-1]),
            "avg_download_latency_ms": safe_stat(download_durations, statistics.mean),
            "p99_download_latency_ms": safe_stat(sorted(download_durations), lambda x: x[int(len(x) * 0.99)] if len(x) > 1 else x[-1]),
            "ttfb_ms": safe_stat(ttfbs, statistics.mean),
            "upload_errors": len(upload_results) - len(upload_successes),
            "download_errors": len(download_results) - len(download_successes),
            "object_size_kb": req.object_size_kb,
            "count": req.count,
            "concurrency": req.concurrency,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
