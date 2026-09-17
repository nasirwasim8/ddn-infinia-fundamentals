import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../services/api'
import { GitBranch, AlertTriangle, Download, Trash2 } from 'lucide-react'

export default function Versioning() {
  const [buckets, setBuckets] = useState<any[]>([])
  const [selectedBucket, setSelectedBucket] = useState('')
  const [status, setStatus] = useState<string>('Unknown')
  const [prefix, setPrefix] = useState('')
  const [versions, setVersions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.listBuckets().then(res => {
      setBuckets(res.buckets || [])
      if (res.buckets?.length > 0) setSelectedBucket(res.buckets[0].Name)
    }).catch(err => toast.error('Failed to load buckets'))
  }, [])

  useEffect(() => {
    if (selectedBucket) {
      api.getVersioning(selectedBucket).then(res => {
        setStatus(res.status || 'Suspended')
      }).catch(() => setStatus('Unknown'))
      loadVersions()
    }
  }, [selectedBucket])

  const toggleVersioning = async () => {
    const nextStatus = status === 'Enabled' ? 'Suspended' : 'Enabled'
    try {
      await api.setVersioning(selectedBucket, nextStatus)
      setStatus(nextStatus)
      toast.success(`Versioning ${nextStatus.toLowerCase()}`)
    } catch (err: any) {
      toast.error('Failed to update versioning: ' + err.message)
    }
  }

  const loadVersions = async () => {
    if (!selectedBucket) return
    setLoading(true)
    try {
      const res = await api.listObjectVersions(selectedBucket, prefix)
      const all = [...(res.versions || []), ...(res.deleteMarkers || [])].sort((a, b) => 
        new Date(b.LastModified).getTime() - new Date(a.LastModified).getTime()
      )
      setVersions(all)
    } catch (err: any) {
      toast.error('Failed to list versions: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (key: string, versionId: string) => {
    try {
      await api.deleteObject(selectedBucket, key, versionId)
      toast.success('Version deleted')
      loadVersions()
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px 0' }}>Versioning</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Manage bucket versioning and view object history.</p>
        </div>
        <select 
          value={selectedBucket} onChange={e => setSelectedBucket(e.target.value)}
          style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--text-primary)' }}
        >
          {buckets.map(b => <option key={b.Name} value={b.Name}>{b.Name}</option>)}
        </select>
      </div>

      <div style={{ background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', background: 'var(--surface-hover)', borderRadius: '8px' }}>
            <GitBranch size={24} color={status === 'Enabled' ? '#00C280' : 'var(--text-muted)'} />
          </div>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>Versioning Status</h3>
            <p style={{ margin: 0, color: status === 'Enabled' ? '#00C280' : 'var(--text-muted)', fontWeight: 500 }}>{status}</p>
          </div>
        </div>
        <button 
          onClick={toggleVersioning}
          style={{ padding: '8px 16px', background: status === 'Enabled' ? 'transparent' : '#ED2738', border: `1px solid ${status === 'Enabled' ? 'var(--border-subtle)' : '#ED2738'}`, borderRadius: '6px', color: status === 'Enabled' ? 'var(--text-primary)' : 'white', cursor: 'pointer', fontWeight: 500 }}
        >
          {status === 'Enabled' ? 'Suspend Versioning' : 'Enable Versioning'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <input 
          value={prefix} onChange={e => setPrefix(e.target.value)}
          placeholder="Filter by object prefix..."
          style={{ flex: 1, padding: '10px 16px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--text-primary)' }}
        />
        <button onClick={loadVersions} style={{ padding: '10px 24px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}>Search</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading ? <div style={{ color: 'var(--text-muted)' }}>Loading...</div> :
         versions.map((v, i) => {
          const isDeleteMarker = v.hasOwnProperty('IsLatest') && !v.hasOwnProperty('Size')
          return (
            <div key={v.VersionId + i} style={{ 
              background: isDeleteMarker ? 'rgba(237, 39, 56, 0.05)' : 'var(--surface-card)', 
              padding: '16px', borderRadius: '8px', border: `1px solid ${isDeleteMarker ? 'rgba(237, 39, 56, 0.2)' : 'var(--border-subtle)'}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {isDeleteMarker ? <AlertTriangle color="#ED2738" size={20} /> : <div style={{ width: 12, height: 12, borderRadius: '50%', background: v.IsLatest ? '#00C280' : 'var(--text-muted)' }} />}
                <div>
                  <div style={{ fontWeight: 500, fontSize: '15px' }}>{v.Key}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', display: 'flex', gap: '16px' }}>
                    <span>{new Date(v.LastModified).toLocaleString()}</span>
                    <span>ID: {v.VersionId === 'null' ? 'null' : v.VersionId?.substring(0, 8) + '...'}</span>
                    {!isDeleteMarker && <span>{v.Size} bytes</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {v.IsLatest && <span style={{ padding: '4px 8px', background: 'rgba(0,194,128,0.1)', color: '#00C280', fontSize: '12px', borderRadius: '4px', fontWeight: 600 }}>LATEST</span>}
                {isDeleteMarker && <span style={{ padding: '4px 8px', background: 'rgba(237,39,56,0.1)', color: '#ED2738', fontSize: '12px', borderRadius: '4px', fontWeight: 600 }}>DELETE MARKER</span>}
                <button onClick={() => handleDelete(v.Key, v.VersionId)} style={{ background: 'none', border: 'none', color: '#ED2738', cursor: 'pointer' }}><Trash2 size={18} /></button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
