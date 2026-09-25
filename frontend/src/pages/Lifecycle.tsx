import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import * as api from '../services/api'
import { Trash2, Plus, Clock } from 'lucide-react'

export default function Lifecycle({ activeTenant }: { activeTenant?: string | null }) {
  const [buckets, setBuckets] = useState<any[]>([])
  const [selectedBucket, setSelectedBucket] = useState('')
  const [rules, setRules] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const [newRule, setNewRule] = useState({ id: '', prefix: '', expireDays: 30, abortDays: 7, enabled: true })

  useEffect(() => {
    api.listBuckets(activeTenant ?? undefined).then(res => {
      const list = res.data?.buckets || []
      setBuckets(list)
      if (list.length > 0) setSelectedBucket(list[0].Name)
      else setSelectedBucket('')
    }).catch(() => setBuckets([]))
  }, [activeTenant])

  useEffect(() => {
    if (selectedBucket) loadRules()
  }, [selectedBucket])

  const loadRules = async () => {
    setLoading(true)
    try {
      const res = await api.getLifecycle(selectedBucket)
      setRules(res.rules || [])
    } catch {
      setRules([])
    } finally {
      setLoading(false)
    }
  }

  const addRule = () => {
    if (!newRule.id) return toast.error('Rule ID is required')
    
    const rule: any = {
      ID: newRule.id,
      Status: newRule.enabled ? 'Enabled' : 'Disabled',
      Filter: { Prefix: newRule.prefix }
    }
    if (newRule.expireDays > 0) rule.Expiration = { Days: newRule.expireDays }
    if (newRule.abortDays > 0) rule.AbortIncompleteMultipartUpload = { DaysAfterInitiation: newRule.abortDays }
    
    setRules([...rules, rule])
    setNewRule({ id: '', prefix: '', expireDays: 30, abortDays: 7, enabled: true })
  }

  const removeRule = (id: string) => setRules(rules.filter(r => r.ID !== id))

  const saveConfig = async () => {
    try {
      await api.setLifecycle(selectedBucket, rules)
      toast.success('Lifecycle rules applied')
      loadRules()
    } catch (err: any) {
      toast.error('Failed to apply rules: ' + err.message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px 0' }}>Lifecycle Rules</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Automate object deletion and cleanups.</p>
        </div>
        <select value={selectedBucket} onChange={e => setSelectedBucket(e.target.value)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', color: 'var(--text-primary)' }}>
          {buckets.map(b => <option key={b.Name} value={b.Name}>{b.Name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        <div style={{ flex: 1, background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <h2 style={{ fontSize: '18px', margin: '0 0 16px 0' }}>Add Rule</h2>
          
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Rule ID</label>
          <input value={newRule.id} onChange={e => setNewRule({...newRule, id: e.target.value})} placeholder="e.g. clean-tmp" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', marginBottom: '16px' }} />

          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Prefix Filter (Empty for all)</label>
          <input value={newRule.prefix} onChange={e => setNewRule({...newRule, prefix: e.target.value})} placeholder="tmp/" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', marginBottom: '16px' }} />

          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Expire Objects (Days)</label>
              <input type="number" value={newRule.expireDays} onChange={e => setNewRule({...newRule, expireDays: Number(e.target.value)})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Abort Multipart (Days)</label>
              <input type="number" value={newRule.abortDays} onChange={e => setNewRule({...newRule, abortDays: Number(e.target.value)})} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)' }} />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', cursor: 'pointer' }}>
            <input type="checkbox" checked={newRule.enabled} onChange={e => setNewRule({...newRule, enabled: e.target.checked})} />
            <span style={{ fontSize: '14px' }}>Rule Enabled</span>
          </label>

          <button onClick={addRule} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '10px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500 }}>
            <Plus size={18} /> Add to List
          </button>
        </div>

        <div style={{ flex: 1.5, background: 'var(--surface-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '18px', margin: '0 0 16px 0' }}>Current Rules</h2>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
            {rules.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No rules configured</div>
            ) : rules.map(r => (
              <div key={r.ID} style={{ padding: '16px', background: 'var(--surface-primary)', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {r.ID} 
                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: r.Status === 'Enabled' ? 'rgba(0,194,128,0.1)' : 'var(--surface-hover)', color: r.Status === 'Enabled' ? '#00C280' : 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                      {r.Status}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={14} /> 
                    {r.Filter?.Prefix ? `Prefix: ${r.Filter.Prefix}` : 'All objects'} 
                    {r.Expiration?.Days && ` • Expire: ${r.Expiration.Days}d`}
                    {r.AbortIncompleteMultipartUpload?.DaysAfterInitiation && ` • Abort: ${r.AbortIncompleteMultipartUpload.DaysAfterInitiation}d`}
                  </div>
                </div>
                <button onClick={() => removeRule(r.ID)} style={{ background: 'none', border: 'none', color: '#ED2738', cursor: 'pointer', padding: '4px' }}><Trash2 size={18} /></button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={saveConfig} style={{ padding: '10px 24px', background: '#ED2738', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', fontWeight: 500 }}>
              Apply Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
