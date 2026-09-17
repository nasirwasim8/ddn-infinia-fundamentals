import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../services/api'
import { Lock, Shield, Zap, XCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function ObjectLock() {
  const [buckets, setBuckets] = useState<any[]>([])
  const [selectedBucket, setSelectedBucket] = useState('')
  const [mode, setMode] = useState('GOVERNANCE')
  const [days, setDays] = useState(30)
  
  const [objectKey, setObjectKey] = useState('')
  const [demoState, setDemoState] = useState<'idle' | 'testing' | 'blocked'>('idle')

  useEffect(() => {
    api.listBuckets().then(res => {
      setBuckets(res.buckets || [])
      if (res.buckets?.length > 0) setSelectedBucket(res.buckets[0].Name)
    }).catch(err => toast.error('Failed to load buckets'))
  }, [])

  const applyLockConfig = async () => {
    try {
      await api.setObjectLockConfig(selectedBucket, mode, days)
      toast.success(`Object Lock applied: ${mode} for ${days} days`)
    } catch (err: any) {
      toast.error('Failed to set Object Lock: ' + err.message)
    }
  }

  const handleRetain = async () => {
    if (!objectKey) return toast.error('Enter an object key')
    try {
      const date = new Date()
      date.setDate(date.getDate() + days)
      await api.setObjectRetention(selectedBucket, objectKey, mode, date.toISOString())
      toast.success(`Retention set until ${date.toLocaleDateString()}`)
    } catch (err: any) {
      toast.error('Failed to set retention: ' + err.message)
    }
  }

  const testDelete = async () => {
    if (!objectKey) return toast.error('Enter an object key')
    setDemoState('testing')
    
    // Simulate delete attempt animation
    setTimeout(async () => {
      try {
        await api.deleteObject(selectedBucket, objectKey)
        // If it actually deleted...
        toast.error('Object deleted! Was retention set?')
        setDemoState('idle')
      } catch (err: any) {
        // Expected to fail if locked
        setDemoState('blocked')
        toast.success('Delete blocked by WORM!', { icon: '🔒' })
        setTimeout(() => setDemoState('idle'), 4000)
      }
    }, 800)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px 0' }}>Object Lock & WORM</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Write-Once-Read-Many protection configuration and testing.</p>
        </div>
        <select 
          value={selectedBucket} onChange={e => setSelectedBucket(e.target.value)}
          style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--text-primary)' }}
        >
          {buckets.map(b => <option key={b.Name} value={b.Name}>{b.Name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        <div style={{ flex: 1, background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <h2 style={{ fontSize: '18px', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={20} color="#ED2738" /> Default Bucket Lock
          </h2>
          
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <div 
              onClick={() => setMode('GOVERNANCE')}
              style={{ flex: 1, padding: '16px', border: `2px solid ${mode === 'GOVERNANCE' ? '#ED2738' : 'var(--border-subtle)'}`, borderRadius: '8px', cursor: 'pointer', background: mode === 'GOVERNANCE' ? 'rgba(237,39,56,0.05)' : 'transparent' }}
            >
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>GOVERNANCE</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Users cannot overwrite/delete without specific permissions.</div>
            </div>
            <div 
              onClick={() => setMode('COMPLIANCE')}
              style={{ flex: 1, padding: '16px', border: `2px solid ${mode === 'COMPLIANCE' ? '#ED2738' : 'var(--border-subtle)'}`, borderRadius: '8px', cursor: 'pointer', background: mode === 'COMPLIANCE' ? 'rgba(237,39,56,0.05)' : 'transparent' }}
            >
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>COMPLIANCE</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Strict WORM. Nobody (even root) can overwrite/delete.</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Retention Period (Days)</label>
              <input type="number" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }} />
            </div>
            <button onClick={applyLockConfig} style={{ padding: '10px 24px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}>Apply Default</button>
          </div>
        </div>

        <div style={{ flex: 1, background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <h2 style={{ fontSize: '18px', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={20} color="#00C280" /> WORM Delete Test
          </h2>
          
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
            <input 
              value={objectKey} onChange={e => setObjectKey(e.target.value)} placeholder="Object Key"
              style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }} 
            />
            <button onClick={handleRetain} style={{ padding: '10px 16px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}>Set Retention</button>
          </div>

          <div style={{ 
            height: 200, background: 'var(--surface-primary)', borderRadius: '8px', 
            border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', 
            alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden'
          }}>
            <AnimatePresence mode="wait">
              {demoState === 'idle' && (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <button onClick={testDelete} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: '#ED2738', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontSize: '16px', fontWeight: 600 }}>
                    <Zap size={20} /> Attempt Delete
                  </button>
                </motion.div>
              )}
              {demoState === 'testing' && (
                <motion.div key="testing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div style={{ border: '4px solid rgba(237,39,56,0.25)', borderTopColor: '#ED2738', borderRadius: '50%', width: 40, height: 40, animation: 'spin 0.6s linear infinite' }} />
                </motion.div>
              )}
              {demoState === 'blocked' && (
                <motion.div key="blocked" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} style={{ textAlign: 'center' }}>
                  <XCircle size={48} color="#ED2738" style={{ margin: '0 auto 8px' }} />
                  <div style={{ color: '#ED2738', fontWeight: 600, fontSize: '18px' }}>DELETE BLOCKED</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Object Lock prevents deletion</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
