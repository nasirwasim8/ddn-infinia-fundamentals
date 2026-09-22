import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, Edit2, X, Check } from 'lucide-react'
import { listUsers, createUser, deleteUser, listTenants } from '../../services/adminApi'

// Scope presets generated dynamically from the entered tenant name
function scopePresets(tenant: string, subtenant?: string) {
  const t = tenant || 'tenant'
  const s = subtenant || t
  return [
    { scope: `${t}:admin`,                   label: 'Tenant Admin' },
    { scope: `${t}/${s}:service-user`,        label: 'Subtenant User' },
    { scope: `${t}/${s}/redobj:service-user`, label: 'Service-level User' },
    { scope: '[realm]:admin',                 label: 'Realm Admin' },
  ]
}

const SCOPE_COLORS: Record<string, string> = {
  'admin': '#ED2738', 'service-user': '#0EA5E9', 'viewer': '#F59E0B', 'realm': '#8B5CF6'
}
function scopeColor(caps: string) {
  for (const [k, c] of Object.entries(SCOPE_COLORS)) if (caps?.includes(k)) return c
  return 'var(--text-muted)'
}

export default function UserManager({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [users, setUsers] = useState<any[]>([])
  const [tenants, setTenants] = useState<string[]>([])
  const [filterTenant, setFilterTenant] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ username: '', tenant: '', subtenant: '', password: 'DDN@Infinia2024!', caps: '', email: '' })

  const load = async () => {
    setLoading(true)
    try {
      const [ur, tr] = await Promise.all([listUsers(filterTenant === 'all' ? undefined : filterTenant), listTenants()])
      setUsers(ur.data.users || [])
      setTenants((tr.data.tenants || []).map((t: any) => t.name))
    } catch { toast.error('Failed to load users') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filterTenant])

  const doCreate = async () => {
    if (!form.username || !form.tenant) return toast.error('Username and tenant are required')
    try {
      await createUser(form)
      toast.success(`User "${form.username}" created`)
      setShowCreate(false); setForm({ username: '', tenant: '', subtenant: '', password: 'DDN@Infinia2024!', caps: '', email: '' }); load()
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Create failed') }
  }

  const doDelete = async (username: string, tenant: string) => {
    if (!window.confirm(`Delete user "${username}"?`)) return
    try { await deleteUser(username, tenant); toast.success(`User "${username}" deleted`); load() }
    catch (e: any) { toast.error(e.response?.data?.detail || 'Delete failed') }
  }

  const inp = { padding: '9px 11px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' as const, width: '100%' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px 0' }}>User Manager</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Manage users across tenants and subtenants</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={filterTenant} onChange={e => setFilterTenant(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--surface-hover)', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer' }}>
            <option value="all">All Tenants</option>
            {tenants.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#ED2738', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
            <Plus size={15} /> New User
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-hover)', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {['Username', 'Tenant', 'Type', 'Scope / S3 Key', 'Actions'].map(h => (
                <th key={h} style={{ padding: '11px 18px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading users (including SSH tenant lookup)…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No users found</td></tr>
            ) : users.map((u, i) => {
              const isS3Tenant = u.source === 's3-tenant'
              const typeBg    = isS3Tenant ? '#0EA5E920' : '#8B5CF620'
              const typeColor = isS3Tenant ? '#0EA5E9'   : '#8B5CF6'
              return (
                <tr key={`${u.username}-${i}`} style={{ borderTop: '1px solid var(--border-subtle)', fontSize: 14 }}>
                  {/* Username */}
                  <td style={{ padding: '13px 18px', fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{u.username}</td>
                  {/* Tenant */}
                  <td style={{ padding: '13px 18px', color: 'var(--text-muted)', fontSize: 13 }}>{u.tenant}</td>
                  {/* Type badge */}
                  <td style={{ padding: '13px 18px' }}>
                    <span style={{ background: typeBg, color: typeColor, padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {isS3Tenant ? '🔑 S3 Tenant User' : '👤 Realm User'}
                    </span>
                  </td>
                  {/* Scope or S3 Key */}
                  <td style={{ padding: '13px 18px' }}>
                    {isS3Tenant ? (
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                          key: <span style={{ color: 'var(--text-primary)' }}>{u.s3_key || '—'}</span>
                        </div>
                        {u.s3_expiry && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            expires: {u.s3_expiry?.split(' ')[0]}
                          </div>
                        )}
                      </div>
                    ) : (
                      u.caps
                        ? <span style={{ background: `${scopeColor(u.caps)}20`, color: scopeColor(u.caps), padding: '3px 8px', borderRadius: 5, fontSize: 12, fontFamily: 'var(--font-mono)' }}>{u.caps}</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                  {/* Actions */}
                  <td style={{ padding: '13px 18px' }}>
                    <button onClick={() => doDelete(u.username, u.tenant)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }} title="Delete user">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 28, width: 460 }}>
            <h3 style={{ margin: '0 0 18px 0' }}>Create User</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              {[
                { label: 'Username', key: 'username', ph: 'e.g. tony-stark' },
                { label: 'Tenant', key: 'tenant', ph: 'e.g. red' },
                { label: 'Subtenant', key: 'subtenant', ph: 'optional' },
                { label: 'Password', key: 'password', ph: 'DDN@Infinia2024!' },
                { label: 'Email', key: 'email', ph: 'optional' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>{f.label}</label>
                  <input value={(form as any)[f.key]} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                    placeholder={f.ph} style={inp} />
                </div>
              ))}
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Scope / Caps</label>
            <input value={form.caps} onChange={e => setForm(f => ({ ...f, caps: e.target.value }))}
              placeholder={form.tenant ? `e.g. ${form.tenant}:admin` : 'e.g. yellow:admin'}
              style={{ ...inp, marginBottom: 8 }} />
            {/* Dynamic presets — update as tenant/subtenant are typed */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {scopePresets(form.tenant, form.subtenant).map(s => (
                <button key={s.scope} onClick={() => setForm(f => ({ ...f, caps: s.scope }))}
                  style={{ padding: '3px 10px', background: form.caps === s.scope ? '#ED273820' : 'var(--surface-hover)', border: `1px solid ${form.caps === s.scope ? '#ED2738' : 'var(--border-subtle)'}`, borderRadius: 5, cursor: 'pointer', fontSize: 11, color: form.caps === s.scope ? '#ED2738' : 'var(--text-muted)' }}>
                  {s.label}
                </button>
              ))}
            </div>
            {form.caps && <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 16, background: 'var(--surface-hover)', padding: '6px 10px', borderRadius: 6 }}>caps: {form.caps}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-primary)' }}>Cancel</button>
              <button onClick={doCreate} style={{ padding: '8px 18px', background: '#ED2738', border: 'none', borderRadius: 7, color: 'white', cursor: 'pointer', fontWeight: 600 }}>Create User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
