import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../services/api'
import { Save, Trash2, Shield, Globe } from 'lucide-react'

export default function CorsPolicy() {
  const [buckets, setBuckets] = useState<any[]>([])
  const [selectedBucket, setSelectedBucket] = useState('')
  const [activeTab, setActiveTab] = useState<'cors' | 'policy'>('cors')
  
  const [policyJson, setPolicyJson] = useState('')
  
  const [corsRules, setCorsRules] = useState<any[]>([])
  const [newCors, setNewCors] = useState({ origins: '*', methods: ['GET'], headers: '*', maxAge: 3000 })

  useEffect(() => {
    api.listBuckets().then(res => {
      setBuckets(res.buckets || [])
      if (res.buckets?.length > 0) setSelectedBucket(res.buckets[0].Name)
    })
  }, [])

  useEffect(() => {
    if (selectedBucket) {
      if (activeTab === 'policy') loadPolicy()
      else loadCors()
    }
  }, [selectedBucket, activeTab])

  const loadPolicy = async () => {
    try {
      const res = await api.getBucketPolicy(selectedBucket)
      setPolicyJson(JSON.stringify(res.policy, null, 2))
    } catch {
      setPolicyJson('')
    }
  }

  const loadCors = async () => {
    try {
      const res = await api.getCors(selectedBucket)
      setCorsRules(res.rules || [])
    } catch {
      setCorsRules([])
    }
  }

  const savePolicy = async () => {
    try {
      const parsed = JSON.parse(policyJson)
      await api.setBucketPolicy(selectedBucket, parsed)
      toast.success('Policy saved')
    } catch (err: any) {
      toast.error('Invalid JSON or save failed: ' + err.message)
    }
  }

  const deletePolicy = async () => {
    try {
      await api.deleteBucketPolicy(selectedBucket)
      setPolicyJson('')
      toast.success('Policy deleted')
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message)
    }
  }

  const applyTemplate = (type: string) => {
    if (type === 'public') {
      setPolicyJson(JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Sid: "PublicRead", Effect: "Allow", Principal: "*", Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${selectedBucket}/*`] }]
      }, null, 2))
    } else if (type === 'deny') {
      setPolicyJson(JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Sid: "DenyAll", Effect: "Deny", Principal: "*", Action: "s3:*", Resource: [`arn:aws:s3:::${selectedBucket}`, `arn:aws:s3:::${selectedBucket}/*`] }]
      }, null, 2))
    }
  }

  const addCors = () => {
    const rule = {
      AllowedOrigins: newCors.origins.split(',').map(s=>s.trim()),
      AllowedMethods: newCors.methods,
      AllowedHeaders: newCors.headers.split(',').map(s=>s.trim()),
      MaxAgeSeconds: newCors.maxAge
    }
    setCorsRules([...corsRules, rule])
  }

  const saveCors = async () => {
    try {
      await api.setCors(selectedBucket, corsRules)
      toast.success('CORS saved')
    } catch (err: any) {
      toast.error('Failed to save CORS: ' + err.message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px 0' }}>CORS & Policy</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Manage cross-origin resource sharing and bucket access policies.</p>
        </div>
        <select value={selectedBucket} onChange={e => setSelectedBucket(e.target.value)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--text-primary)' }}>
          {buckets.map(b => <option key={b.Name} value={b.Name}>{b.Name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--border-subtle)' }}>
        <button onClick={() => setActiveTab('cors')} style={{ padding: '12px 24px', background: 'none', border: 'none', borderBottom: activeTab === 'cors' ? '2px solid #ED2738' : '2px solid transparent', color: activeTab === 'cors' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Globe size={18} /> CORS Configuration
        </button>
        <button onClick={() => setActiveTab('policy')} style={{ padding: '12px 24px', background: 'none', border: 'none', borderBottom: activeTab === 'policy' ? '2px solid #ED2738' : '2px solid transparent', color: activeTab === 'policy' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={18} /> Bucket Policy
        </button>
      </div>

      {activeTab === 'policy' && (
        <div style={{ background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <select onChange={e => applyTemplate(e.target.value)} defaultValue="" style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }}>
              <option value="" disabled>Select Template...</option>
              <option value="public">Public Read</option>
              <option value="deny">Deny All</option>
            </select>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={deletePolicy} style={{ padding: '8px 16px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: '#ED2738', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}><Trash2 size={16} /> Delete</button>
              <button onClick={savePolicy} style={{ padding: '8px 16px', background: '#ED2738', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}><Save size={16} /> Save Policy</button>
            </div>
          </div>
          <textarea 
            value={policyJson} onChange={e => setPolicyJson(e.target.value)}
            style={{ width: '100%', height: '400px', padding: '16px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '13px', resize: 'vertical' }}
            placeholder="{}"
          />
        </div>
      )}

      {activeTab === 'cors' && (
        <div style={{ display: 'flex', gap: '24px' }}>
          <div style={{ flex: 1, background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
            <h2 style={{ fontSize: '18px', margin: '0 0 16px 0' }}>Add CORS Rule</h2>
            
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Allowed Origins (comma separated)</label>
            <input value={newCors.origins} onChange={e => setNewCors({...newCors, origins: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', marginBottom: '16px' }} />

            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Allowed Methods</label>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              {['GET', 'PUT', 'POST', 'DELETE', 'HEAD'].map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={newCors.methods.includes(m)} onChange={e => {
                    const methods = e.target.checked ? [...newCors.methods, m] : newCors.methods.filter(x => x !== m)
                    setNewCors({...newCors, methods})
                  }} />
                  {m}
                </label>
              ))}
            </div>

            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Allowed Headers</label>
            <input value={newCors.headers} onChange={e => setNewCors({...newCors, headers: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', marginBottom: '16px' }} />

            <button onClick={addCors} style={{ width: '100%', padding: '10px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}>Add Rule</button>
          </div>

          <div style={{ flex: 1.5, background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', margin: 0 }}>Current Rules</h2>
              <button onClick={saveCors} style={{ padding: '8px 16px', background: '#ED2738', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', fontWeight: 500 }}>Save CORS Config</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {corsRules.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No CORS rules</div> : 
               corsRules.map((r, i) => (
                <div key={i} style={{ padding: '16px', background: 'var(--surface-primary)', borderRadius: '8px', border: '1px solid var(--border-subtle)', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 600 }}>Rule {i+1}</div>
                    <button onClick={() => setCorsRules(corsRules.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ED2738', cursor: 'pointer' }}><Trash2 size={16} /></button>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div><strong>Origins:</strong> {r.AllowedOrigins?.join(', ')}</div>
                    <div><strong>Methods:</strong> {r.AllowedMethods?.join(', ')}</div>
                    <div><strong>Headers:</strong> {r.AllowedHeaders?.join(', ')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
