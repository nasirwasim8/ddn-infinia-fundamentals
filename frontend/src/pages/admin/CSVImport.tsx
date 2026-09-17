import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { FileUp, Download, CheckCircle, AlertCircle, Loader, XCircle, Play } from 'lucide-react'
import { previewImport } from '../../services/adminApi'

const TYPE_COLORS: Record<string, string> = {
  tenant: '#ED2738', subtenant: '#6366F1', user: '#0EA5E9'
}

const YAML_TEMPLATE = `# DDN Infinia — Bulk Provision Template
# Edit tenant/subtenant/user names, then Import & Provision

user_default_password: "DDN@Infinia2024!"

tenants:

  my-team:
    admin: "my-team-admin"
    s3_dataset: "my-team-s3"
    s3_service: "my-team-obj"
    subtenants:
      dev:
        users:
          - "dev-user-01"
          - "dev-user-02"
      prod:
        users:
          - "prod-user-01"
`

const CSV_TEMPLATE = `tenant,subtenant,username,scope,default_password
my-team,dev,dev-user-01,service-user,DDN@Infinia2024!
my-team,dev,dev-user-02,service-user,DDN@Infinia2024!
my-team,prod,prod-user-01,service-user,DDN@Infinia2024!
`

type Format = 'yaml' | 'csv'
type Status = 'idle' | 'previewing' | 'provisioning' | 'done'
interface SSEEvent { step: string; name: string; status: string; message: string; detail?: string }

function StepIcon({ status }: { status: string }) {
  if (status === 'running') return <Loader size={15} color="#F59E0B" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
  if (status === 'success') return <CheckCircle size={15} color="#00C280" style={{ flexShrink: 0 }} />
  if (status === 'skipped') return <CheckCircle size={15} color="#6366F1" style={{ flexShrink: 0 }} />
  if (status === 'failed') return <XCircle size={15} color="#ED2738" style={{ flexShrink: 0 }} />
  return <div style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid var(--border-subtle)', flexShrink: 0 }} />
}

