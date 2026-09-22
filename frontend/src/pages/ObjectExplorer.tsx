import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../services/api'
import { Download, Trash2, Info, UploadCloud, RefreshCw } from 'lucide-react'

interface Props { activeTenant?: string | null }

export default function ObjectExplorer({ activeTenant }: Props) {
  const [buckets, setBuckets]         = useState<any[]>([])
  const [selectedBucket, setSelectedBucket] = useState('')
  const [objects, setObjects]         = useState<any[]>([])
  const [loading, setLoading]         = useState(false)
  const [dragActive, setDragActive]   = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  // Reload buckets when tenant changes
  useEffect(() => {
    setBuckets([])
    setSelectedBucket('')
    setObjects([])
    api.listBuckets(activeTenant).then(res => {
      const list = res.data.buckets || []
      setBuckets(list)
      if (list.length > 0) setSelectedBucket(list[0].Name)
    }).catch(() => toast.error('Failed to load buckets'))
  }, [activeTenant])

  useEffect(() => {
    if (selectedBucket) loadObjects()
    else setObjects([])
  }, [selectedBucket])

  const loadObjects = async () => {
    setLoading(true)
    try {
      const res = await api.listObjects(selectedBucket, '', activeTenant)
      setObjects(res.data.objects || [])
      setSelectedKeys(new Set())
    } catch (err: any) {
      toast.error('Failed to list objects: ' + err.message)
    } finally { setLoading(false) }
  }

  const handleUpload = async (file: File) => {
    if (!selectedBucket) return toast.error('Select a bucket first')
    const toastId = toast.loading(`Uploading ${file.name}…`)
    try {
      await api.uploadObject(selectedBucket, file, undefined, activeTenant)
      toast.success('Upload complete', { id: toastId })
      loadObjects()
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message, { id: toastId })
    }
  }

  const handleDelete = async (key: string) => {
    if (!window.confirm(`Delete "${key}"?`)) return
    try {
      await api.deleteObject(selectedBucket, key, activeTenant)
      toast.success('Deleted')
      loadObjects()
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message)
    }
  }

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B'
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px 0' }}>Object Explorer</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>
            Browse, upload, and manage objects{activeTenant ? ` · tenant: ${activeTenant}` : ''}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {buckets.length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No buckets found</span>
          ) : (
            <select
              value={selectedBucket} onChange={e => setSelectedBucket(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13 }}
            >
              {buckets.map(b => <option key={b.Name} value={b.Name}>{b.Name}</option>)}
            </select>
          )}
          <button onClick={loadObjects} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--surface-hover)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <RefreshCw size={14} color="var(--text-muted)" />
          </button>
        </div>
      </div>

      {/* No buckets state */}
      {buckets.length === 0 && !loading && (
        <div style={{ background: '#F59E0B10', border: '1px solid #F59E0B40', borderRadius: 10, padding: '16px 20px', fontSize: 13, color: 'var(--text-muted)' }}>
          ⚠ No buckets found for tenant <strong>{activeTenant || '(default)'}</strong>. Go to <strong>Bucket Manager</strong> to create one first.
        </div>
      )}

      {/* Upload zone */}
      {selectedBucket && (
        <div
          onDragOver={e => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={e => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]) }}
          onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.onchange = (e: any) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]) }; i.click() }}
          style={{ border: `2px dashed ${dragActive ? '#ED2738' : 'var(--border-subtle)'}`, background: dragActive ? 'rgba(237,39,56,0.05)' : 'var(--surface-card)', borderRadius: 12, padding: 40, textAlign: 'center', transition: 'all 0.2s', cursor: 'pointer' }}
        >
          <UploadCloud size={40} color={dragActive ? '#ED2738' : 'var(--text-muted)'} style={{ margin: '0 auto 12px' }} />
          <h3 style={{ margin: '0 0 6px 0', fontSize: 15, color: dragActive ? '#ED2738' : 'var(--text-primary)' }}>Click or Drag & Drop to Upload</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>Upload to <strong>{selectedBucket}</strong></p>
        </div>
      )}

      {/* Object table */}
      {selectedBucket && (
        <div style={{ background: 'var(--surface-card)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-hover)', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 18px', width: 36 }}></th>
                <th style={{ padding: '12px 18px', fontWeight: 600 }}>Key</th>
                <th style={{ padding: '12px 18px', fontWeight: 600 }}>Size</th>
                <th style={{ padding: '12px 18px', fontWeight: 600 }}>Last Modified</th>
                <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</td></tr>
              ) : objects.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No objects found in <strong>{selectedBucket}</strong>. Upload a file to get started.</td></tr>
              ) : objects.map(o => (
                <tr key={o.Key} style={{ borderTop: '1px solid var(--border-subtle)', fontSize: 14 }}>
                  <td style={{ padding: '14px 18px' }}>
                    <input type="checkbox" checked={selectedKeys.has(o.Key)} onChange={e => {
                      const next = new Set(selectedKeys)
                      e.target.checked ? next.add(o.Key) : next.delete(o.Key)
                      setSelectedKeys(next)
                    }} />
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{o.Key}</td>
                  <td style={{ padding: '14px 18px', color: 'var(--text-muted)' }}>{formatSize(o.Size)}</td>
                  <td style={{ padding: '14px 18px', color: 'var(--text-muted)', fontSize: 13 }}>{new Date(o.LastModified).toLocaleString()}</td>
                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <a href={api.downloadObject(selectedBucket, o.Key, activeTenant)} download={o.Key}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                        <Download size={16} />
                      </a>
                      <button onClick={() => handleDelete(o.Key)} style={{ background: 'none', border: 'none', color: '#ED2738', cursor: 'pointer', padding: 4 }}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
