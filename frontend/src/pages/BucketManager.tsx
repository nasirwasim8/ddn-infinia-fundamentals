import React, { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { Plus, Trash2, RefreshCw, Terminal, Copy, Check, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import * as api from '../services/api'

interface Props {
  activeTenant?: string | null
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}>
      {copied ? <Check size={14} color="#00C280" /> : <Copy size={14} />}
    </button>
  )
}

export default function BucketManager({ activeTenant }: Props) {
  const tenant = activeTenant || null

  // Per-tenant bucket list from localStorage (manual additions)
  const storageKey = `infinia-buckets-${tenant || 'default'}`
  const [buckets, setBuckets] = useState<string[]>([])
  const [liveBuckets, setLiveBuckets] = useState<string[] | null>(null) // from S3 list_buckets
  const [loadingLive, setLoadingLive] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showCLI, setShowCLI] = useState(false)
  const [newName, setNewName] = useState('')
  const [enableVersioning, setEnableVersioning] = useState(false)
  const [enableLock, setEnableLock] = useState(false)
  const [bucketMeta, setBucketMeta] = useState<Record<string, any>>({})
  const [loadingMeta, setLoadingMeta] = useState<string | null>(null)

  // Reload from localStorage when tenant changes
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]')
      setBuckets(saved)
    } catch {
      setBuckets([])
    }
    setBucketMeta({})
    setLiveBuckets(null)
  }, [storageKey])

  const saveBuckets = (list: string[]) => {
    setBuckets(list)
    localStorage.setItem(storageKey, JSON.stringify(list))
  }

  // Auto-fetch live bucket list from S3
  const fetchLiveBuckets = useCallback(async () => {
    setLoadingLive(true)
    try {
      const res = await api.listBuckets(tenant)
      const names: string[] = (res.data?.buckets || []).map((b: any) =>
        typeof b === 'string' ? b : (b.Name || b.name || '')
      ).filter(Boolean)
      setLiveBuckets(names)
      // Auto-merge: add any live buckets not in local list
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]')
      const merged = Array.from(new Set([...saved, ...names]))
      if (merged.length !== saved.length) saveBuckets(merged)
    } catch {
      setLiveBuckets(null)
    } finally {
      setLoadingLive(false)
    }
  }, [tenant, storageKey])

  useEffect(() => {
    fetchLiveBuckets()
  }, [fetchLiveBuckets])

  const addBucket = async () => {
    if (!newName.trim()) return toast.error('Enter a bucket name')
    const name = newName.trim()
    if (buckets.includes(name)) return toast.error('Bucket already in list')

    // Try to create on Infinia via S3 API first
    const toastId = toast.loading(`Creating bucket '${name}'…`)
    try {
      await api.createBucket({ name, enable_versioning: enableVersioning, enable_object_lock: enableLock }, tenant)
      toast.success(`Bucket '${name}' created successfully on Infinia!`, { id: toastId })
      setNewName('')
      setShowAdd(false)
      await fetchLiveBuckets() // refresh live list — bucket auto-appears
    } catch (err: any) {
      const detail = err?.response?.data?.detail || ''
      if (detail.includes('BucketAlreadyExists') || detail.includes('already')) {
        // Bucket already exists on Infinia — just register it locally
        toast.success(`Bucket '${name}' already exists — registered in your list.`, { id: toastId })
        saveBuckets([...buckets, name])
        setNewName('')
        setShowAdd(false)
        await fetchLiveBuckets()
      } else {
        toast.error(`Failed to create bucket: ${detail || 'Unknown error'}`, { id: toastId })
      }
    }
  }

  const removeBucket = (name: string) => {
    if (!window.confirm(`Remove '${name}' from this list? (Does NOT delete data on Infinia)`)) return
    saveBuckets(buckets.filter(b => b !== name))
    setBucketMeta(m => { const c = {...m}; delete c[name]; return c })
  }

  const loadMeta = async (name: string) => {
    setLoadingMeta(name)
    try {
      const res = await api.listObjects(name, '', tenant)
      const objects = res.data?.objects || []
      const totalSize = objects.reduce((s: number, o: any) => s + (o.Size || 0), 0)
      setBucketMeta(m => ({ ...m, [name]: { count: objects.length, size: totalSize } }))
    } catch {
      setBucketMeta(m => ({ ...m, [name]: { error: true } }))
    } finally {
      setLoadingMeta(null)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB'
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB'
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + ' KB'
    return bytes + ' B'
  }

  // Dynamic CLI commands based on active tenant
  const t = tenant || 'red'
  const s = t  // subtenant (for red: red, for others: first subtenant — use same name as convention)
  const u = t === 'red' ? 's3admin' : `${t}-admin`

  const cliCreate = (name: string, lock: boolean) =>
    `redcli s3 bucket create ${name || '<bucket-name>'} -t ${t} -s ${t === 'green' ? 'green-sub1' : s} -u ${u}${lock ? ' --object-lock' : ''}`

  const isLive = (name: string) => liveBuckets === null || liveBuckets.includes(name)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 8px 0' }}>Bucket Manager</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 14 }}>
            Manage and test your Infinia S3 buckets.
            {tenant && <span style={{ marginLeft: 8, color: '#ED2738', fontWeight: 500 }}>Active: {tenant}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => setShowCLI(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 14 }}
          >
            <Terminal size={16} /> CLI Guide {showCLI ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={fetchLiveBuckets}
            disabled={loadingLive}
            title="Refresh from S3"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}
          >
            <RefreshCw size={14} style={{ animation: loadingLive ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: '#ED2738', border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontWeight: 500, fontSize: 14 }}
          >
            <Plus size={16} /> Add Bucket
          </button>
        </div>
      </div>

      {/* Infinia Note Banner */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(0,194,128,0.07)', border: '1px solid rgba(0,194,128,0.25)', borderRadius: 10, padding: '14px 18px' }}>
        <AlertCircle size={18} color="#00C280" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Bucket creation works directly from this UI.</strong>{' '}
          <span style={{ color: 'var(--text-muted)' }}>
            Click <strong>+ Add Bucket</strong>, enter a name, and the bucket will be created immediately on Infinia for the active tenant via S3 API.
            Use the <strong>CLI Guide</strong> if you prefer to create via <code style={{ background: 'var(--surface-hover)', padding: '1px 5px', borderRadius: 3 }}>redcli</code> instead.
          </span>
        </div>
      </div>

      {/* CLI Guide Panel */}
      {showCLI && (
        <div style={{ background: '#0d1117', borderRadius: 10, border: '1px solid #30363d', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#8b949e', fontSize: 13, fontFamily: 'var(--font-mono)' }}>nwasim@infinia-rtx:~$</span>
            <span style={{ color: '#8b949e', fontSize: 12 }}>Run on the Infinia VM · tenant: <strong style={{ color: '#e6edf3' }}>{t}</strong></span>
          </div>
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Login (realm level)', cmd: 'redcli user login realm_admin -p Adminpassword' },
              { label: 'Create a bucket (no Object Lock)', cmd: `redcli s3 bucket create <bucket-name> -t ${t} -s ${t === 'green' ? 'green-sub1' : s} -u ${u}` },
              { label: 'Create with Object Lock (WORM)', cmd: `redcli s3 bucket create <bucket-name> -t ${t} -s ${t === 'green' ? 'green-sub1' : s} -u ${u} --object-lock` },
              { label: 'List all buckets for this tenant', cmd: `redcli s3 bucket list -t ${t} -s ${t === 'green' ? 'green-sub1' : s} -u ${u}` },
              { label: 'Delete a bucket (must be empty)', cmd: `redcli s3 bucket delete <bucket-name> -t ${t} -s ${t === 'green' ? 'green-sub1' : s}` },
            ].map(({ label, cmd }) => (
              <div key={label}>
                <div style={{ color: '#8b949e', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#161b22', borderRadius: 6, padding: '8px 12px' }}>
                  <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13, color: '#e6edf3' }}>{cmd}</span>
                  <CopyButton text={cmd} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bucket Table */}
      <div style={{ background: 'var(--surface-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-hover)', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              <th style={{ padding: '12px 24px', fontWeight: 600 }}>Bucket Name</th>
              <th style={{ padding: '12px 24px', fontWeight: 600 }}>Objects</th>
              <th style={{ padding: '12px 24px', fontWeight: 600 }}>Size</th>
              <th style={{ padding: '12px 24px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {buckets.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ marginBottom: 8 }}>No buckets for tenant <strong>{tenant || 'default'}</strong> yet.</div>
                  <div style={{ fontSize: 13 }}>
                    Create a bucket on the Infinia VM using the <strong>CLI Guide</strong> above,
                    then click <strong>Add Bucket</strong> to register it here.
                  </div>
                </td>
              </tr>
            ) : buckets.map(name => {
              const meta = bucketMeta[name]
              const live = isLive(name)
              return (
                <tr key={name} style={{ borderTop: '1px solid var(--border-subtle)', fontSize: 14, opacity: live ? 1 : 0.5 }}>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta?.error ? '#ED2738' : live ? '#00C280' : '#888', flexShrink: 0 }} />
                      <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{name}</span>
                      {!live && liveBuckets !== null && (
                        <span style={{ fontSize: 11, color: '#888', background: 'var(--surface-hover)', padding: '1px 6px', borderRadius: 4 }}>not in {tenant}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-muted)' }}>
                    {meta ? (meta.error ? '—' : meta.count) : (
                      <button onClick={() => loadMeta(name)} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 8px', fontSize: 12 }}>
                        {loadingMeta === name ? '...' : 'Probe'}
                      </button>
                    )}
                  </td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-muted)' }}>
                    {meta && !meta.error ? formatSize(meta.size) : '—'}
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                    <button onClick={() => removeBucket(name)} title="Remove from list" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Add Bucket Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface-card)', padding: 28, borderRadius: 14, width: 460, border: '1px solid var(--border-subtle)' }}>
            <h2 style={{ margin: '0 0 6px 0', fontSize: 18 }}>Add Bucket</h2>
            <p style={{ margin: '0 0 20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Enter the name of a bucket already created on Infinia for tenant <strong>{tenant || 'default'}</strong>.
            </p>

            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Bucket Name</label>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addBucket()}
              placeholder={`e.g. ddn-${tenant || 'infinia'}-bucket-01`}
              style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', marginBottom: 16, fontSize: 14, boxSizing: 'border-box' }}
            />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={enableVersioning} onChange={e => setEnableVersioning(e.target.checked)} />
              <span>Enable Versioning after adding</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={enableLock} onChange={e => setEnableLock(e.target.checked)} />
              <span>Created with Object Lock (WORM)</span>
            </label>

            {/* Show the redcli command */}
            {newName && (
              <div style={{ marginBottom: 20, background: '#0d1117', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ color: '#8b949e', fontSize: 11, marginBottom: 6, textTransform: 'uppercase' }}>redcli command to create this bucket</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12, color: '#e6edf3', wordBreak: 'break-all' }}>{cliCreate(newName, enableLock)}</code>
                  <CopyButton text={cliCreate(newName, enableLock)} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addBucket} style={{ padding: '8px 20px', background: '#ED2738', border: 'none', color: 'white', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}>Add Bucket</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