export default function CSVImport({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [format, setFormat] = useState<Format>('yaml')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [plan, setPlan] = useState<any[]>([])
  const [tenantCount, setTenantCount] = useState(0)
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [dragging, setDragging] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [summary, setSummary] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  const downloadTemplate = (fmt: Format) => {
    const text = fmt === 'yaml' ? YAML_TEMPLATE : CSV_TEMPLATE
    const ext = fmt === 'yaml' ? 'yaml' : 'csv'
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `infinia_template.${ext}`; a.click()
  }

  const handleFile = (file: File) => {
    const isCSV = file.name.endsWith('.csv')
    if (isCSV) setFormat('csv')
    else setFormat('yaml')
    const reader = new FileReader()
    reader.onload = e => setContent(e.target?.result as string || '')
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]; if (file) handleFile(file)
  }

  const browseFile = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.yaml,.yml,.csv'
    i.onchange = (e: any) => handleFile(e.target.files[0]); i.click()
  }

  const doPreview = async () => {
    if (!content.trim()) return toast.error('Paste content or upload a file first')
    setStatus('previewing'); setPlan([]); setEvents([]); setIsDone(false)
    try {
      const r = await previewImport(content, format)
      setPlan(r.data.plan || [])
      setTenantCount(r.data.tenant_count || 0)
      setStatus('idle')
      toast.success(`Preview ready — ${r.data.tenant_count} tenants, ${r.data.total} total resources`)
    } catch (e: any) {
      setStatus('idle')
      toast.error(e.response?.data?.detail || 'Parse failed — check format')
    }
  }

  const doProvision = async () => {
    if (!content.trim()) return toast.error('No content to provision')
    setStatus('provisioning'); setEvents([]); setIsDone(false); setSummary('')
    try {
      const res = await fetch('/api/admin/wizard/bulk-provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, format }),
      })
      const reader = res.body!.getReader(); const dec = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev: SSEEvent = JSON.parse(line.slice(6))
            setEvents(prev => [...prev, ev])
            if (ev.step === 'done') {
              setIsDone(true); setSummary(ev.message)
              setStatus('done')
            }
            // auto-scroll log
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
          } catch {}
        }
      }
    } catch (e: any) {
      setStatus('idle')
      toast.error('Provisioning stream failed: ' + e.message)
    }
  }

  const hasPreview = plan.length > 0
  const isProvisioning = status === 'provisioning'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px 0' }}>CSV / YAML Bulk Import</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Upload or paste a YAML/CSV file to provision <strong>multiple tenants</strong>, subtenants, and users in one operation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => downloadTemplate('yaml')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 7, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
            <Download size={13} /> YAML Template
          </button>
          <button onClick={() => downloadTemplate('csv')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 7, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
            <Download size={13} /> CSV Template
          </button>
        </div>
      </div>

      {/* Format selector */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['yaml', 'csv'] as Format[]).map(f => (
          <button key={f} onClick={() => setFormat(f)}
            style={{ padding: '8px 20px', background: format === f ? '#ED2738' : 'var(--surface-hover)', border: `1px solid ${format === f ? '#ED2738' : 'var(--border-subtle)'}`, borderRadius: 8, color: format === f ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: 13, textTransform: 'uppercase' }}>
            {f}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
        onDrop={handleDrop} onClick={browseFile}
        style={{ border: `2px dashed ${dragging ? '#ED2738' : 'var(--border-subtle)'}`, borderRadius: 12, padding: '28px 24px', textAlign: 'center', cursor: 'pointer', background: dragging ? '#ED273808' : 'var(--surface-card)', transition: 'all 0.15s' }}>
        <FileUp size={26} color={dragging ? '#ED2738' : 'var(--text-muted)'} style={{ marginBottom: 8 }} />
        <div style={{ fontWeight: 500, marginBottom: 4 }}>Drop {format.toUpperCase()} file here or click to browse</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Accepts .yaml, .yml, .csv</div>
      </div>

      {/* Textarea */}
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Or paste {format.toUpperCase()} directly</label>
        <textarea value={content} onChange={e => { setContent(e.target.value); setPlan([]); setEvents([]); setIsDone(false) }}
          placeholder={format === 'yaml' ? YAML_TEMPLATE : CSV_TEMPLATE}
          style={{ width: '100%', height: 220, padding: 14, borderRadius: 10, border: '1px solid var(--border-subtle)', background: '#0d1117', color: '#e6edf3', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' }} />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={doPreview} disabled={isProvisioning || status === 'previewing'}
          style={{ flex: 1, padding: '11px 0', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: isProvisioning ? 0.5 : 1 }}>
          {status === 'previewing' ? '⏳ Parsing…' : '🔍 Preview Plan'}
        </button>
        <button onClick={doProvision} disabled={isProvisioning || !content.trim()}
          style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', background: isProvisioning ? '#ED273880' : '#ED2738', border: 'none', borderRadius: 8, color: 'white', fontWeight: 700, fontSize: 15, cursor: isProvisioning ? 'not-allowed' : 'pointer' }}>
          {isProvisioning ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Provisioning…</> : <><Play size={16} /> Provision All Tenants</>}
        </button>
      </div>

      {/* Preview table */}
      {hasPreview && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <CheckCircle size={16} color="#00C280" />
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {tenantCount} tenant{tenantCount !== 1 ? 's' : ''} · {plan.length} total resources
            </span>
          </div>
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden', maxHeight: 360, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ background: 'var(--surface-hover)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  {['Type', 'Name', 'Tenant', 'Subtenant'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {plan.map((p, i) => (
                  <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none', fontSize: 13 }}>
                    <td style={{ padding: '9px 16px' }}>
                      <span style={{ background: `${TYPE_COLORS[p.type] || '#888'}20`, color: TYPE_COLORS[p.type] || '#888', padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>{p.type}</span>
                    </td>
                    <td style={{ padding: '9px 16px', fontWeight: p.type === 'tenant' ? 700 : 400, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{p.name}</td>
                    <td style={{ padding: '9px 16px', color: 'var(--text-muted)' }}>{p.tenant || '—'}</td>
                    <td style={{ padding: '9px 16px', color: 'var(--text-muted)' }}>{p.subtenant || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, padding: '9px 14px', background: 'rgba(237,39,56,0.05)', border: '1px solid rgba(237,39,56,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)' }}>
            <AlertCircle size={14} color="#ED2738" />
            Existing resources will be skipped — no data will be overwritten.
          </div>
        </div>
      )}

      {/* Live provision log */}
      {events.length > 0 && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px 0' }}>
            {isProvisioning ? '⏳ Provisioning in progress…' : isDone ? '✅ Provisioning complete' : 'Provision log'}
          </h3>
          <div ref={logRef} style={{ background: '#0d1117', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '14px 16px', maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {events.map((ev, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                <StepIcon status={ev.status} />
                <div style={{ flex: 1 }}>
                  <span style={{ color: ev.status === 'success' ? '#00C280' : ev.status === 'failed' ? '#ED2738' : ev.status === 'skipped' ? '#6366F1' : '#F59E0B' }}>
                    {ev.message}
                  </span>
                  {ev.status === 'failed' && ev.detail && (
                    <div style={{ fontSize: 11, color: '#EF444480', marginTop: 2 }}>{ev.detail.slice(0, 100)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {isDone && summary && (
            <div style={{ marginTop: 12, padding: '14px 18px', background: summary.includes('0 errors') ? '#00C28015' : '#ED273815', border: `1px solid ${summary.includes('0 errors') ? '#00C28040' : '#ED273840'}`, borderRadius: 10 }}>
              <div style={{ fontWeight: 600, color: summary.includes('0 errors') ? '#00C280' : '#ED2738', marginBottom: 8 }}>{summary}</div>
              <button onClick={() => onNavigate?.('admin-tenants')}
                style={{ padding: '8px 16px', background: '#00C280', border: 'none', borderRadius: 7, color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                View Tenants →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
