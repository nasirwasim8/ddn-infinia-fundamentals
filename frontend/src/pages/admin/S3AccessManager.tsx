import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Copy, Check, Plus, Trash2, RefreshCw } from 'lucide-react'
import { listS3Access, addS3Access, revokeS3Access, listS3Endpoints } from '../../services/adminApi'

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  return (
    <button onClick={copy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#00C280' : 'var(--text-muted)', padding: '2px 5px' }}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

function expiryDays(expiry: string | number): number {
  if (!expiry || typeof expiry === 'number') return 999
  const d = new Date(expiry)
  if (isNaN(d.getTime())) return 999
  return Math.round((d.getTime() - Date.now()) / 86400000)
}
function ExpiryBadge({ expiry }: { expiry: string | number }) {
  const days = expiryDays(expiry)
  if (days >= 999) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
  const color = days < 0 ? '#EF4444' : days < 30 ? '#F59E0B' : '#00C280'
  const label = days < 0 ? 'Expired' : `${days}d left`
  return <span style={{ background: `${color}20`, color, padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 500 }}>{label}</span>
}

export default function S3AccessManager() {
  const [keys, setKeys] = useState<any[]>([])
  const [endpoints, setEndpoints] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [newKey, setNewKey] = useState<any>(null)
  const [form, setForm] = useState({ username: '', tenant: '', subtenant: '', service: 'redobj', expiry: '1y' })

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [kr, er] = await Promise.allSettled([listS3Access(), listS3Endpoints()])
      if (kr.status === 'fulfilled') setKeys(kr.value.data.access_keys || [])
      else setError((kr.reason?.response?.data?.detail) || 'Failed to load S3 keys — are you logged into the management API?')
      if (er.status === 'fulfilled') {
        // Filter endpoints to only real URL entries
        const raw = er.value.data.endpoints || []
        setEndpoints(raw.filter((ep: any) => typeof ep.url === 'string' && ep.url.startsWith('http')))
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load — please login from Admin Dashboard first')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])


  const doAdd = async () => {
    if (!form.username || !form.tenant) return toast.error('Username and tenant required')
    try {
      const r = await addS3Access(form)
      // Merge form context so CLI guide has subtenant/service info
      setNewKey({
        ...r.data,
        subtenant: form.subtenant || form.tenant,
        service: form.service || `${form.tenant}obj`,
      })
      toast.success('S3 access added')
      setShowAdd(false)
      setForm({ username: '', tenant: '', subtenant: '', service: 'redobj', expiry: '1y' })
      load()
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Failed to add access') }
  }

  const doRevoke = async (key: any) => {
    if (!window.confirm(`Revoke key ${key.s3_key}?`)) return
    try { await revokeS3Access(key.s3_key, key.user_id, key.tenant); toast.success('Key revoked'); load() }
    catch (e: any) { toast.error(e.response?.data?.detail || 'Revoke failed') }
  }

  const inp = { padding: '9px 11px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' as const, width: '100%' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px 0' }}>S3 Access Manager</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Manage S3 access keys and credentials</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#ED2738', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
            <Plus size={15} /> Add S3 Access
          </button>
        </div>
      </div>

      {/* Error / not-logged-in banner */}
      {error && (
        <div style={{ background: '#ED273810', border: '1px solid #ED273840', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: '#ED2738', fontSize: 14, marginBottom: 2 }}>Management API not connected</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{error}</div>
          </div>
          <a href="#" onClick={e => { e.preventDefault(); window.location.hash = '' }}
            style={{ fontSize: 13, color: '#ED2738', textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Go to Admin Dashboard →
          </a>
        </div>
      )}

      {/* New key result */}
      {newKey && (
        <div style={{ background: '#00C28015', border: '1px solid #00C28040', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontWeight: 600, color: '#00C280', marginBottom: 10 }}>✅ New S3 Credentials Generated — Save these now!</div>
          {[['Access Key', newKey.s3_key], ['Secret Key', newKey.s3_secret]].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 90, flexShrink: 0 }}>{label}</span>
              <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--surface-card)', padding: '4px 8px', borderRadius: 5 }}>{val}</code>
              <CopyBtn text={val} />
            </div>
          ))}

          {/* ── Next step: create the S3 service ── */}
          <div style={{ marginTop: 16, borderTop: '1px solid #00C28030', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, color: '#F59E0B', marginBottom: 8 }}>
              <span>⚠️</span> Next Step Required — Create the S3 Service
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
              Keys won't work until you create an S3 service and register this user with <code style={{ background: 'var(--surface-hover)', padding: '1px 4px', borderRadius: 3 }}>-A {newKey.username}</code>.
              Run this on the Infinia node (or via SSH):
            </div>
            <pre style={{
              background: '#0D1117', color: '#E6EDF3', borderRadius: 8, padding: '12px 14px',
              fontSize: 12, fontFamily: 'var(--font-mono)', overflowX: 'auto', margin: 0,
              border: '1px solid rgba(255,255,255,0.08)', lineHeight: 1.7
            }}>{`redcli service create ${newKey.service || newKey.tenant + 'obj'} \\
  -T file-and-object -P s3 \\
  -t ${newKey.tenant} \\
  -s ${newKey.subtenant || newKey.tenant} \\
  -V s3.${newKey.tenant}.infinia.io \\
  -A ${newKey.username}`}
            </pre>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
              Also add the vhost to <code style={{ background: 'var(--surface-hover)', padding: '1px 4px', borderRadius: 3 }}>/etc/hosts</code> on the machine running this app:
            </div>
            <pre style={{
              background: '#0D1117', color: '#E6EDF3', borderRadius: 8, padding: '10px 14px',
              fontSize: 12, fontFamily: 'var(--font-mono)', margin: '6px 0 0 0',
              border: '1px solid rgba(255,255,255,0.08)'
            }}>{`echo "192.168.147.129  s3.${newKey.tenant}.infinia.io" | sudo tee -a /etc/hosts`}
            </pre>
          </div>

          <button onClick={() => setNewKey(null)} style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginTop: 12 }}>Dismiss</button>
        </div>
      )}

      {/* Keys table */}
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-hover)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {['User', 'Tenant', 'Access Key', 'Secret Key', 'Expiry', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</td></tr>
            ) : keys.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No S3 keys found</td></tr>
            ) : keys.map((k, i) => (
              <tr key={`${k.s3_key}-${i}`} style={{ borderTop: '1px solid var(--border-subtle)', fontSize: 13 }}>
                <td style={{ padding: '12px 16px', fontWeight: 500 }}>{k.user_id}</td>
                <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{k.tenant}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{k.s3_key}</code>
                    <CopyBtn text={k.s3_key} />
                  </div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {revealed.has(k.s3_key) ? k.s3_secret : '••••••••••••••••'}
                    </code>
                    <button onClick={() => setRevealed(r => { const n = new Set(r); n.has(k.s3_key) ? n.delete(k.s3_key) : n.add(k.s3_key); return n })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px' }}>
                      {revealed.has(k.s3_key) ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    {revealed.has(k.s3_key) && <CopyBtn text={k.s3_secret} />}
                  </div>
                </td>
                <td style={{ padding: '12px 16px' }}><ExpiryBadge expiry={k.expiry} /></td>
                <td style={{ padding: '12px 16px' }}>
                  <button onClick={() => doRevoke(k)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* S3 Endpoints */}
      {endpoints.length > 0 && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px 0' }}>S3 Endpoints</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {endpoints.map((ep: any, i: number) => (
              <div key={i} style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, flex: 1 }}>{ep.url || JSON.stringify(ep)}</span>
                <CopyBtn text={ep.url || JSON.stringify(ep)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 28, width: 420 }}>
            <h3 style={{ margin: '0 0 18px 0' }}>Add S3 Access</h3>
            {[{ label: 'Username', key: 'username', ph: 's3admin' }, { label: 'Tenant', key: 'tenant', ph: 'red' }, { label: 'Subtenant', key: 'subtenant', ph: 'red (optional)' }, { label: 'Service', key: 'service', ph: 'redobj' }].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>{f.label}</label>
                <input value={(form as any)[f.key]} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph} style={inp} />
              </div>
            ))}
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Expiry</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {['30d', '90d', '1y', '2y'].map(e => (
                <button key={e} onClick={() => setForm(f => ({ ...f, expiry: e }))}
                  style={{ flex: 1, padding: '8px 0', background: form.expiry === e ? '#ED2738' : 'var(--surface-hover)', border: `1px solid ${form.expiry === e ? '#ED2738' : 'var(--border-subtle)'}`, borderRadius: 6, color: form.expiry === e ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
                  {e}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 7, cursor: 'pointer', color: 'var(--text-primary)' }}>Cancel</button>
              <button onClick={doAdd} style={{ padding: '8px 18px', background: '#ED2738', border: 'none', borderRadius: 7, color: 'white', cursor: 'pointer', fontWeight: 600 }}>Add Access</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
