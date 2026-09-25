import React, { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { toast } from 'react-hot-toast'
import { Zap, Trash2, ChevronDown, RefreshCw, CheckSquare, Square, FolderOpen } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Preset { id: string; bucket: string; description: string; object_count: number }
interface LogLine { step: string; status: string; message: string; buckets?: string[]; object_count?: number }

// ── File type badge ───────────────────────────────────────────────────────────
const EXT_COLORS: Record<string, string> = {
  pdf:  '#ED2738', docx: '#2B5CE6', txt: '#10B981',
  csv:  '#F59E0B', xlsx: '#10B981',
}
function FileBadge({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() || 'txt'
  const color = EXT_COLORS[ext] || '#6366F1'
  return (
    <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
      background: color + '25', color, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
      {ext}
    </span>
  )
}

// ── Step icon ────────────────────────────────────────────────────────────────
function StepIcon({ status }: { status: string }) {
  if (status === 'running')  return <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite', color: '#F59E0B', flexShrink: 0 }} />
  if (status === 'success')  return <span style={{ color: '#00C280', flexShrink: 0 }}>✓</span>
  if (status === 'warning')  return <span style={{ color: '#F59E0B', flexShrink: 0 }}>⚠</span>
  if (status === 'failed')   return <span style={{ color: '#ED2738', flexShrink: 0 }}>✗</span>
  return <span style={{ color: '#6366F1', flexShrink: 0 }}>›</span>
}

// File lists per preset (mirroring backend)
const PRESET_FILES: Record<string, string[]> = {
  'docs-archive':    ['quarterly-report-q3-2026.pdf','employee-handbook-v3.pdf','project-proposal-infinia.docx','meeting-notes-sept.txt','sla-agreement-ncp.pdf','vendor-contract-2026.docx'],
  'media-assets':    ['product-datasheet-infinia.pdf','design-brief-q4.docx','campaign-notes-oct.txt','brand-guidelines-2026.pdf','press-release-draft.docx'],
  'data-lake-raw':   ['telemetry-log-2026-09.txt','sensor-readings-cluster1.csv','ingestion-manifest.txt','pipeline-config.txt','anomaly-report-sept.txt'],
  'compliance-vault':['audit-trail-2026.pdf','gdpr-compliance-report-q3.pdf','data-retention-policy.docx','incident-report-001.txt','penetration-test-summary.pdf'],
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SeedData() {
  const [tenants, setTenants]               = useState<{ label: string; tenant_name: string }[]>([])
  const [selectedTenant, setSelectedTenant] = useState('')
  const [presets, setPresets]               = useState<Preset[]>([])
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set())
  const [generating, setGenerating]         = useState(false)
  const [cleaning, setCleaning]             = useState(false)
  const [log, setLog]                       = useState<LogLine[]>([])
  const [generatedBuckets, setGeneratedBuckets] = useState<string[]>([])
  const [isDone, setIsDone]                 = useState(false)
  const [checkingExisting, setCheckingExisting] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  // All known preset bucket names (for cross-check)
  const PRESET_BUCKET_NAMES = Object.keys(PRESET_FILES)

  // Load tenants + presets on mount
  useEffect(() => {
    axios.get('/api/isolation/tenants')
      .then(r => {
        const list = r.data.tenants || []
        setTenants(list)
        if (list.length > 0) setSelectedTenant(list[0].label)
      })
      .catch(() => toast.error('Could not load tenants'))

    axios.get('/api/admin/seeddata/presets')
      .then(r => {
        const p = r.data.presets || []
        setPresets(p)
        setSelectedPresets(new Set(p.map((x: Preset) => x.id)))
      })
      .catch(() => toast.error('Could not load presets'))
  }, [])

  // Auto-detect existing preset buckets whenever tenant changes
  useEffect(() => {
    if (!selectedTenant) return
    setCheckingExisting(true)
    setGeneratedBuckets([])   // reset while scanning
    setIsDone(false)
    axios.get('/api/buckets', { params: { tenant: selectedTenant } })
      .then(r => {
        const allBuckets: string[] = (r.data?.buckets || []).map((b: any) => b.Name || b)
        const found = allBuckets.filter(b => PRESET_BUCKET_NAMES.includes(b))
        if (found.length > 0) {
          setGeneratedBuckets(found)
          setIsDone(true)
        }
      })
      .catch(() => {})   // silently ignore — bucket list may fail before login
      .finally(() => setCheckingExisting(false))
  }, [selectedTenant])

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const togglePreset = (id: string) => {
    setSelectedPresets(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll   = () => setSelectedPresets(new Set(presets.map(p => p.id)))
  const selectNone  = () => setSelectedPresets(new Set())

  const generate = async () => {
    if (!selectedTenant) return toast.error('Select a tenant first')
    if (selectedPresets.size === 0) return toast.error('Select at least one bucket preset')

    setGenerating(true)
    setLog([])
    setIsDone(false)
    setGeneratedBuckets([])

    try {
      const response = await fetch(`/api/admin/seeddata/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant: selectedTenant, preset_ids: [...selectedPresets] }),
      })
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No stream')
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try {
            const ev: LogLine = JSON.parse(line.slice(5).trim())
            setLog(prev => [...prev, ev])
            if (ev.step === 'done' && ev.buckets) {
              setGeneratedBuckets(ev.buckets)
              setIsDone(true)
            }
          } catch {}
        }
      }
    } catch (e: any) {
      toast.error('Generator failed: ' + e.message)
    } finally {
      setGenerating(false)
    }
  }

  const cleanup = async () => {
    if (!selectedTenant || generatedBuckets.length === 0) {
      toast.error('Nothing to clean up — generate data first')
      return
    }
    setCleaning(true)
    try {
      const r = await axios.post('/api/admin/seeddata/cleanup', {
        tenant:  selectedTenant,
        buckets: generatedBuckets,
      })
      const { buckets_cleaned, objects_deleted } = r.data
      toast.success(`Removed ${buckets_cleaned} bucket(s) and ${objects_deleted} object(s)`)
      setLog([])
      setGeneratedBuckets([])
      setIsDone(false)
    } catch (e: any) {
      toast.error('Cleanup failed: ' + (e.response?.data?.detail || e.message))
    } finally {
      setCleaning(false)
    }
  }

  const totalObjects = [...selectedPresets].reduce((acc, id) => {
    const p = presets.find(x => x.id === id)
    return acc + (p?.object_count || 0)
  }, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Zap size={26} color="#F59E0B" />
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Sample Data Generator</h1>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: '#F59E0B20', color: '#F59E0B', border: '1px solid #F59E0B40' }}>DEMO TOOL</span>
        </div>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 14, lineHeight: 1.6, maxWidth: 680 }}>
          Instantly create realistic buckets and sample files (PDF, DOCX, TXT, CSV) in any configured tenant.
          Use this to populate data before running Tenant Isolation tests, Lifecycle rules, or Presigned URL demos.
          All generated resources can be removed in one click.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' as const }}>

        {/* ── LEFT: config panel ── */}
        <div style={{ flex: '0 0 340px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Tenant selector */}
          <div style={{ background: 'var(--surface-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: 'var(--text-primary)' }}>1. Select Target Tenant</div>
            <div style={{ position: 'relative' }}>
              <select value={selectedTenant} onChange={e => setSelectedTenant(e.target.value)}
                style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, appearance: 'none', cursor: 'pointer' }}>
                {tenants.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
              </select>
              <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
            </div>
            {selectedTenant && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                Data will be created in the <strong style={{ color: 'var(--text-primary)' }}>{selectedTenant}</strong> tenant's S3 namespace.
              </div>
            )}
          </div>

          {/* Bucket preset selector */}
          <div style={{ background: 'var(--surface-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>2. Choose Bucket Presets</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={selectAll}  style={{ fontSize: 11, padding: '3px 8px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer' }}>All</button>
                <button onClick={selectNone} style={{ fontSize: 11, padding: '3px 8px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer' }}>None</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {presets.map(p => {
                const checked = selectedPresets.has(p.id)
                return (
                  <div key={p.id} onClick={() => togglePreset(p.id)}
                    style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${checked ? '#F59E0B50' : 'var(--border-subtle)'}`,
                      background: checked ? '#F59E0B08' : 'var(--surface-hover)', cursor: 'pointer', alignItems: 'flex-start' }}>
                    <div style={{ color: checked ? '#F59E0B' : 'var(--text-muted)', marginTop: 1, flexShrink: 0 }}>
                      {checked ? <CheckSquare size={15} /> : <Square size={15} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <FolderOpen size={13} color={checked ? '#F59E0B' : 'var(--text-muted)'} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: checked ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.bucket}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{p.description}</div>
                      {/* File list */}
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                        {(PRESET_FILES[p.id] || []).map(f => <FileBadge key={f} name={f} />)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Summary + Generate button */}
          <div style={{ background: 'var(--surface-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>3. Generate</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, padding: '8px 12px', background: 'var(--surface-hover)', borderRadius: 6 }}>
              Will create <strong style={{ color: 'var(--text-primary)' }}>{selectedPresets.size} bucket(s)</strong> with{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{totalObjects} sample file(s)</strong> in tenant{' '}
              <strong style={{ color: '#F59E0B' }}>{selectedTenant || '—'}</strong>
            </div>
            <button onClick={generate} disabled={generating || selectedPresets.size === 0 || !selectedTenant}
              style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none',
                background: generating || selectedPresets.size === 0 ? 'var(--surface-hover)' : '#F59E0B',
                color: generating || selectedPresets.size === 0 ? 'var(--text-muted)' : '#000',
                fontWeight: 700, fontSize: 14, cursor: generating ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {generating
                ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
                : <><Zap size={16} /> Generate Sample Data</>}
            </button>
          </div>
        </div>

        {/* ── RIGHT: log + results ── */}
        <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Scanning indicator */}
          {checkingExisting && (
            <div style={{ background: 'var(--surface-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
              <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite', color: '#F59E0B' }} />
              Scanning {selectedTenant} for existing sample data…
            </div>
          )}

          {/* Intro when nothing running and nothing detected */}
          {log.length === 0 && !generating && !checkingExisting && generatedBuckets.length === 0 && (
            <div style={{ background: 'var(--surface-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', padding: '40px 30px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Zap size={40} color="#F59E0B" style={{ opacity: 0.4, marginBottom: 12 }} />
              <div style={{ fontSize: 14, marginBottom: 6 }}>Configure a tenant and presets, then click <strong>Generate</strong>.</div>
              <div style={{ fontSize: 12 }}>The log will stream here in real time.</div>
            </div>
          )}

          {/* Live log */}
          {log.length > 0 && (
            <div style={{ background: 'var(--surface-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Generation Log</span>
                {generating && <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite', color: '#F59E0B' }} />}
              </div>
              <div ref={logRef} style={{ background: '#0d1117', padding: '14px 16px', maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {log.map((ev, i) => {
                  const isBucket = ev.step === 'bucket'
                  const stepColor = ev.step === 'bucket' ? '#6366F1' : ev.step === 'upload' ? '#F59E0B' : ev.step === 'done' ? '#00C280' : '#888'
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      <StepIcon status={ev.status} />
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, background: stepColor + '20', color: stepColor, flexShrink: 0, textTransform: 'uppercase' as const }}>{ev.step}</span>
                      <span style={{ color: ev.status === 'success' ? '#00C280' : ev.status === 'failed' ? '#ED2738' : ev.status === 'warning' ? '#F59E0B' : '#e6edf3' }}>{ev.message}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Cleanup card — shows whenever preset buckets are detected (from generate OR from auto-scan on page load) */}
          {generatedBuckets.length > 0 && !checkingExisting && (
            <div style={{ background: 'var(--surface-card)', borderRadius: 12, border: '1px solid #00C28040', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00C280' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#00C280' }}>
                  {isDone
                    ? `${generatedBuckets.length} bucket(s) generated in tenant "${selectedTenant}"`
                    : `${generatedBuckets.length} sample bucket(s) found in tenant "${selectedTenant}"`}
                </span>
              </div>

              {/* Bucket file tree */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {generatedBuckets.map(b => (
                  <div key={b} style={{ background: 'var(--surface-hover)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
                      <FolderOpen size={14} color="#F59E0B" />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{b}</span>
                    </div>
                    <div style={{ padding: '8px 12px', display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                      {(PRESET_FILES[b] || []).map(f => (
                        <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                          <FileBadge name={f} />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Cleanup button */}
              <button onClick={cleanup} disabled={cleaning}
                style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1px solid #ED273850',
                  background: cleaning ? 'var(--surface-hover)' : '#ED273815',
                  color: cleaning ? 'var(--text-muted)' : '#ED2738',
                  fontWeight: 700, fontSize: 14, cursor: cleaning ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {cleaning
                  ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Removing…</>
                  : <><Trash2 size={16} /> Remove All Generated Data (1-click)</>}
              </button>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
                Deletes all {generatedBuckets.length} bucket(s) and their objects from the {selectedTenant} tenant
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
