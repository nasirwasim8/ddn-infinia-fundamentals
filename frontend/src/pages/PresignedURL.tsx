import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../services/api'
import { Link, Copy, ExternalLink, Clock } from 'lucide-react'

export default function PresignedURL() {
  const [buckets, setBuckets] = useState<any[]>([])
  const [selectedBucket, setSelectedBucket] = useState('')
  const [objectKey, setObjectKey] = useState('')
  const [method, setMethod] = useState<'GET' | 'PUT'>('GET')
  const [expiry, setExpiry] = useState(3600)
  
  const [url, setUrl] = useState('')
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    api.listBuckets().then(res => {
      setBuckets(res.buckets || [])
      if (res.buckets?.length > 0) setSelectedBucket(res.buckets[0].Name)
    })
  }, [])

  useEffect(() => {
    if (!url) return
    const interval = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [url])

  const generate = async () => {
    if (!objectKey) return toast.error('Object Key required')
    try {
      const res = await api.generatePresignedUrl(selectedBucket, objectKey, method, expiry)
      setUrl(res.url)
      setTimeLeft(expiry)
      toast.success('URL Generated')
    } catch (err: any) {
      toast.error('Failed to generate URL: ' + err.message)
    }
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h > 0 ? h + 'h ' : ''}${m}m ${s}s`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px 0' }}>Presigned URLs</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>Generate temporary access URLs for sharing or uploading.</p>
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        <div style={{ flex: 1, background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', marginBottom: '24px' }}>
            <button onClick={() => setMethod('GET')} style={{ flex: 1, padding: '12px', background: 'none', border: 'none', borderBottom: method === 'GET' ? '2px solid #ED2738' : '2px solid transparent', color: method === 'GET' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Download (GET)</button>
            <button onClick={() => setMethod('PUT')} style={{ flex: 1, padding: '12px', background: 'none', border: 'none', borderBottom: method === 'PUT' ? '2px solid #ED2738' : '2px solid transparent', color: method === 'PUT' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Upload (PUT)</button>
          </div>

          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Bucket</label>
          <select value={selectedBucket} onChange={e => setSelectedBucket(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', marginBottom: '16px' }}>
            {buckets.map(b => <option key={b.Name} value={b.Name}>{b.Name}</option>)}
          </select>

          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Object Key</label>
          <input value={objectKey} onChange={e => setObjectKey(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', marginBottom: '16px' }} />

          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Expiry Time</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            {[60, 300, 3600, 86400].map(val => (
              <button 
                key={val} onClick={() => setExpiry(val)}
                style={{ flex: 1, padding: '8px', background: expiry === val ? 'rgba(237,39,56,0.1)' : 'var(--surface-hover)', border: `1px solid ${expiry === val ? '#ED2738' : 'var(--border-subtle)'}`, color: expiry === val ? '#ED2738' : 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer' }}
              >
                {val < 3600 ? `${val/60}m` : val === 3600 ? '1h' : '24h'}
              </button>
            ))}
          </div>

          <button onClick={generate} style={{ width: '100%', padding: '12px', background: '#ED2738', border: 'none', borderRadius: '6px', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
            Generate URL
          </button>
        </div>

        {url && (
          <div style={{ flex: 1, background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Result URL</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: timeLeft < 60 ? '#ED2738' : '#00C280', fontWeight: 600, fontSize: '14px' }}>
                <Clock size={16} /> {formatTime(timeLeft)}
              </div>
            </div>

            <textarea 
              readOnly value={url}
              style={{ width: '100%', height: '120px', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '12px', marginBottom: '16px', resize: 'none' }}
            />

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => { navigator.clipboard.writeText(url); toast.success('Copied') }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <Copy size={16} /> Copy URL
              </button>
              {method === 'GET' && (
                <button onClick={() => window.open(url, '_blank')} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <ExternalLink size={16} /> Open
                </button>
              )}
            </div>

            {method === 'PUT' && (
              <div style={{ marginTop: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)' }}>cURL Example</label>
                <div style={{ padding: '12px', borderRadius: '6px', background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                  curl -X PUT -T file.txt "{url.substring(0, 50)}..."
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
