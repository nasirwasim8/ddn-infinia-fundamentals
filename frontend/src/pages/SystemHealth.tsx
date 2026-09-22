import { useState, useEffect } from 'react'
import { Activity, Server, Database, HardDrive, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import axios from 'axios'

const API = 'http://localhost:8003/api'

function fmt(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let v = bytes, u = 0
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++ }
  return `${v.toFixed(u >= 3 ? 1 : 0)} ${units[u]}`
}

function UsageBar({ pct }: { pct: number }) {
  const color = pct > 85 ? '#EF4444' : pct > 60 ? '#F59E0B' : '#10B981'
  return (
    <div style={{ background: 'var(--surface-hover)', borderRadius: 4, height: 6, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s' }} />
    </div>
  )
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {icon}
        <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

export default function SystemHealth() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await axios.get(`${API}/admin/infra/summary`)
      setData(r.data)
      setLastRefresh(new Date())
    } catch {
      setData({ api_reachable: false })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [])

  const stat = (label: string, value: React.ReactNode, sub?: string) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px 0' }}>System Health</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            Live cluster status, capacity, and tenant usage
            {lastRefresh && <span> — refreshed {lastRefresh.toLocaleTimeString()}</span>}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {loading && !data && (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading health data…</div>
      )}

      {data && !data.api_reachable && (
        <div style={{ background: '#EF444415', border: '1px solid #EF444440', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertCircle size={20} color="#EF4444" />
          <div>
            <div style={{ fontWeight: 600, color: '#EF4444' }}>Management API Unreachable</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Check Connection Settings and verify the Infinia server is online.</div>
          </div>
        </div>
      )}

      {data && data.api_reachable && (
        <>
          {/* Status bar */}
          <div style={{ background: '#10B98115', border: '1px solid #10B98140', borderRadius: 10, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle size={17} color="#10B981" />
            <span style={{ fontSize: 13, fontWeight: 500, color: '#10B981' }}>
              Management API Online — cluster <strong>{data.cluster}</strong> · Infinia {data.version} · host: {data.hostname}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Cluster & Node */}
            <Card title="Cluster & Node" icon={<Server size={16} color="#0EA5E9" />}>
              {stat('Cluster', data.cluster)}
              {stat('Infinia Version', data.version)}
              {stat('Host', data.hostname)}
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, marginTop: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Nodes</div>
                {(data.nodes || []).map((n: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.status === 'online' ? '#10B981' : '#F59E0B', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{n.hostname}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{n.ip}</span>
                    <span style={{ fontSize: 11, marginLeft: 'auto', color: n.status === 'online' ? '#10B981' : 'var(--text-muted)' }}>{n.status}</span>
                  </div>
                ))}
                {(data.nodes || []).length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No node data</div>}
              </div>
            </Card>

            {/* Overall Storage */}
            <Card title="Total Storage Capacity" icon={<HardDrive size={16} color="#8B5CF6" />}>
              {(() => {
                const used = data.total_used_bytes || 0
                const quota = data.total_quota_bytes || 0
                const pct = quota > 0 ? (used / quota) * 100 : 0
                return (
                  <>
                    <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{fmt(used)}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>used of {fmt(quota)} total</div>
                    <UsageBar pct={pct} />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>{pct.toFixed(2)}% utilised</div>
                    <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 14, paddingTop: 12 }}>
                      {stat('Available', fmt(quota - used))}
                      {stat('Tenants', `${(data.tenants || []).length} configured`)}
                    </div>
                  </>
                )
              })()}
            </Card>
          </div>

          {/* Per-tenant capacity */}
          {(data.tenants || []).length > 0 && (
            <Card title="Per-Tenant Storage Usage" icon={<Database size={16} color="#ED2738" />}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                {data.tenants.map((t: any) => (
                  <div key={t.name} style={{ background: 'var(--surface-hover)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.used_pct?.toFixed(2)}%</span>
                    </div>
                    <UsageBar pct={t.used_pct || 0} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                      <span>{fmt(t.used_bytes)} used</span>
                      <span>{fmt(t.quota_bytes)} quota</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Activity indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            <Activity size={12} />
            Auto-refreshes every 30 seconds
          </div>
        </>
      )}
    </div>
  )
}
