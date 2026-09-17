/**
 * S3 Configuration — multi-tenant credential manager.
 * Add, test and remove per-tenant S3 credentials.
 * The active tenant switcher in the sidebar uses this data.
 */
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, CheckCircle, XCircle, Loader, Eye, EyeOff, ChevronDown, ChevronRight, Database } from 'lucide-react'
import axios from 'axios'

const API = 'http://localhost:8003/api'

interface Tenant {
  label: string
  tenant_name: string
  endpoint: string
  access_key: string
  secret_key_masked: string
  description: string
}

const BLANK = { label: '', tenant_name: '', endpoint: 'https://192.168.147.129:8111', access_key: '', secret_key: '', description: '' }

function StatusDot({ ok }: { ok?: boolean | null }) {
  if (ok == null) return <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)' }} />
  return <div style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? '#10B981' : '#ED2738' }} />
}

export default function Configuration() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [statuses, setStatuses] = useState<Record<string, boolean | null>>({})
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ ...BLANK })
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingNew, setTestingNew] = useState(false)
  const [newTestResult, setNewTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = async () => {
    try {
      const r = await axios.get(`${API}/s3-tenants`)
      setTenants(r.data.tenants || [])
    } catch { toast.error('Failed to load tenant configs') }
  }

  useEffect(() => { load() }, [])

  const testExisting = async (label: string) => {
    setTesting(t => ({ ...t, [label]: true }))
    try {
      const r = await axios.post(`${API}/s3-tenants/${label}/test`)
      setStatuses(s => ({ ...s, [label]: true }))
      toast.success(`${label}: ${r.data.message}`)
    } catch (e: any) {
      setStatuses(s => ({ ...s, [label]: false }))
      toast.error(`${label}: ${e.response?.data?.detail || 'Connection failed'}`)
    } finally { setTesting(t => ({ ...t, [label]: false })) }
  }

  const testNew = async () => {
    setTestingNew(true); setNewTestResult(null)
    try {
      const r = await axios.post(`${API}/s3-tenants/test-new`, {
        label: form.label || 'test', tenant_name: form.tenant_name,
        endpoint: form.endpoint, access_key: form.access_key, secret_key: form.secret_key, description: form.description,
      })
      setNewTestResult({ ok: true, msg: r.data.message })
    } catch (e: any) {
      setNewTestResult({ ok: false, msg: e.response?.data?.detail || 'Connection failed' })
    } finally { setTestingNew(false) }
  }

  const doSave = async () => {
    if (!form.label || !form.access_key || !form.secret_key || !form.endpoint) {
      return toast.error('Label, endpoint, access key and secret key are required')
    }
    setSaving(true)
    try {
      await axios.post(`${API}/s3-tenants`, { ...form })
      toast.success(`Tenant "${form.label}" saved`)
      setForm({ ...BLANK }); setShowAdd(false); setNewTestResult(null)
      load()
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Save failed') }
    finally { setSaving(false) }
  }

  const doDelete = async (label: string) => {
    if (!window.confirm(`Remove "${label}" credentials?`)) return
    try {
      await axios.delete(`${API}/s3-tenants/${label}`)
      toast.success(`"${label}" removed`)
      load()
    } catch { toast.error('Remove failed') }
  }

  const inp = { padding: '9px 11px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 13, width: '100%', boxSizing: 'border-box' as const }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px 0' }}>S3 Configuration</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            Manage per-tenant S3 credentials. Select the active tenant in the sidebar to switch context.
          </p>
        </div>
        <button onClick={() => setShowAdd(a => !a)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#ED2738', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
          <Plus size={14} /> Add Tenant
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 24 }}>
          <h3 style={{ margin: '0 0 18px 0', fontSize: 16, fontWeight: 600 }}>Add S3 Tenant Credentials</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { label: 'Label (nickname)', key: 'label', ph: 'e.g. green, red' },
              { label: 'Infinia Tenant Name', key: 'tenant_name', ph: 'e.g. green (for reference)' },
              { label: 'S3 Endpoint URL', key: 'endpoint', ph: 'https://192.168.147.129:8111' },
              { label: 'Description (optional)', key: 'description', ph: 'e.g. Green tenant admin user' },
              { label: 'Access Key (S3_KEY)', key: 'access_key', ph: 'XXXXXXXXXXXXXXXXXX' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 5, color: 'var(--text-muted)' }}>{f.label}</label>
                <input value={(form as any)[f.key]} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph} style={inp} />
              </div>
            ))}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 5, color: 'var(--text-muted)' }}>Secret Key (S3_SECRET)</label>
              <div style={{ position: 'relative' }}>
                <input type={showSecret ? 'text' : 'password'} value={form.secret_key}
                  onChange={e => setForm(fm => ({ ...fm, secret_key: e.target.value }))}
                  placeholder="xxxxxxxxxxxxxxxxxxxx" style={{ ...inp, paddingRight: 36 }} />
                <button onClick={() => setShowSecret(s => !s)}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* Test result */}
          {newTestResult && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: newTestResult.ok ? '#10B98110' : '#ED273810', border: `1px solid ${newTestResult.ok ? '#10B981' : '#ED2738'}`, borderRadius: 8 }}>
              {newTestResult.ok ? <CheckCircle size={15} color="#10B981" /> : <XCircle size={15} color="#ED2738" />}
              <span style={{ fontSize: 13, color: newTestResult.ok ? '#10B981' : '#ED2738' }}>{newTestResult.msg}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={testNew} disabled={testingNew}
              style={{ padding: '8px 16px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 7, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>
              {testingNew ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={13} />}
              Test Connection
            </button>
            <button onClick={doSave} disabled={saving}
              style={{ padding: '8px 18px', background: '#ED2738', border: 'none', borderRadius: 7, color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              {saving ? 'Saving…' : 'Save Credentials'}
            </button>
            <button onClick={() => { setShowAdd(false); setForm({ ...BLANK }); setNewTestResult(null) }}
              style={{ padding: '8px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 7, cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tenant list */}
      {tenants.length === 0 && !showAdd ? (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Database size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No tenant credentials configured</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>
            Add S3 credentials for each tenant you want to manage from the Object Store section.
          </div>
          <button onClick={() => setShowAdd(true)}
            style={{ padding: '8px 18px', background: '#ED2738', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            + Add First Tenant
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tenants.map(t => (
            <div key={t.label} style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
              {/* Row header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px' }}>
                <button onClick={() => setExpanded(e => e === t.label ? null : t.label)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}>
                  {expanded === t.label ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
                <StatusDot ok={statuses[t.label] ?? null} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{t.label}</span>
                  {t.description && <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)' }}>{t.description}</span>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                    {t.endpoint} · {t.access_key}
                  </div>
                </div>
                <button onClick={() => testExisting(t.label)} disabled={testing[t.label]}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 7, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)' }}>
                  {testing[t.label] ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={12} />}
                  Test
                </button>
                <button onClick={() => doDelete(t.label)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Expanded detail */}
              {expanded === t.label && (
                <div style={{ padding: '0 20px 16px 48px', background: 'var(--surface-hover)', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 16px', fontSize: 13, marginTop: 12 }}>
                    {[
                      ['Tenant', t.tenant_name || t.label],
                      ['Endpoint', t.endpoint],
                      ['Access Key', t.access_key],
                      ['Secret Key', t.secret_key_masked + '…'],
                    ].map(([k, v]) => (
                      <>
                        <span key={k + '-k'} style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{k}</span>
                        <span key={k + '-v'} style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{v}</span>
                      </>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div style={{ padding: '14px 18px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        💡 <strong style={{ color: 'var(--text-primary)' }}>How to get S3 credentials:</strong> In the Admin section, go to <strong>S3 Access</strong> to view existing keys, or use the <strong>Provision Wizard</strong> to create a new tenant with S3 access. Copy the <code style={{ background: 'var(--surface-hover)', padding: '1px 5px', borderRadius: 3 }}>S3_KEY</code> and <code style={{ background: 'var(--surface-hover)', padding: '1px 5px', borderRadius: 3 }}>S3_SECRET</code> shown at the end of provisioning.
      </div>
    </div>
  )
}
