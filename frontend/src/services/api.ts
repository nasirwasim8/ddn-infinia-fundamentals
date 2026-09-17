import axios from 'axios'

export const api = axios.create({ baseURL: '/api', timeout: 120000 })

// Config
export const getConfig = () => api.get('/config')
export const saveConfig = (data: any) => api.post('/config', data)
export const testConnection = () => api.post('/config/test')

// Buckets
export const listBuckets = () => api.get('/buckets')
export const createBucket = (data: { name: string; enable_versioning?: boolean; enable_object_lock?: boolean }) => api.post('/buckets', data)
export const deleteBucket = (name: string) => api.delete(`/buckets/${name}`)
export const getBucketTags = (name: string) => api.get(`/buckets/${name}/tags`)
export const getBucketAcl = (name: string) => api.get(`/buckets/${name}/acl`)

// Objects
export const listObjects = (bucket: string, prefix = '') => api.get(`/buckets/${bucket}/objects`, { params: { prefix } })
export const uploadObject = (bucket: string, file: File, key?: string) => {
  const form = new FormData()
  form.append('file', file)
  if (key) form.append('key', key)
  return api.post(`/buckets/${bucket}/objects`, form, { timeout: 300000 })
}
export const deleteObject = (bucket: string, key: string) => api.delete(`/buckets/${bucket}/objects/${encodeURIComponent(key)}`)
export const headObject = (bucket: string, key: string) => api.get(`/buckets/${bucket}/objects/${encodeURIComponent(key)}/meta`)
export const downloadObject = (bucket: string, key: string) => `/api/buckets/${bucket}/objects/${encodeURIComponent(key)}/download`
export const batchDelete = (bucket: string, keys: string[]) => api.post(`/buckets/${bucket}/batch-delete`, { keys })
export const getObjectTags = (bucket: string, key: string) => api.get(`/buckets/${bucket}/objects/${encodeURIComponent(key)}/tags`)
export const putObjectTags = (bucket: string, key: string, tags: any[]) => api.put(`/buckets/${bucket}/objects/${encodeURIComponent(key)}/tags`, { tags })

// Versioning
export const getVersioning = (bucket: string) => api.get(`/buckets/${bucket}/versioning`)
export const setVersioning = (bucket: string, status: string) => api.put(`/buckets/${bucket}/versioning`, { status })
export const listVersions = (bucket: string, prefix = '') => api.get(`/buckets/${bucket}/versions`, { params: { prefix } })

// Object Lock
export const getObjectLock = (bucket: string) => api.get(`/buckets/${bucket}/object-lock`)
export const setObjectLock = (bucket: string, data: any) => api.put(`/buckets/${bucket}/object-lock`, data)
export const getRetention = (bucket: string, key: string) => api.get(`/buckets/${bucket}/objects/${encodeURIComponent(key)}/retention`)
export const setRetention = (bucket: string, key: string, data: any) => api.put(`/buckets/${bucket}/objects/${encodeURIComponent(key)}/retention`, data)
export const tryDeleteLocked = (bucket: string, key: string) => api.post(`/buckets/${bucket}/objects/${encodeURIComponent(key)}/try-delete-locked`)

// Legal Hold
export const getLegalHold = (bucket: string, key: string) => api.get(`/buckets/${bucket}/objects/${encodeURIComponent(key)}/legal-hold`)
export const setLegalHold = (bucket: string, key: string, status: string) => api.put(`/buckets/${bucket}/objects/${encodeURIComponent(key)}/legal-hold`, { status })
export const tryDeleteHeld = (bucket: string, key: string) => api.post(`/buckets/${bucket}/objects/${encodeURIComponent(key)}/try-delete-held`)

// Multipart
export const initiateMultipart = (bucket: string, data: any) => api.post(`/buckets/${bucket}/multipart/initiate`, data)
export const completeMultipart = (bucket: string, data: any) => api.post(`/buckets/${bucket}/multipart/complete`, data)
export const abortMultipart = (bucket: string, data: any) => api.delete(`/buckets/${bucket}/multipart/abort`, { data })
export const listMultipart = (bucket: string) => api.get(`/buckets/${bucket}/multipart`)

// Presigned
export const getPresignedGet = (bucket: string, key: string, expiry_seconds: number) => api.post('/presigned/get', { bucket, key, expiry_seconds })
export const getPresignedPut = (bucket: string, key: string, expiry_seconds: number) => api.post('/presigned/put', { bucket, key, expiry_seconds })

// Lifecycle
export const getLifecycle = (bucket: string) => api.get(`/buckets/${bucket}/lifecycle`)
export const putLifecycle = (bucket: string, rules: any[]) => api.put(`/buckets/${bucket}/lifecycle`, { rules })
export const deleteLifecycle = (bucket: string) => api.delete(`/buckets/${bucket}/lifecycle`)

// CORS & Policy
export const getCors = (bucket: string) => api.get(`/buckets/${bucket}/cors`)
export const putCors = (bucket: string, rules: any[]) => api.put(`/buckets/${bucket}/cors`, { rules })
export const deleteCors = (bucket: string) => api.delete(`/buckets/${bucket}/cors`)
export const getPolicy = (bucket: string) => api.get(`/buckets/${bucket}/policy`)
export const putPolicy = (bucket: string, policy: string) => api.put(`/buckets/${bucket}/policy`, { policy })
export const deletePolicy = (bucket: string) => api.delete(`/buckets/${bucket}/policy`)

// Benchmark
export const runBenchmark = (data: any) => api.post('/benchmark/run', data, { timeout: 300000 })

// Analytics
export const getAnalytics = () => api.get('/analytics')
export const getBucketAnalytics = (bucket: string) => api.get(`/analytics/${bucket}`)

// Management
export const getMgmtHealth = () => api.get('/management/health')
export const getMgmtUsage = () => api.get('/management/usage')
export const getMgmtTenants = () => api.get('/management/tenants')
export const getMgmtCluster = () => api.get('/management/cluster')
