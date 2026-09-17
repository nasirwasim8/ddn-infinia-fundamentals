import React, { useEffect, useState } from 'react'
import * as api from '../services/api'
import { Activity, HardDrive, Users, CheckCircle, XCircle } from 'lucide-react'

export default function SystemHealth() {
  const [health, setHealth] = useState<any>(null)
  const [usage, setUsage] = useState<any>(null)
  const [tenants, setTenants] = useState<any>(null)
  const [error, setError] = useState(false)

  const fetchData = async () => {
    try {
      const [h, u, t] = await Promise.all([
        api.getMgmtHealth(),
        api.getMgmtUsage(),
        api.getMgmtTenants()
      ])
      setHealth(h)
      setUsage(u)
      setTenants(t)
      setError(false)
    } catch (err) {
      console.error(err)
      setError(true)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px 0' }}>System Health</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Cluster status and resource usage.</p>
        </div>
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', padding: '32px', borderRadius: '12px', textAlign: 'center' }}>
          <XCircle size={48} color="#ED2738" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '18px', margin: '0 0 8px 0' }}>Management API Not Reachable</h2>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Check the Management Endpoint in Configuration.</p>
        </div>
      </div>
    )
  }

  if (!health) return <div style={{ color: 'var(--text-muted)' }}>Loading health data...</div>

  const isHealthy = health.status === 'OK'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px 0' }}>System Health</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>Cluster status and resource usage.</p>
      </div>

      <div style={{ 
        padding: '24px', borderRadius: '12px', 
        background: isHealthy ? 'rgba(0, 194, 128, 0.1)' : 'rgba(237, 39, 56, 0.1)',
        border: `1px solid ${isHealthy ? '#00C280' : '#ED2738'}`,
        display: 'flex', alignItems: 'center', gap: '16px'
      }}>
        {isHealthy ? <CheckCircle size={32} color="#00C280" /> : <XCircle size={32} color="#ED2738" />}
        <div>
          <h2 style={{ fontSize: '20px', margin: '0 0 4px 0', color: isHealthy ? '#00C280' : '#ED2738' }}>
            {isHealthy ? 'System Healthy' : 'System Degraded'}
          </h2>
          <p style={{ margin: 0, color: 'var(--text-primary)' }}>All management and storage services are operational.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <MetricCard title="Cluster State" value={health.status} icon={<Activity size={20} color="var(--text-muted)" />} />
        <MetricCard title="Storage Used" value={`${usage?.usedGB || 0} GB`} subvalue={`of ${usage?.totalGB || 0} GB`} icon={<HardDrive size={20} color="var(--text-muted)" />} />
        <MetricCard title="Total Tenants" value={tenants?.length || 0} icon={<Users size={20} color="var(--text-muted)" />} />
        <MetricCard title="API Status" value={health.api_reachable ? 'Online' : 'Offline'} icon={<Activity size={20} color="var(--text-muted)" />} />
      </div>

      <div style={{ background: 'var(--surface-card)', borderRadius: '12px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Tenants</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-hover)', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              <th style={{ padding: '12px 24px', fontWeight: 600 }}>Name</th>
              <th style={{ padding: '12px 24px', fontWeight: 600 }}>State</th>
            </tr>
          </thead>
          <tbody>
            {tenants?.map((t: any) => (
              <tr key={t.id} style={{ borderTop: '1px solid var(--border-subtle)', fontSize: '14px' }}>
                <td style={{ padding: '16px 24px' }}>{t.name}</td>
                <td style={{ padding: '16px 24px' }}>
                  <span style={{ 
                    padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 500,
                    background: t.state === 'active' ? 'rgba(0,194,128,0.1)' : 'var(--surface-hover)',
                    color: t.state === 'active' ? '#00C280' : 'var(--text-muted)'
                  }}>{t.state}</span>
                </td>
              </tr>
            ))}
            {(!tenants || tenants.length === 0) && (
              <tr><td colSpan={2} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No tenants found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MetricCard({ title, value, subvalue, icon }: any) {
  return (
    <div style={{ background: 'var(--surface-card)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: 500 }}>{title}</span>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
        {subvalue && <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{subvalue}</div>}
      </div>
    </div>
  )
}
