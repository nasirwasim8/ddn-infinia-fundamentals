import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, ChevronDown, ChevronRight, Building2, LogIn, Terminal, Copy, Check, ChevronsUpDown } from 'lucide-react'
import { listTenants, createTenant, deleteTenant, listSubtenants, createSubtenant, deleteSubtenant } from '../../services/adminApi'

function ConfirmModal({ name, onConfirm, onClose }: any) {
  const [typed, setTyped] = useState('')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--surface-card)', border: '1px solid #ED273840', borderRadius: 14, padding: 28, width: 440 }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#ED2738' }}>⚠ Delete tenant "{name}"?</h3>
        <p style={{ margin: '0 0 4px 0', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          This will <strong style={{ color: '#ED2738' }}>cascade-delete all subtenants and users</strong> belonging to this tenant, then delete the tenant itself.
        </p>
        <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--text-muted)' }}>
          Type <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{name}</strong> to confirm.
        </p>
        <input value={typed} onChange={e => setTyped(e.target.value)} placeholder={name}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `2px solid ${typed === name ? '#ED2738' : 'var(--border-subtle)'}`, background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={typed !== name}
            style={{ padding: '8px 16px', background: typed === name ? '#ED2738' : '#ED273850', border: 'none', borderRadius: 8, color: 'white', cursor: typed === name ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CLI Verification Panel ────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button onClick={copy} title="Copy command"
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#10B981' : 'var(--text-muted)', padding: '2px 4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

function CliPanel({ tenants, cluster }: { tenants: any[], cluster: string }) {
  const [open, setOpen] = useState(false)
  const [allCopied, setAllCopied] = useState(false)

  const clusterFlag = cluster ? ` -c ${cluster}` : ''

  // Build command lines per tenant
  const lines: { comment?: string; cmd: string }[] = [
    { comment: '# ── List all tenants ──', cmd: '' },
    { cmd: `redcli tenant list${clusterFlag}` },
    { cmd: '' },
    ...tenants.flatMap(t => [
      { comment: `# ── Verify tenant: ${t.name} ──`, cmd: '' },
      { cmd: `redcli subtenant list -t ${t.name}${clusterFlag}` },
      { cmd: `redcli user list -t ${t.name}${clusterFlag}` },
      { cmd: '' },
    ]),
    { comment: '# ── Verify S3 access keys ──', cmd: '' },
    { cmd: `redcli s3 access list${clusterFlag}` },
  ]

  const allText = lines
    .map(l => l.comment ? l.comment : l.cmd)
    .filter(l => l !== undefined)
    .join('\n')

  const copyAll = () => {
    navigator.clipboard.writeText(allText)
    setAllCopied(true)
    setTimeout(() => setAllCopied(false), 1800)
  }

  if (tenants.length === 0) return null

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header toggle */}
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', background: 'var(--surface-card)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <Terminal size={16} color="#ED2738" />
        <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
          CLI Verification Commands
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 6 }}>
          Run these in your terminal to verify tenant setup
        </span>
        <ChevronsUpDown size={15} color="var(--text-muted)" />
      </button>

      {open && (
        <div style={{ background: '#0d1117', borderTop: '1px solid var(--border-subtle)' }}>
          {/* Copy All bar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px', borderBottom: '1px solid #30363d' }}>
            <button onClick={copyAll}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: allCopied ? '#10B98120' : '#21262d', border: `1px solid ${allCopied ? '#10B981' : '#30363d'}`, borderRadius: 6, color: allCopied ? '#10B981' : '#8b949e', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
              {allCopied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy all</>}
            </button>
          </div>

          {/* Command lines */}
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {lines.map((l, i) => (
              l.comment ? (
                <div key={i} style={{ color: '#6e7681', fontSize: 12, fontFamily: 'var(--font-mono, monospace)', marginTop: i > 0 ? 12 : 0, marginBottom: 2 }}>
                  {l.comment}
                </div>
              ) : l.cmd ? (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, background: '#161b22', border: '1px solid #21262d' }}>
                  <span style={{ color: '#ED2738', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, userSelect: 'none' }}>$</span>
                  <code style={{ flex: 1, color: '#e6edf3', fontFamily: 'var(--font-mono, monospace)', fontSize: 13, whiteSpace: 'pre' }}>{l.cmd}</code>
                  <CopyButton text={l.cmd} />
                </div>
              ) : null
            ))}
          </div>

          {/* Footer note */}
          <div style={{ padding: '10px 20px 14px', borderTop: '1px solid #21262d', color: '#6e7681', fontSize: 11 }}>
            💡 Tip: Run <code style={{ background: '#21262d', padding: '1px 5px', borderRadius: 3, color: '#8b949e' }}>redcli --help</code> for a full list of commands. Cluster flag <code style={{ background: '#21262d', padding: '1px 5px', borderRadius: 3, color: '#8b949e' }}>-c {cluster || 'cluster-1'}</code> may be optional if auto-detected.
          </div>
        </div>
      )}
    </div>
  )
}

