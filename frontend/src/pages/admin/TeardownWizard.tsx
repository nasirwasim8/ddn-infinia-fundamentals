import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Trash2, AlertTriangle, CheckCircle, XCircle, Loader } from 'lucide-react'
import { listTenants, listSubtenants, listUsers } from '../../services/adminApi'

interface SSEEvent { step: string; name: string; status: string; message: string; detail: string }
function StepIcon({ status }: { status: string }) {
  if (status === 'running') return <Loader size={16} color="#F59E0B" style={{ animation: 'spin 1s linear infinite' }} />
  if (status === 'success') return <CheckCircle size={16} color="#00C280" />
  if (status === 'failed') return <XCircle size={16} color="#ED2738" />
  return <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border-subtle)' }} />
}

export default function TeardownWizard() {
  const [tenants, setTenants] = useState<any[]>([])
  const [selected, setSelected] = useState('')
  const [tree, setTree] = useState<any>(null)
  const [loadingTree, setLoadingTree] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  // Use a Map keyed by "step:name" so each step shows ONE row that updates in place
  const [eventMap, setEventMap] = useState<Map<string, SSEEvent>>(new Map())
  const [eventOrder, setEventOrder] = useState<string[]>([])
  const [doneEvent, setDoneEvent] = useState<SSEEvent | null>(null)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)


  useEffect(() => {
    listTenants().then(r => setTenants(r.data.tenants || [])).catch(() => toast.error('Failed to load tenants'))
  }, [])

  const loadTree = async (tenant: string) => {
    if (!tenant) return
    setLoadingTree(true); setTree(null); setConfirmText('')
    setEventMap(new Map()); setEventOrder([]); setDoneEvent(null)
    setStarted(false); setDone(false)
    try {
      const [sr, ur] = await Promise.allSettled([listSubtenants(tenant), listUsers(tenant)])
      const subs = sr.status === 'fulfilled' ? sr.value.data.subtenants || [] : []
      const users = ur.status === 'fulfilled' ? ur.value.data.users || [] : []
      setTree({ tenant, subtenants: subs, users })
    } catch { toast.error('Failed to load tenant tree') }
    finally { setLoadingTree(false) }
  }

  const upsertEvent = (ev: SSEEvent) => {
    const key = `${ev.step}:${ev.name}`
    // Parse raw JSON error blobs into readable messages
    let msg = ev.message || `${ev.step}: ${ev.name}`
    if (msg.trimStart().startsWith('{') || msg.trimStart().startsWith('[')) {
      try {
        const parsed = JSON.parse(msg)
        msg = parsed.detail || parsed.error || parsed.message || msg
      } catch {}
    }
    const cleaned = { ...ev, message: msg }
    setEventMap(m => new Map(m).set(key, cleaned))
    setEventOrder(o => o.includes(key) ? o : [...o, key])
  }

  const doTeardown = async () => {
    setEventMap(new Map()); setEventOrder([]); setDoneEvent(null)
    setStarted(true); setDone(false)
    try {
      const res = await fetch('/api/admin/wizard/teardown', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant: selected, confirm: true })
      })
      const reader = res.body!.getReader(); const dec = new TextDecoder()
      while (true) {
        const { done: d, value } = await reader.read(); if (d) break
        for (const line of dec.decode(value).split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const ev = JSON.parse(line.slice(6))
              if (ev.step === 'done') { setDone(true); setDoneEvent(ev) }
              else { upsertEvent(ev) }
            } catch {}
          }
        }
      }
    } catch (e: any) { toast.error('Teardown failed: ' + e.message) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 640 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px 0', color: '#ED2738' }}>Teardown Wizard</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Safely remove a tenant and all its resources</p>
      </div>

      {/* Step 1: Select tenant */}
      <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 24 }}>
        <h3 style={{ margin: '0 0 14px 0' }}>1. Select Tenant</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={selected} onChange={e => { setSelected(e.target.value); loadTree(e.target.value) }}
            style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer' }}>
            <option value="">-- Select a tenant --</option>
            {tenants.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {/* Step 2: Dependency tree */}
      {selected && (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 24 }}>
          <h3 style={{ margin: '0 0 14px 0' }}>2. Resources to be Deleted</h3>
          {loadingTree ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading dependency tree…</div> : tree ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trash2 size={14} color="#ED2738" />
                <span style={{ fontWeight: 700, color: '#ED2738' }}>Tenant: {tree.tenant}</span>
              </div>
              {tree.subtenants.map((st: any, i: number) => (
                <div key={i} style={{ marginLeft: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Trash2 size={12} color="#F59E0B" />
                    <span style={{ color: '#F59E0B' }}>Subtenant: {st.name}</span>
                  </div>
                  {tree.users.filter((u: any) => u.tenant === tree.tenant).map((u: any, j: number) => (
                    <div key={j} style={{ marginLeft: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Trash2 size={11} color="var(--text-muted)" />
                      <span style={{ color: 'var(--text-muted)' }}>User: {u.username}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Step 3: Confirm */}
      {tree && !started && (
        <div style={{ background: '#ED273810', border: '1px solid #ED273840', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
            <AlertTriangle size={20} color="#ED2738" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600, color: '#ED2738', marginBottom: 4 }}>This action cannot be undone</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>All subtenants, users, and datasets under <strong style={{ color: 'var(--text-primary)' }}>{selected}</strong> will be permanently deleted.</div>
            </div>
          </div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Type <strong>{selected}</strong> to confirm:</label>
          <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder={selected}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `2px solid ${confirmText === selected ? '#ED2738' : 'var(--border-subtle)'}`, background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }} />
          <button onClick={doTeardown} disabled={confirmText !== selected}
            style={{ width: '100%', padding: '12px', background: confirmText === selected ? '#ED2738' : '#ED273850', border: 'none', borderRadius: 8, color: 'white', fontWeight: 700, fontSize: 15, cursor: confirmText === selected ? 'pointer' : 'not-allowed' }}>
            <Trash2 size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Execute Teardown
          </button>
        </div>
      )}

      {/* Step 4: Progress */}
      {eventOrder.length > 0 && (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 14px 0' }}>Teardown Progress</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
            {eventOrder.map(key => {
              const ev = eventMap.get(key)!
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <StepIcon status={ev.status} />
                  <span style={{ fontSize: 13, color: ev.status === 'failed' ? '#ED2738' : 'var(--text-primary)' }}>
                    {ev.message}
                  </span>
                </div>
              )
            })}
          </div>
          {done && doneEvent && (
            <div style={{
              marginTop: 16, padding: '12px 16px', borderRadius: 8, fontWeight: 600, fontSize: 14,
              background: doneEvent.status === 'success' ? '#00C28015' : '#ED273810',
              border: `1px solid ${doneEvent.status === 'success' ? '#00C28040' : '#ED273840'}`,
              color: doneEvent.status === 'success' ? '#00C280' : '#ED2738'
            }}>
              {doneEvent.status === 'success' ? '✅' : '⚠️'} {doneEvent.message || 'Teardown complete'}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
