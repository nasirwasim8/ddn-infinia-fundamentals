import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../services/api'
import { Shield, ShieldAlert, CheckCircle, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'

export default function LegalHold() {
  const [buckets, setBuckets] = useState<any[]>([])
  const [selectedBucket, setSelectedBucket] = useState('')
  const [objectKey, setObjectKey] = useState('')
  const [holdStatus, setHoldStatus] = useState<boolean>(false)
  const [step, setStep] = useState(1)

  useEffect(() => {
    api.listBuckets().then(res => {
      setBuckets(res.buckets || [])
      if (res.buckets?.length > 0) setSelectedBucket(res.buckets[0].Name)
    })
  }, [])

  const checkHold = async () => {
    if (!objectKey) return
    try {
      const res = await api.getLegalHold(selectedBucket, objectKey)
      setHoldStatus(res.status === 'ON')
    } catch {
      setHoldStatus(false)
    }
  }

  const toggleHold = async (on: boolean) => {
    if (!objectKey) return toast.error('Enter an object key')
    try {
      await api.setLegalHold(selectedBucket, objectKey, on ? 'ON' : 'OFF')
      setHoldStatus(on)
      toast.success(`Legal Hold turned ${on ? 'ON' : 'OFF'}`)
      if (on) setStep(2)
      if (!on && step === 3) setStep(4)
    } catch (err: any) {
      toast.error('Failed: ' + err.message)
    }
  }

  const attemptDelete = async () => {
    if (!objectKey) return
    try {
      await api.deleteObject(selectedBucket, objectKey)
      if (holdStatus) {
        toast.error('Deleted successfully (Hold was not respected!)')
      } else {
        toast.success('Deleted successfully')
        setStep(1)
      }
    } catch (err: any) {
      if (holdStatus) {
        toast.success('Delete blocked by Legal Hold!', { icon: '🛡️' })
        setStep(3)
      } else {
        toast.error('Delete failed: ' + err.message)
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px 0' }}>Legal Hold</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>Apply indefinite WORM protection for litigation hold scenarios.</p>
      </div>

      <div style={{ display: 'flex', gap: '16px', background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
        <select value={selectedBucket} onChange={e => setSelectedBucket(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', width: 200 }}>
          {buckets.map(b => <option key={b.Name} value={b.Name}>{b.Name}</option>)}
        </select>
        <input value={objectKey} onChange={e => setObjectKey(e.target.value)} onBlur={checkHold} placeholder="Object Key" style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }} />
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        <div style={{ flex: 1, background: 'var(--surface-card)', padding: '32px', borderRadius: '12px', border: '1px solid var(--border-subtle)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <motion.div animate={{ scale: holdStatus ? [1, 1.1, 1] : 1, transition: { repeat: holdStatus ? Infinity : 0, duration: 2 } }}>
            {holdStatus ? <ShieldAlert size={80} color="#ED2738" /> : <Shield size={80} color="var(--text-muted)" />}
          </motion.div>
          <h2 style={{ fontSize: '24px', margin: '24px 0 8px 0', color: holdStatus ? '#ED2738' : 'var(--text-primary)' }}>
            {holdStatus ? 'ON HOLD' : 'NO HOLD'}
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            {holdStatus ? 'Object cannot be deleted or overwritten.' : 'Object is unprotected.'}
          </p>
        </div>

        <div style={{ flex: 1.5, background: 'var(--surface-card)', padding: '32px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <h3 style={{ margin: '0 0 24px 0', fontSize: '18px' }}>Demo Flow</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <DemoStep num={1} active={step >= 1} done={step > 1} title="Place Legal Hold" desc="Apply the lock" action={() => toggleHold(true)} btnText="Apply Hold" />
            <DemoStep num={2} active={step >= 2} done={step > 2} title="Attempt Delete" desc="Verify WORM protection" action={attemptDelete} btnText="Delete" danger />
            <DemoStep num={3} active={step >= 3} done={step > 3} title="Release Hold" desc="Remove the lock" action={() => toggleHold(false)} btnText="Release Hold" />
            <DemoStep num={4} active={step >= 4} done={false} title="Delete Object" desc="Cleanup" action={attemptDelete} btnText="Delete" danger />
          </div>
        </div>
      </div>
    </div>
  )
}

function DemoStep({ num, active, done, title, desc, action, btnText, danger }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', opacity: active ? 1 : 0.4 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: done ? '#00C280' : active ? '#ED2738' : 'var(--surface-hover)', color: done || active ? 'white' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
        {done ? <CheckCircle size={16} /> : num}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      <button 
        onClick={action} disabled={!active || done}
        style={{ padding: '8px 16px', borderRadius: '6px', background: danger ? 'rgba(237,39,56,0.1)' : 'var(--surface-hover)', border: `1px solid ${danger ? 'rgba(237,39,56,0.2)' : 'var(--border-subtle)'}`, color: danger ? '#ED2738' : 'var(--text-primary)', cursor: (!active || done) ? 'not-allowed' : 'pointer', fontWeight: 500 }}
      >
        {btnText}
      </button>
    </div>
  )
}