export default function TenantManager({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [tenants, setTenants] = useState<any[]>([])
  const [expanded, setExpanded] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [form, setForm] = useState({ name: '', admin_user: '', admin_password: 'DDN@Infinia2024!' })
  const [stForm, setStForm] = useState<Record<string, string>>({})

  const load = async () => {
    setLoading(true); setError('')
    try { const r = await listTenants(); setTenants(r.data.tenants || []) }
    catch (e: any) {
      const msg = e?.response?.data?.detail || 'Cannot reach management API'
      setError(msg)
    }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const doCreate = async () => {
    if (!form.name || !form.admin_user) return toast.error('Tenant name and admin user required')
    try {
      await createTenant(form)
      toast.success(`Tenant "${form.name}" created`)
      setShowCreate(false); setForm({ name: '', admin_user: '', admin_password: 'DDN@Infinia2024!' }); load()
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Create failed') }
  }

  const doDelete = async (tenant: string) => {
    try {
      const r = await deleteTenant(tenant)
      const subs = r.data?.subtenants_deleted || 0
      const users = r.data?.users_deleted || 0
      const parts = []
      if (subs > 0) parts.push(`${subs} subtenant${subs !== 1 ? 's' : ''}`)
      if (users > 0) parts.push(`${users} user${users !== 1 ? 's' : ''}`)
      toast.success(`Tenant "${tenant}" deleted${parts.length ? ` (+ ${parts.join(', ')})` : ''}`)
      setDeleteTarget(null); load()
    }
    catch (e: any) { toast.error(e.response?.data?.detail || 'Delete failed') }
  }

  const toggleExpand = async (name: string) => {
    if (expanded[name]) { setExpanded(e => { const n = { ...e }; delete n[name]; return n }); return }
    try { const r = await listSubtenants(name); setExpanded(e => ({ ...e, [name]: r.data.subtenants || [] })) }
    catch { toast.error('Failed to load subtenants') }
  }

  const doCreateSub = async (tenant: string) => {
    const name = stForm[tenant]?.trim()
    if (!name) return toast.error('Enter subtenant name')
    try {
      await createSubtenant(tenant, { name })
      toast.success(`Subtenant "${name}" created`)
      setStForm(f => ({ ...f, [tenant]: '' }))
      const r = await listSubtenants(tenant); setExpanded(e => ({ ...e, [tenant]: r.data.subtenants || [] }))
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Create subtenant failed') }
  }

  const doDeleteSub = async (tenant: string, sub: string) => {
    if (!window.confirm(`Delete subtenant "${sub}"?`)) return
    try { await deleteSubtenant(tenant, sub); toast.success(`Subtenant "${sub}" deleted`)
      const r = await listSubtenants(tenant); setExpanded(e => ({ ...e, [tenant]: r.data.subtenants || [] }))
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Delete subtenant failed') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px 0' }}>Tenant Manager</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Create and manage Infinia tenants and subtenants</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={load} style={{ padding: '8px 14px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>Refresh</button>
          <button onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#ED2738', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
            <Plus size={15} /> New Tenant
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#ED273810', border: '1px solid #ED273840', borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#ED273820', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#ED2738', fontSize: 15, marginBottom: 4 }}>Management API not connected</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {error} — You need to login with your Infinia credentials first.
            </div>
          </div>
          <button
            onClick={() => onNavigate?.('admin-dashboard')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: '#ED2738', border: 'none', borderRadius: 9, color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', flexShrink: 0 }}>
            <LogIn size={15} /> Login on Admin Dashboard
          </button>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading tenants…</div> : (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
          {tenants.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No tenants found. <button onClick={() => setShowCreate(true)} style={{ background: 'none', border: 'none', color: '#ED2738', cursor: 'pointer', textDecoration: 'underline' }}>Create one</button>
            </div>
          ) : tenants.map((t, i) => (
            <div key={t.name} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', gap: 12 }}>
                <button onClick={() => toggleExpand(t.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}>
                  {expanded[t.name] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <Building2 size={16} color="#6366F1" />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
                  {t.admin && <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)' }}>admin: {t.admin}</span>}
                </div>
                <button onClick={() => setDeleteTarget(t)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }} title="Delete tenant">
                  <Trash2 size={15} />
                </button>
              </div>

              {expanded[t.name] && (
                <div style={{ background: 'var(--surface-hover)', padding: '0 20px 14px 48px' }}>
                  {expanded[t.name].map((st: any) => (
                    <div key={st.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#0EA5E9', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, fontFamily: 'var(--font-mono)' }}>{st.name}</span>
                      <button onClick={() => doDeleteSub(t.name, st.name)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <input value={stForm[t.name] || ''} onChange={e => setStForm(f => ({ ...f, [t.name]: e.target.value }))}
                      placeholder="New subtenant name" onKeyDown={e => e.key === 'Enter' && doCreateSub(t.name)}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 13 }} />
                    <button onClick={() => doCreateSub(t.name)} style={{ padding: '7px 14px', background: '#ED2738', border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 13 }}>+ Add</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CLI Verification */}
      {!loading && tenants.length > 0 && (
        <CliPanel tenants={tenants} cluster={tenants[0]?.cluster || 'cluster-1'} />
      )}

      {/* Create Tenant Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 28, width: 400 }}>
            <h3 style={{ margin: '0 0 20px 0' }}>Create Tenant</h3>
            {[{ label: 'Tenant Name', key: 'name', ph: 'e.g. red' }, { label: 'Admin Username', key: 'admin_user', ph: 'e.g. red-admin' }, { label: 'Admin Password', key: 'admin_password', ph: 'DDN@Infinia2024!' }].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>{f.label}</label>
                <input value={(form as any)[f.key]} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph} style={{ width: '100%', padding: '9px 11px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-primary)' }}>Cancel</button>
              <button onClick={doCreate} style={{ padding: '8px 18px', background: '#ED2738', border: 'none', borderRadius: 7, color: 'white', cursor: 'pointer', fontWeight: 600 }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && <ConfirmModal name={deleteTarget.name} onConfirm={() => doDelete(deleteTarget.name)} onClose={() => setDeleteTarget(null)} />}
    </div>
  )
}
