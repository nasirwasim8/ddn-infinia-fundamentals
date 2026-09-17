import axios from 'axios'

export const adminApi = axios.create({ baseURL: '/api/admin', timeout: 60000 })

// ── Auth ──────────────────────────────────────────
export const adminLogin = (username: string, password: string, server = '') =>
  adminApi.post('/auth/login', { username, password, server })
export const adminStatus = () => adminApi.get('/auth/status')
export const adminLogout = () => adminApi.post('/auth/logout')

// ── Tenants ───────────────────────────────────────
export const listTenants = () => adminApi.get('/tenants')
export const createTenant = (data: any) => adminApi.post('/tenants', data)
export const updateTenant = (tenant: string, data: any) => adminApi.put(`/tenants/${tenant}`, data)
export const deleteTenant = (tenant: string) => adminApi.delete(`/tenants/${tenant}`)
export const listSubtenants = (tenant: string) => adminApi.get(`/tenants/${tenant}/subtenants`)
export const createSubtenant = (tenant: string, data: any) =>
  adminApi.post(`/tenants/${tenant}/subtenants`, data)
export const deleteSubtenant = (tenant: string, subtenant: string) =>
  adminApi.delete(`/tenants/${tenant}/subtenants/${subtenant}`)

// ── Users ─────────────────────────────────────────
export const listUsers = (tenant?: string) =>
  adminApi.get('/users', { params: tenant ? { tenant } : {} })
export const createUser = (data: any) => adminApi.post('/users', data)
export const updateUser = (username: string, tenant: string, data: any) =>
  adminApi.put(`/users/${username}`, data, { params: { tenant } })
export const deleteUser = (username: string, tenant: string) =>
  adminApi.delete(`/users/${username}`, { params: { tenant } })

// ── S3 Access ─────────────────────────────────────
export const listS3Access = () => adminApi.get('/s3/access')
export const addS3Access = (data: any) => adminApi.post('/s3/access', data)
export const revokeS3Access = (key: string, username: string, tenant: string) =>
  adminApi.delete(`/s3/access/${key}`, { params: { username, tenant } })
export const listS3Endpoints = () => adminApi.get('/s3/endpoints')

// ── Infrastructure ────────────────────────────────
export const getInfraClusters = () => adminApi.get('/infra/clusters')
export const getInfraNodes    = () => adminApi.get('/infra/nodes')
export const getInfraDrives   = () => adminApi.get('/infra/drives')
export const getInfraNetworks = () => adminApi.get('/infra/networks')
export const getInfraHSN      = () => adminApi.get('/infra/hsn')
export const getInfraVersion  = () => adminApi.get('/infra/version')
export const getInfraRealm    = () => adminApi.get('/infra/realm')

// ── Wizard ────────────────────────────────────────
export const previewImport = (content: string, format: 'yaml' | 'csv' = 'yaml') =>
  adminApi.post('/wizard/preview', { content, format })

// Bulk provision is a streaming SSE endpoint — use native fetch
export const getBulkProvisionUrl = () => '/api/admin/wizard/bulk-provision'

