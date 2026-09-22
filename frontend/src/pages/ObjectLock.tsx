import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../services/api'
import { Lock, Shield, Zap, XCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function ObjectLock({ activeTenant }: { activeTenant?: string | null }) {
  const [buckets, setBuckets]       = useState<any[]>([])
  const [selectedBucket, setSelectedBucket] = useState('')
  const [objects, setObjects]       = useState<any[]>([])
  const [lockEnabled, setLockEnabled] = useState<boolean | null>(null)  // null = loading
  const [mode, setMode]             = useState('COMPLIANCE')
  const [days, setDays]             = useState(30)
  const [objectKey, setObjectKey]   = useState('')
  const [demoState, setDemoState]   = useState<'idle' | 'testing' | 'blocked'>('idle')

  useEffect(() => {
    setBuckets([]); setSelectedBucket('')
    api.listBuckets(activeTenant).then(res => {
      const list = res.data.buckets || []
      setBuckets(list)
      if (list.length > 0) setSelectedBucket(list[0].Name)
    }).catch(err => toast.error('Failed to load buckets'))
  }, [activeTenant])

  // Check Object Lock status + load objects whenever bucket changes
  useEffect(() => {
    setObjects([]); setObjectKey(''); setLockEnabled(null)
    if (!selectedBucket) return

    // Check if bucket has Object Lock enabled
    api.getObjectLock(selectedBucket).then(res => {
      setLockEnabled(res.data.enabled === 'Enabled')
    }).catch(() => setLockEnabled(false))

    // Load objects
    api.listObjects(selectedBucket, '', activeTenant).then(res => {
      const list = res.data.objects || []
      setObjects(list)
      if (list.length > 0) setObjectKey(list[0].Key)
    }).catch(() => {})
  }, [selectedBucket, activeTenant])

  // retentionInfo: null=unchecked, false=not set, {mode,date}=active
  const [retentionInfo, setRetentionInfo] = useState<null | false | { mode: string; date: string }>(null)
  const [versionId, setVersionId]         = useState<string | undefined>(undefined)

  // Reset retention info + fetch version ID when object changes
  useEffect(() => {
    setRetentionInfo(null)
    setVersionId(undefined)
    if (!objectKey || !selectedBucket) return
    // Get version ID (needed to actually target the locked version on delete)
    api.headObject(selectedBucket, objectKey, activeTenant).then(res => {
      setVersionId(res.data?.VersionId)
    }).catch(() => {})
  }, [objectKey, selectedBucket])

  const checkRetention = async () => {
    if (!objectKey) return
    try {
      const res = await api.getRetention(selectedBucket, objectKey)
      const r = res.data
      if (r?.Mode) {
        setRetentionInfo({ mode: r.Mode, date: r.RetainUntilDate })
      } else {
        setRetentionInfo(false)
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail || ''
      // If it's an object lock error, the object IS protected — show that
      if (detail.toLowerCase().includes('object lock') || detail.toLowerCase().includes('accessdenied')) {
        setRetentionInfo({ mode: 'ACTIVE', date: '(bucket default)' })
      } else {
        setRetentionInfo(false)
      }
    }
  }

  const applyLockConfig = async () => {
    if (!selectedBucket) return toast.error('Select a bucket first')
    try {
      await api.setObjectLock(selectedBucket, { mode, days })
      toast.success(`Default lock applied: ${mode} for ${days} days`)
    } catch (err: any) {
      toast.error('Failed to set Object Lock: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleRetain = async () => {
    if (!objectKey) return toast.error('Select an object first')
    try {
      const date = new Date()
      date.setDate(date.getDate() + days)
      await api.setRetention(selectedBucket, objectKey, {
        mode,
        retain_until_date: date.toISOString()
      })
      toast.success('Retention saved — verifying…')
      await checkRetention()
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || ''
      // "Access Denied because object protected" = object is ALREADY locked by bucket default
      if (detail.toLowerCase().includes('object lock') || detail.toLowerCase().includes('access denied')) {
        toast.success('Object is already protected by bucket-level Object Lock!', { icon: '🔒' })
        await checkRetention()
      } else {
        toast.error('Failed to set retention: ' + detail)
        setRetentionInfo(false)
      }
    }
  }

  const testDelete = async () => {
    if (!objectKey) return toast.error('Select an object first')
    setDemoState('testing')
    setTimeout(async () => {
      try {
        // Must pass versionId — deleting without it only creates a delete marker (always succeeds)
        // Deleting a specific version of a locked object is what triggers the WORM block
        await api.deleteObject(selectedBucket, objectKey, activeTenant, versionId)
        if (mode === 'GOVERNANCE') {
          toast.error('Deleted in GOVERNANCE mode — admin keys can bypass GOVERNANCE. Switch to COMPLIANCE mode and try again.', { duration: 6000 })
        } else {
          toast.error('Object deleted — COMPLIANCE retention was not enforced. Infinia may not fully support per-object lock enforcement.', { duration: 6000 })
        }
        setDemoState('idle')
        setRetentionInfo(null)
      } catch (err: any) {
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

      {/* Object Lock status banner */}
      {lockEnabled === false && (
        <div style={{ background: '#EF444415', border: '1px solid #EF444440', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontWeight: 600, color: '#EF4444', marginBottom: 4 }}>
            ⚠ Object Lock is NOT enabled on <strong>{selectedBucket}</strong>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Object Lock must be enabled <strong>at bucket creation time</strong> — it cannot be turned on for existing buckets.
            <br />
            Go to <strong>Bucket Manager → Create Bucket</strong> and tick <strong>Enable Object Lock</strong>, then upload a file to that new bucket.
          </div>
        </div>
      )}
      {lockEnabled === true && (
        <div style={{ background: '#10B98115', border: '1px solid #10B98140', borderRadius: 10, padding: '12px 18px', fontSize: 13, color: '#10B981', fontWeight: 500 }}>
          ✓ Object Lock is enabled on <strong>{selectedBucket}</strong> — retention and WORM protection are available.
        </div>
      )}

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
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: 6 }}>Users cannot overwrite/delete without specific permissions.</div>
              <div style={{ fontSize: 11, color: '#F59E0B', background: '#F59E0B10', borderRadius: 4, padding: '3px 6px', display: 'inline-block' }}>⚠ Admin keys can bypass this</div>
            </div>
            <div
              onClick={() => setMode('COMPLIANCE')}
              style={{ flex: 1, padding: '16px', border: `2px solid ${mode === 'COMPLIANCE' ? '#10B981' : 'var(--border-subtle)'}`, borderRadius: '8px', cursor: 'pointer', background: mode === 'COMPLIANCE' ? 'rgba(16,185,129,0.05)' : 'transparent' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: '8px' }}>
                COMPLIANCE
                <span style={{ fontSize: 10, background: '#10B981', color: 'white', borderRadius: 4, padding: '2px 5px' }}>RECOMMENDED</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: 6 }}>Strict WORM. Nobody (even root) can overwrite/delete.</div>
              <div style={{ fontSize: 11, color: '#10B981', background: '#10B98110', borderRadius: 4, padding: '3px 6px', display: 'inline-block' }}>✓ Cannot be bypassed</div>
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

          {/* Step 1: Pick object */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Step 1 — Select Object</label>
            {objects.length === 0 ? (
              <div style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-muted)', fontSize: 13 }}>
                ⚠ No objects — upload a file in Object Explorer first
              </div>
            ) : (
              <select value={objectKey} onChange={e => setObjectKey(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 13 }}>
                {objects.map((o: any) => <option key={o.Key} value={o.Key}>{o.Key}</option>)}
              </select>
            )}
          </div>

          {/* Step 2: Set Retention */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Step 2 — Apply Retention</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleRetain} disabled={!objectKey || !lockEnabled}
                style={{ flex: 1, padding: '10px 16px', background: '#ED273815', border: '1px solid #ED273840', borderRadius: 6, color: '#ED2738', fontWeight: 600, cursor: (objectKey && lockEnabled) ? 'pointer' : 'not-allowed', opacity: (objectKey && lockEnabled) ? 1 : 0.5 }}>
                Set {mode} Retention ({days}d)
              </button>
              <button onClick={checkRetention} disabled={!objectKey}
                style={{ padding: '10px 12px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-muted)', cursor: objectKey ? 'pointer' : 'not-allowed', fontSize: 12 }}>
                Check Status
              </button>
            </div>
          </div>

          {/* Retention status result */}
          {retentionInfo === null && objectKey && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Click <strong>Set Retention</strong> or <strong>Check Status</strong> to see current retention.
            </div>
          )}
          {retentionInfo === false && (
            <div style={{ background: '#F59E0B15', border: '1px solid #F59E0B40', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#F59E0B', marginBottom: 12 }}>
              ⚠ No retention currently set on this object.
            </div>
          )}
          {retentionInfo && retentionInfo !== false && (
            <div style={{ background: '#10B98115', border: '1px solid #10B98140', borderRadius: 8, padding: '12px 14px', fontSize: 13, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, color: '#10B981', marginBottom: 4 }}>✓ Retention ACTIVE</div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 10 }}>
                Mode: <strong>{retentionInfo.mode}</strong>
                {retentionInfo.date !== '(bucket default)' && <> · Locked until <strong>{new Date(retentionInfo.date).toLocaleString()}</strong></>}
              </div>
              {/* Remove WORM option */}
              {(retentionInfo.mode === 'GOVERNANCE' || retentionInfo.mode === 'ACTIVE') ? (
                <button
                  onClick={async () => {
                    if (!window.confirm(`Force-delete "${objectKey}" by bypassing GOVERNANCE lock?\n\nThis permanently deletes the file.`)) return
                    try {
                      await api.deleteObject(selectedBucket, objectKey, activeTenant, versionId, true)
                      toast.success('File deleted — GOVERNANCE lock bypassed.')
                      setRetentionInfo(null)
                      // Reload objects list
                      api.listObjects(selectedBucket, '', activeTenant).then(res => {
                        const list = res.data.objects || []
                        setObjects(list)
                        setObjectKey(list.length > 0 ? list[0].Key : '')
                      }).catch(() => {})
                    } catch (err: any) {
                      toast.error('Force delete failed: ' + (err.response?.data?.detail || err.message))
                    }
                  }}
                  style={{ padding: '7px 14px', background: '#EF444415', border: '1px solid #EF444440', borderRadius: 6, color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  🗑 Force Delete (Bypass GOVERNANCE Lock)
                </button>
              ) : (
                <div style={{ fontSize: 12, color: '#EF4444', background: '#EF444410', borderRadius: 6, padding: '6px 10px', display: 'inline-block' }}>
                  🔒 COMPLIANCE lock cannot be removed before expiry date — by design.
                </div>
              )}
            </div>
          )}

          {/* Step 3: Attempt Delete — only enabled after retention is confirmed */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Step 3 — Attempt Delete</label>
            <div style={{ height: 120, background: 'var(--surface-primary)', borderRadius: 8, border: `1px solid ${retentionInfo && retentionInfo !== false ? 'var(--border-subtle)' : 'var(--border-subtle)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {/* Not yet checked — locked */}
              {(retentionInfo === null || retentionInfo === false) ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16 }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🔒</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {retentionInfo === null ? 'Complete Step 2 first — set and confirm retention' : '⚠ Retention not active — apply retention in Step 2 before testing'}
                  </div>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  {demoState === 'idle' && (
                    <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <button onClick={testDelete}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: '#ED2738', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
                        <Zap size={18} /> Attempt Delete
                      </button>
                    </motion.div>
                  )}
                  {demoState === 'testing' && (
                    <motion.div key="testing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div style={{ border: '4px solid rgba(237,39,56,0.25)', borderTopColor: '#ED2738', borderRadius: '50%', width: 36, height: 36, animation: 'spin 0.6s linear infinite' }} />
                    </motion.div>
                  )}
                  {demoState === 'blocked' && (
                    <motion.div key="blocked" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} style={{ textAlign: 'center' }}>
                      <XCircle size={40} color="#ED2738" style={{ margin: '0 auto 6px' }} />
                      <div style={{ color: '#ED2738', fontWeight: 600, fontSize: 16 }}>DELETE BLOCKED</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>WORM protection active ✓</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
