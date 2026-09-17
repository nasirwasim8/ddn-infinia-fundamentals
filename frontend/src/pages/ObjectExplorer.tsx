import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../services/api'
import { Download, Trash2, Info, UploadCloud } from 'lucide-react'

export default function ObjectExplorer() {
  const [buckets, setBuckets] = useState<any[]>([])
  const [selectedBucket, setSelectedBucket] = useState('')
  const [objects, setObjects] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.listBuckets().then(res => {
      setBuckets(res.buckets || [])
      if (res.buckets?.length > 0) {
        setSelectedBucket(res.buckets[0].Name)
      }
    }).catch(err => toast.error('Failed to load buckets'))
  }, [])

  useEffect(() => {
    if (selectedBucket) loadObjects()
  }, [selectedBucket])

  const loadObjects = async () => {
    setLoading(true)
    try {
      const res = await api.listObjects(selectedBucket)
      setObjects(res.objects || [])
      setSelectedKeys(new Set())
    } catch (err: any) {
      toast.error('Failed to list objects: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (file: File) => {
    if (!selectedBucket) return
    const toastId = toast.loading(`Uploading ${file.name}...`)
    try {
      const buffer = await file.arrayBuffer()
      const blob = new Blob([buffer])
      await api.putObject(selectedBucket, file.name, blob as any)
      toast.success('Upload complete', { id: toastId })
      loadObjects()
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message, { id: toastId })
    }
  }

  const handleDelete = async (key: string) => {
    if (!window.confirm(`Delete ${key}?`)) return
    try {
      await api.deleteObject(selectedBucket, key)
      toast.success('Deleted')
      loadObjects()
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px 0' }}>Object Explorer</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Browse, upload, and manage objects.</p>
        </div>
        <select 
          value={selectedBucket} onChange={e => setSelectedBucket(e.target.value)}
          style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--text-primary)' }}
        >
          {buckets.map(b => <option key={b.Name} value={b.Name}>{b.Name}</option>)}
        </select>
      </div>

      <div 
        onDragOver={e => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={e => {
          e.preventDefault()
          setDragActive(false)
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleUpload(e.dataTransfer.files[0])
          }
        }}
        style={{
          border: `2px dashed ${dragActive ? '#ED2738' : 'var(--border-subtle)'}`,
          background: dragActive ? 'rgba(237, 39, 56, 0.05)' : 'var(--surface-card)',
          borderRadius: '12px', padding: '48px', textAlign: 'center', transition: 'all 0.2s', cursor: 'pointer'
        }}
        onClick={() => {
          const input = document.createElement('input')
          input.type = 'file'
          input.onchange = (e: any) => {
            if (e.target.files && e.target.files[0]) handleUpload(e.target.files[0])
          }
          input.click()
        }}
      >
        <UploadCloud size={48} color={dragActive ? '#ED2738' : 'var(--text-muted)'} style={{ margin: '0 auto 16px' }} />
        <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: dragActive ? '#ED2738' : 'var(--text-primary)' }}>Click or Drag & Drop to Upload</h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>Upload to {selectedBucket || 'bucket'}</p>
      </div>

      <div style={{ background: 'var(--surface-card)', borderRadius: '12px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-hover)', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              <th style={{ padding: '12px 24px', width: 40 }}></th>
              <th style={{ padding: '12px 24px', fontWeight: 600 }}>Key</th>
              <th style={{ padding: '12px 24px', fontWeight: 600 }}>Size</th>
              <th style={{ padding: '12px 24px', fontWeight: 600 }}>Last Modified</th>
              <th style={{ padding: '12px 24px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td></tr>
            ) : objects.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No objects found in this bucket.</td></tr>
            ) : objects.map(o => (
              <tr key={o.Key} style={{ borderTop: '1px solid var(--border-subtle)', fontSize: '14px' }}>
                <td style={{ padding: '16px 24px' }}>
                  <input type="checkbox" checked={selectedKeys.has(o.Key)} onChange={e => {
                    const next = new Set(selectedKeys)
                    if (e.target.checked) next.add(o.Key)
                    else next.delete(o.Key)
                    setSelectedKeys(next)
                  }} />
                </td>
                <td style={{ padding: '16px 24px', fontWeight: 500 }}>{o.Key}</td>
                <td style={{ padding: '16px 24px', color: 'var(--text-muted)' }}>{formatSize(o.Size)}</td>
                <td style={{ padding: '16px 24px', color: 'var(--text-muted)' }}>{new Date(o.LastModified).toLocaleString()}</td>
                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}><Download size={18} /></button>
                    <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}><Info size={18} /></button>
                    <button onClick={() => handleDelete(o.Key)} style={{ background: 'none', border: 'none', color: '#ED2738', cursor: 'pointer', padding: '4px' }}><Trash2 size={18} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
