import { useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, ChevronRight, ChevronLeft, CheckCircle, XCircle, Loader, ArrowRight } from 'lucide-react'

interface WizardUser { username: string; scope: string; s3_access: boolean }
interface WizardST { name: string; users: WizardUser[] }
interface WizardForm {
  tenant: string; admin_user: string; admin_password: string
  subtenants: WizardST[]
  dataset: { name: string; type: string; quota: string; service_name: string }
  s3_expiry: string; default_password: string
}

interface SSEEvent { step: string; name: string; status: string; message: string; detail: string }

const STEPS = ['Tenant', 'Subtenants', 'Users', 'Dataset', 'S3 Access', 'Review', 'Provision']
const inp = { padding: '9px 11px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' as const, width: '100%' }

function StepIcon({ status }: { status: string }) {
  if (status === 'running') return <Loader size={16} color="#F59E0B" style={{ animation: 'spin 1s linear infinite' }} />
  if (status === 'success') return <CheckCircle size={16} color="#00C280" />
  if (status === 'skipped') return <CheckCircle size={16} color="#6366F1" />
  if (status === 'failed') return <XCircle size={16} color="#ED2738" />
  return <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border-subtle)' }} />
}

export default function ProvisionWizard({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<WizardForm>({
    tenant: '', admin_user: '', admin_password: 'DDN@Infinia2024!',
    subtenants: [{ name: '', users: [] }],
    dataset: { name: '', type: 's3', quota: '', service_name: '' },
    s3_expiry: '1y', default_password: 'DDN@Infinia2024!',
  })
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [done, setDone] = useState(false)
  const [newKeys, setNewKeys] = useState<any[]>([])

  const updateST = (i: number, key: string, val: any) =>
    setForm(f => { const s = [...f.subtenants]; (s[i] as any)[key] = val; return { ...f, subtenants: s } })
  const addST = () => setForm(f => ({ ...f, subtenants: [...f.subtenants, { name: '', users: [] }] }))
  const removeST = (i: number) => setForm(f => { const s = [...f.subtenants]; s.splice(i, 1); return { ...f, subtenants: s } })

  const addUser = (si: number) => {
    const s = [...form.subtenants]
    s[si].users = [...s[si].users, { username: '', scope: 'service-user', s3_access: false }]
    setForm(f => ({ ...f, subtenants: s }))
  }
  const updateUser = (si: number, ui: number, key: string, val: any) => {
    const s = JSON.parse(JSON.stringify(form.subtenants))
    ;(s[si].users[ui] as any)[key] = val
    setForm(f => ({ ...f, subtenants: s }))
  }
  const removeUser = (si: number, ui: number) => {
    const s = JSON.parse(JSON.stringify(form.subtenants))
    s[si].users.splice(ui, 1)
    setForm(f => ({ ...f, subtenants: s }))
  }

  const provision = async () => {
    setEvents([]); setDone(false); setNewKeys([])
    const payload = {
      tenant: form.tenant, admin_user: form.admin_user, admin_password: form.admin_password,
      subtenants: form.subtenants.filter(s => s.name).map(s => ({
        name: s.name,
        users: s.users.filter(u => u.username).map(u => ({
          username: u.username, scope: u.scope, get_s3_access: u.s3_access
        }))
      })),
      dataset: form.dataset.name ? form.dataset : null,
      s3_expiry: form.s3_expiry, default_password: form.default_password,
    }
    try {
      const res = await fetch('/api/admin/wizard/provision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      })
      const reader = res.body!.getReader(); const dec = new TextDecoder()
      while (true) {
        const { done: d, value } = await reader.read(); if (d) break
        const text = dec.decode(value)
        for (const line of text.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const ev: SSEEvent = JSON.parse(line.slice(6))
              setEvents(e => [...e, ev])
              if (ev.step === 's3-access' && ev.status === 'success' && ev.detail) {
                try { setNewKeys(k => [...k, JSON.parse(ev.detail)]) } catch {}
              }
              if (ev.step === 'done') setDone(true)
            } catch {}
          }
        }
      }
    } catch (e: any) { toast.error('Provision stream failed: ' + e.message) }
  }

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0 }}>Step 1 — Tenant Details</h3>
          {[{ label: 'Tenant Name', key: 'tenant', ph: 'e.g. red' }, { label: 'Admin Username', key: 'admin_user', ph: 'e.g. red-admin' }, { label: 'Admin Password', key: 'admin_password', ph: 'DDN@Infinia2024!' }, { label: 'Default User Password', key: 'default_password', ph: 'DDN@Infinia2024!' }].map(f => (
            <div key={f.key}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>{f.label}</label>
              <input value={(form as any)[f.key]} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))} placeholder={f.ph} style={inp} />
            </div>
          ))}
        </div>
      )
      case 1: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Step 2 — Subtenants</h3>
            <button onClick={addST} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#ED2738', border: 'none', borderRadius: 7, color: 'white', cursor: 'pointer', fontSize: 13 }}><Plus size={13} /> Add</button>
          </div>
          {form.subtenants.map((st, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={st.name} onChange={e => updateST(i, 'name', e.target.value)} placeholder={`Subtenant ${i + 1} name`} style={{ ...inp, flex: 1 }} />
              {form.subtenants.length > 1 && <button onClick={() => removeST(i)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
      )
      case 2: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h3 style={{ margin: 0 }}>Step 3 — Users per Subtenant</h3>
          {form.subtenants.filter(s => s.name).map((st, si) => (
            <div key={si} style={{ background: 'var(--surface-hover)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Subtenant: {st.name}</span>
                <button onClick={() => addUser(si)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#ED2738', border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 12 }}><Plus size={12} /> Add User</button>
              </div>
              {st.users.map((u, ui) => (
                <div key={ui} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input value={u.username} onChange={e => updateUser(si, ui, 'username', e.target.value)} placeholder="username" style={{ ...inp, flex: 2 }} />
                  <select value={u.scope} onChange={e => updateUser(si, ui, 'scope', e.target.value)} style={{ ...inp, flex: 1, padding: '9px 8px' }}>
                    <option value="service-user">service-user</option>
                    <option value="tenant:admin">tenant:admin</option>
                    <option value="viewer">viewer</option>
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>
                    <input type="checkbox" checked={u.s3_access} onChange={e => updateUser(si, ui, 's3_access', e.target.checked)} />
                    S3 Key
                  </label>
                  <button onClick={() => removeUser(si, ui)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                </div>
              ))}
              {st.users.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>No users — add some above</div>}
            </div>
          ))}
        </div>
      )
      case 3: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0 }}>Step 4 — Dataset (Optional)</h3>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Dataset Type</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['s3', 'block', 'posix'].map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, dataset: { ...f.dataset, type: t } }))}
                  style={{ flex: 1, padding: '10px 0', background: form.dataset.type === t ? '#ED2738' : 'var(--surface-hover)', border: `1px solid ${form.dataset.type === t ? '#ED2738' : 'var(--border-subtle)'}`, borderRadius: 8, color: form.dataset.type === t ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontWeight: form.dataset.type === t ? 600 : 400, textTransform: 'uppercase', fontSize: 13 }}>{t}</button>
              ))}
            </div>
          </div>
          {[{ label: 'Dataset Name', key: 'name', ph: 'e.g. red-s3-dataset' }, { label: 'Quota (optional)', key: 'quota', ph: 'e.g. 1t, 500g, 100m' }, { label: 'Service Name (optional)', key: 'service_name', ph: 'e.g. redobj' }].map(f => (
            <div key={f.key}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 5 }}>{f.label}</label>
              <input value={(form.dataset as any)[f.key]} onChange={e => setForm(fm => ({ ...fm, dataset: { ...fm.dataset, [f.key]: e.target.value } }))} placeholder={f.ph} style={inp} />
            </div>
          ))}
        </div>
      )
      case 4: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0 }}>Step 5 — S3 Access Expiry</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>For users with "S3 Key" checked in Step 3</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {['30d', '90d', '1y', '2y'].map(e => (
              <button key={e} onClick={() => setForm(f => ({ ...f, s3_expiry: e }))}
                style={{ padding: '14px 0', background: form.s3_expiry === e ? '#ED2738' : 'var(--surface-hover)', border: `1px solid ${form.s3_expiry === e ? '#ED2738' : 'var(--border-subtle)'}`, borderRadius: 10, color: form.s3_expiry === e ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: 15 }}>{e}</button>
            ))}
          </div>
        </div>
      )
      case 5: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0 }}>Step 6 — Review</h3>
          <div style={{ background: 'var(--surface-hover)', borderRadius: 10, padding: '16px 18px', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.8 }}>
            <div style={{ color: '#00C280' }}>+ Tenant: {form.tenant} (admin: {form.admin_user})</div>
            {form.subtenants.filter(s => s.name).map((st, i) => (
              <div key={i}>
                <div style={{ color: '#6366F1', marginLeft: 16 }}>+ Subtenant: {st.name}</div>
                {st.users.filter(u => u.username).map((u, j) => (
                  <div key={j} style={{ color: '#0EA5E9', marginLeft: 32 }}>+ User: {u.username} [{u.scope}]{u.s3_access ? ' + S3 Key' : ''}</div>
                ))}
              </div>
            ))}
            {form.dataset.name && <div style={{ color: '#F59E0B', marginLeft: 16 }}>+ Dataset: {form.dataset.name} ({form.dataset.type}{form.dataset.quota ? `, ${form.dataset.quota}` : ''})</div>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', background: 'rgba(237,39,56,0.06)', border: '1px solid rgba(237,39,56,0.2)', borderRadius: 8, padding: '10px 14px' }}>
            ⚡ This will create all resources above in Infinia. Existing resources will be skipped (not overwritten).
          </div>
        </div>
      )
      case 6: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0 }}>Step 7 — Provisioning</h3>
          {events.length === 0 && !done && (
            <button onClick={provision} style={{ padding: '14px', background: '#ED2738', border: 'none', borderRadius: 10, color: 'white', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
              🚀 Provision Now
            </button>
          )}
          {events.length > 0 && (
            <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
              {events.map((ev, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <StepIcon status={ev.status} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{ev.message || `${ev.step}: ${ev.name}`}</span>
                    {ev.status === 'failed' && ev.detail && <div style={{ fontSize: 11, color: '#ED2738', marginTop: 2 }}>{ev.detail.slice(0, 120)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {newKeys.length > 0 && (
            <div style={{ background: '#00C28015', border: '1px solid #00C28040', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontWeight: 600, color: '#00C280', marginBottom: 10 }}>🔑 S3 Credentials Generated — Save These!</div>
              {newKeys.map((k, i) => (
                <div key={i} style={{ marginBottom: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  <div>Access: <strong>{k.s3_key}</strong></div>
                  <div>Secret: <strong>{k.s3_secret}</strong></div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Scope: {k.scope}</div>
                </div>
              ))}
            </div>
          )}
          {done && (
            <button onClick={() => onNavigate?.('storage')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', background: '#00C280', border: 'none', borderRadius: 10, color: 'white', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Go Test S3 Features <ArrowRight size={16} />
            </button>
          )}
        </div>
      )
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 700 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px 0' }}>Provision Wizard</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Zero-to-working tenant in one guided flow</p>
      </div>

      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 0 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: i === step ? '#ED2738' : i < step ? '#00C280' : 'var(--surface-hover)', border: `2px solid ${i === step ? '#ED2738' : i < step ? '#00C280' : 'var(--border-subtle)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: i <= step ? 'white' : 'var(--text-muted)' }}>
              {i < step ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 10, color: i === step ? '#ED2738' : 'var(--text-muted)', textAlign: 'center', fontWeight: i === step ? 600 : 400 }}>{s}</span>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 28 }}>
        {renderStep()}
      </div>

      {/* Nav buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: step === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: step === 0 ? 'not-allowed' : 'pointer', fontSize: 14 }}>
          <ChevronLeft size={16} /> Back
        </button>
        {step < 6 ? (
          <button onClick={() => setStep(s => Math.min(6, s + 1))}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: '#ED2738', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            Next <ChevronRight size={16} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
