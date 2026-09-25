import React, { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import {
  Plus, Trash2, RefreshCw, Terminal, Copy, Check,
  ChevronDown, ChevronUp, AlertCircle, UploadCloud,
  Download, FolderOpen, Folder,
} from 'lucide-react'
import * as api from '../services/api'

interface Props { activeTenant?: string | null }

// ── Helpers ───────────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}>
      {copied ? <Check size={14} color="#00C280" /> : <Copy size={14} />}
    </button>
  )
}

function formatSize(bytes: number) {
  if (!bytes) return '0 B'
  const s = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + s[i]
}

function FileTypeIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const colors: Record<string, string> = { pdf: '#ED2738', docx: '#2B5CE6', doc: '#2B5CE6', txt: '#10B981', csv: '#F59E0B', xlsx: '#10B981', png: '#8B5CF6', jpg: '#8B5CF6', jpeg: '#8B5CF6' }
  const color = colors[ext] || '#6366F1'
  return ext
    ? <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 3, background: color + '25', color, textTransform: 'uppercase' as const, letterSpacing: '0.05em', flexShrink: 0 }}>{ext}</span>
    : null
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BucketManager({ activeTenant }: Props) {
  const tenant     = activeTenant || null
  const storageKey = `infinia-buckets-${tenant || 'default'}`

  // ── Bucket state ──────────────────────────────────────────────────────────
  const [buckets, setBuckets]         = useState<string[]>([])
  const [liveBuckets, setLiveBuckets] = useState<string[] | null>(null)
  const [loadingLive, setLoadingLive] = useState(false)
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null)
  const [showAdd, setShowAdd]         = useState(false)
  const [showCLI, setShowCLI]         = useState(false)
  const [newName, setNewName]         = useState('')
  const [enableVersioning, setEnableVersioning] = useState(false)
  const [enableLock, setEnableLock]   = useState(false)

  // ── Object state ──────────────────────────────────────────────────────────
  const [objects, setObjects]         = useState<any[]>([])
  const [loadingObjs, setLoadingObjs] = useState(false)
  const [dragActive, setDragActive]   = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  // Reload from localStorage + live list when tenant changes
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]')
      setBuckets(saved)
    } catch { setBuckets([]) }
    setLiveBuckets(null)
    setSelectedBucket(null)
    setObjects([])
  }, [storageKey])

  const saveBuckets = (list: string[]) => {
    setBuckets(list)
    localStorage.setItem(storageKey, JSON.stringify(list))
  }

  // Fetch live buckets from S3
  const fetchLiveBuckets = useCallback(async () => {
    setLoadingLive(true)
    try {
      const res = await api.listBuckets(tenant)
      const names: string[] = (res.data?.buckets || []).map((b: any) =>
        typeof b === 'string' ? b : (b.Name || b.name || '')
      ).filter(Boolean)
      setLiveBuckets(names)
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]')
      const merged = Array.from(new Set([...saved, ...names]))
      if (merged.length !== saved.length) saveBuckets(merged)
    } catch { setLiveBuckets(null) }
    finally { setLoadingLive(false) }
  }, [tenant, storageKey])

  useEffect(() => { fetchLiveBuckets() }, [fetchLiveBuckets])

  // Load objects whenever selected bucket changes
  const loadObjects = useCallback(async (bucket?: string) => {
    const b = bucket || selectedBucket
    if (!b) return
    setLoadingObjs(true)
    try {
      const res = await api.listObjects(b, '', tenant)
      setObjects(res.data.objects || [])
      setSelectedKeys(new Set())
    } catch (e: any) { toast.error('Failed to list objects: ' + e.message) }
    finally { setLoadingObjs(false) }
  }, [selectedBucket, tenant])

  useEffect(() => {
    if (selectedBucket) loadObjects(selectedBucket)
    else setObjects([])
  }, [selectedBucket])


  // Select a bucket
  const selectBucket = (name: string) => {
    setSelectedBucket(prev => prev === name ? null : name)
    setObjects([])
  }

  // Create bucket
  const addBucket = async () => {
    if (!newName.trim()) return toast.error('Enter a bucket name')
    const name = newName.trim()
    const toastId = toast.loading(`Creating bucket '${name}'…`)
    try {
      await api.createBucket({ name, enable_versioning: enableVersioning, enable_object_lock: enableLock }, tenant)
      toast.success(`Bucket '${name}' created!`, { id: toastId })
      setNewName(''); setShowAdd(false)
      await fetchLiveBuckets()
      setSelectedBucket(name)
    } catch (err: any) {
      const detail = err?.response?.data?.detail || ''
      if (detail.includes('BucketAlreadyExists') || detail.includes('already')) {
        toast.success(`Bucket '${name}' already exists — registered.`, { id: toastId })
        saveBuckets([...buckets, name])
        setNewName(''); setShowAdd(false)
        await fetchLiveBuckets()
        setSelectedBucket(name)
      } else {
        toast.error(`Failed: ${detail || 'Unknown error'}`, { id: toastId })
      }
    }
  }

  // Remove from list (not from Infinia)
  const removeBucket = (name: string) => {
    if (!window.confirm(`Remove '${name}' from list? (Does NOT delete data on Infinia)`)) return
    saveBuckets(buckets.filter(b => b !== name))
    if (selectedBucket === name) { setSelectedBucket(null); setObjects([]) }
  }

  // Upload object
  const handleUpload = async (file: File) => {
    if (!selectedBucket) return toast.error('Select a bucket first')
    const toastId = toast.loading(`Uploading ${file.name}…`)
    try {
      await api.uploadObject(selectedBucket, file, undefined, tenant)
      toast.success('Upload complete', { id: toastId })
      loadObjects(selectedBucket)
    } catch (e: any) { toast.error('Upload failed: ' + e.message, { id: toastId }) }
  }

  // Delete object
  const handleDelete = async (key: string) => {
    if (!window.confirm(`Delete "${key}"?`)) return
    try {
      await api.deleteObject(selectedBucket!, key, tenant)
      toast.success('Deleted')
      loadObjects(selectedBucket!)
    } catch (e: any) { toast.error('Delete failed: ' + e.message) }
  }

  const isLive = (name: string) => liveBuckets === null || liveBuckets.includes(name)
  const t = tenant || 'red'
  const s = t
  const u = t === 'red' ? 's3admin' : `${t}-admin`
  const cliCreate = (name: string, lock: boolean) =>
    `redcli s3 bucket create ${name || '<bucket-name>'} -t ${t} -s ${s} -u ${u}${lock ? ' --object-lock' : ''}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px 0' }}>Storage Explorer</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 14 }}>
            Manage buckets and browse objects.
            {tenant && <span style={{ marginLeft: 8, color: '#ED2738', fontWeight: 600 }}>Tenant: {tenant}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowCLI(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}>
            <Terminal size={14} /> CLI Guide {showCLI ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button onClick={fetchLiveBuckets} disabled={loadingLive} title="Refresh buckets"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <RefreshCw size={14} style={{ animation: loadingLive ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <button onClick={() => setShowAdd(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#ED2738', border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            <Plus size={15} /> New Bucket
          </button>
        </div>
      </div>

      {/* ── CLI Guide ── */}
      {showCLI && (
        <div style={{ background: '#0d1117', borderRadius: 10, border: '1px solid #30363d', overflow: 'hidden' }}>
          <div style={{ padding: '10px 18px', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#8b949e', fontSize: 13, fontFamily: 'var(--font-mono)' }}>user@infinia:~$</span>
            <span style={{ color: '#8b949e', fontSize: 12 }}>tenant: <strong style={{ color: '#e6edf3' }}>{t}</strong></span>
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Login', cmd: 'redcli user login realm_admin -p <your-password>' },
              { label: 'Create bucket', cmd: cliCreate('<bucket-name>', false) },
              { label: 'Create with Object Lock', cmd: cliCreate('<bucket-name>', true) },
              { label: 'List buckets', cmd: `redcli s3 bucket list -t ${t} -s ${s} -u ${u}` },
              { label: 'Delete bucket (must be empty)', cmd: `redcli s3 bucket delete <bucket-name> -t ${t} -s ${s}` },
            ].map(({ label, cmd }) => (
              <div key={label}>
                <div style={{ color: '#8b949e', fontSize: 11, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#161b22', borderRadius: 6, padding: '8px 12px' }}>
                  <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12, color: '#e6edf3' }}>{cmd}</span>
                  <CopyButton text={cmd} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Two-pane layout ── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* LEFT: Bucket list */}
        <div style={{ width: 260, flexShrink: 0, background: 'var(--surface-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
              Buckets ({buckets.length})
            </span>
            {loadingLive && <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />}
          </div>

          {buckets.length === 0 ? (
            <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              <Folder size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div>No buckets yet.</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Click <strong>New Bucket</strong> to create one.</div>
            </div>
          ) : (
            <div>
              {buckets.map(name => {
                const active  = selectedBucket === name
                const live    = isLive(name)
                return (
                  <div key={name}
                    onClick={() => selectBucket(name)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)',
                      background: active ? '#ED273810' : 'transparent',
                      borderLeft: active ? '3px solid #ED2738' : '3px solid transparent',
                      transition: 'background 0.15s',
                    }}>
                    {active
                      ? <FolderOpen size={15} color="#ED2738" style={{ flexShrink: 0 }} />
                      : <Folder size={15} color={live ? 'var(--text-muted)' : '#888'} style={{ flexShrink: 0 }} />}
                    <span style={{ flex: 1, fontSize: 13, fontWeight: active ? 600 : 400, fontFamily: 'var(--font-mono)', color: active ? '#ED2738' : live ? 'var(--text-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      {name}
                    </span>
                    {!live && liveBuckets !== null && (
                      <span style={{ fontSize: 10, color: '#888', background: 'var(--surface-hover)', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>!</span>
                    )}
                    <button onClick={e => { e.stopPropagation(); removeBucket(name) }}
                      title="Remove from list"
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, opacity: 0.5, flexShrink: 0 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* RIGHT: Object explorer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {!selectedBucket ? (
            <div style={{ background: 'var(--surface-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', padding: '60px 30px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <FolderOpen size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Select a bucket</div>
              <div style={{ fontSize: 13 }}>Click any bucket on the left to browse its objects.</div>
            </div>
          ) : (
            <>
              {/* Object pane header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FolderOpen size={18} color="#ED2738" />
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{selectedBucket}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{objects.length} object{objects.length !== 1 ? 's' : ''}</span>
                </div>
                <button onClick={() => loadObjects(selectedBucket)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
                  <RefreshCw size={12} style={{ animation: loadingObjs ? 'spin 1s linear infinite' : 'none' }} />
                  Refresh
                </button>
              </div>

              {/* Upload zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragActive(true) }}
                onDragLeave={() => setDragActive(false)}
                onDrop={e => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]) }}
                onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.onchange = (e: any) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]) }; i.click() }}
                style={{ border: `2px dashed ${dragActive ? '#ED2738' : 'var(--border-subtle)'}`, background: dragActive ? 'rgba(237,39,56,0.04)' : 'var(--surface-card)', borderRadius: 10, padding: '20px 24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <UploadCloud size={22} color={dragActive ? '#ED2738' : 'var(--text-muted)'} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: dragActive ? '#ED2738' : 'var(--text-primary)' }}>Click or drag & drop to upload</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Uploads to <strong>{selectedBucket}</strong></div>
                </div>
              </div>

              {/* Object table */}
              <div style={{ background: 'var(--surface-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-hover)', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>
                      <th style={{ padding: '10px 16px', width: 30 }}></th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Object Key</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Size</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600 }}>Last Modified</th>
                      <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' as const }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingObjs ? (
                      <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                        <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} /><div>Loading objects…</div>
                      </td></tr>
                    ) : objects.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                        No objects in <strong>{selectedBucket}</strong>. Upload a file to get started.
                      </td></tr>
                    ) : objects.map(o => (
                      <tr key={o.Key} style={{ borderTop: '1px solid var(--border-subtle)', fontSize: 13 }}>
                        <td style={{ padding: '12px 16px' }}>
                          <input type="checkbox" checked={selectedKeys.has(o.Key)} onChange={e => {
                            const next = new Set(selectedKeys)
                            e.target.checked ? next.add(o.Key) : next.delete(o.Key)
                            setSelectedKeys(next)
                          }} />
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FileTypeIcon name={o.Key} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>{o.Key}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{formatSize(o.Size)}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12 }}>{new Date(o.LastModified).toLocaleString()}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' as const }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                            <a href={api.downloadObject(selectedBucket, o.Key, tenant)} download={o.Key}
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                              <Download size={15} />
                            </a>
                            <button onClick={() => handleDelete(o.Key)}
                              style={{ background: 'none', border: 'none', color: '#ED2738', cursor: 'pointer', padding: 4 }}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Add Bucket Modal ── */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface-card)', padding: 28, borderRadius: 14, width: 460, border: '1px solid var(--border-subtle)' }}>
            <h2 style={{ margin: '0 0 6px 0', fontSize: 18 }}>New Bucket</h2>
            <p style={{ margin: '0 0 20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Creates the bucket directly on Infinia for tenant <strong>{tenant || 'default'}</strong>.
            </p>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>Bucket Name</label>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBucket()}
              placeholder={`e.g. ddn-${tenant || 'infinia'}-bucket-01`}
              style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', marginBottom: 14, fontSize: 14, boxSizing: 'border-box' as const }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={enableVersioning} onChange={e => setEnableVersioning(e.target.checked)} />
              Enable Versioning
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={enableLock} onChange={e => setEnableLock(e.target.checked)} />
              Enable Object Lock (WORM)
            </label>
            {newName && (
              <div style={{ marginBottom: 18, background: '#0d1117', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ color: '#8b949e', fontSize: 10, marginBottom: 6, textTransform: 'uppercase' as const }}>Equivalent redcli command</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#e6edf3', wordBreak: 'break-all' as const }}>{cliCreate(newName, enableLock)}</code>
                  <CopyButton text={cliCreate(newName, enableLock)} />
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addBucket} style={{ padding: '8px 20px', background: '#ED2738', border: 'none', color: 'white', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Create Bucket</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
