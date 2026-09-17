import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { RefreshCw, Server, HardDrive, Network, Wifi } from 'lucide-react'
import { getInfraNodes, getInfraDrives, getInfraNetworks, getInfraHSN, getInfraVersion } from '../../services/adminApi'

type TabId = 'nodes' | 'drives' | 'networks' | 'hsn'

function Badge({ label, color }: { label: string; color: string }) {
  return <span style={{ background: `${color}20`, color, padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 500 }}>{label}</span>
}

export default function Infrastructure() {
  const [tab, setTab] = useState<TabId>('nodes')
  const [data, setData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [version, setVersion] = useState<any>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const loadTab = useCallback(async (t: TabId) => {
    setLoading(l => ({ ...l, [t]: true }))
    try {
      let res: any
      if (t === 'nodes') res = (await getInfraNodes()).data
      else if (t === 'drives') res = (await getInfraDrives()).data
      else if (t === 'networks') res = (await getInfraNetworks()).data
      else if (t === 'hsn') res = (await getInfraHSN()).data
      setData(d => ({ ...d, [t]: res }))
    } catch { toast.error(`Failed to load ${t}`) }
    finally { setLoading(l => ({ ...l, [t]: false })) }
  }, [])

  const loadVersion = async () => {
    try { const r = await getInfraVersion(); setVersion(r.data) } catch {}
  }

  useEffect(() => { loadTab(tab); loadVersion() }, [tab])
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => loadTab(tab), 30000)
    return () => clearInterval(id)
  }, [autoRefresh, tab, loadTab])

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'nodes', label: 'Nodes', icon: Server },
    { id: 'drives', label: 'Drives', icon: HardDrive },
    { id: 'networks', label: 'Networks', icon: Network },
    { id: 'hsn', label: 'HSN IPs', icon: Wifi },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px 0' }}>Infrastructure</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Nodes, drives, networks, and HSN endpoints</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-refresh (30s)
          </label>
          <button onClick={() => loadTab(tab)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid #ED2738' : '2px solid transparent', color: tab === t.id ? '#ED2738' : 'var(--text-muted)', cursor: 'pointer', fontSize: 14, fontWeight: tab === t.id ? 600 : 400 }}>
            <t.icon size={15} />  {t.label}
          </button>
        ))}
      </div>

      {loading[tab] ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Loading {tab}…</div>
      ) : (
        <>
          {/* Nodes */}
          {tab === 'nodes' && (
            <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'var(--surface-hover)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  {['Hostname', 'Control Plane IP', 'Status'].map(h => <th key={h} style={{ padding: '10px 18px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                </tr></thead>
                <tbody>{(data.nodes?.nodes || []).map((n: any, i: number) => (
                  <tr key={n.id} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none', fontSize: 13 }}>
                    <td style={{ padding: '13px 18px', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{n.hostname}</td>
                    <td style={{ padding: '13px 18px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{n.ctrl_plane_ip || '—'}</td>
                    <td style={{ padding: '13px 18px' }}><Badge label={n.status || 'online'} color="#00C280" /></td>
                  </tr>
                ))}</tbody>
              </table>
              {!data.nodes?.nodes?.length && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No nodes data</div>}
            </div>
          )}

          {/* Drives */}
          {tab === 'drives' && data.drives && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{data.drives.summary?.total || 0}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total Drives</div>
                </div>
                <div style={{ background: 'var(--surface-card)', border: '1px solid #00C28030', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#00C280' }}>{data.drives.summary?.by_status?.['1'] || 0}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Healthy</div>
                </div>
                <div style={{ background: 'var(--surface-card)', border: '1px solid #ED273830', borderRadius: 12, padding: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#ED2738' }}>
                    {(data.drives.summary?.total || 0) - (data.drives.summary?.by_status?.['1'] || 0)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Issues</div>
                </div>
              </div>
              <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: 'var(--surface-hover)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {['Node', 'Drive', 'Model', 'Size', 'Type', 'Firmware', 'Status'].map(h => <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{(data.drives.drives || []).map((d: any, i: number) => (
                    <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none', fontSize: 12 }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)' }}>{d.node}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{d.name}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{d.model}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{d.size}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{d.type}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{d.fw_version}</td>
                      <td style={{ padding: '10px 14px' }}><Badge label={d.healthy ? 'OK' : 'Issue'} color={d.healthy ? '#00C280' : '#EF4444'} /></td>
                    </tr>
                  ))}</tbody>
                </table>
                {!data.drives?.drives?.length && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No drive data</div>}
              </div>
            </div>
          )}

          {/* Networks */}
          {tab === 'networks' && (
            <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'var(--surface-hover)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  {['Hostname', 'Interface', 'Type', 'IPv4 CIDR', 'Speed (Mbps)'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                </tr></thead>
                <tbody>{(data.networks?.interfaces || []).map((n: any, i: number) => (
                  <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none', fontSize: 13 }}>
                    <td style={{ padding: '11px 16px', fontFamily: 'var(--font-mono)' }}>{n.hostname}</td>
                    <td style={{ padding: '11px 16px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{n.interface}</td>
                    <td style={{ padding: '11px 16px' }}><Badge label={n.nettype || 'unknown'} color="#6366F1" /></td>
                    <td style={{ padding: '11px 16px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{n.ipv4_cidr || '—'}</td>
                    <td style={{ padding: '11px 16px', fontWeight: 500 }}>{n.speed_mbps?.toLocaleString()}</td>
                  </tr>
                ))}</tbody>
              </table>
              {!data.networks?.interfaces?.length && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No network data</div>}
            </div>
          )}

          {/* HSN */}
          {tab === 'hsn' && (
            <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'var(--surface-hover)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  {['Hostname', 'Interface', 'IP', 'Speed (Mbps)'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                </tr></thead>
                <tbody>{(data.hsn?.hsn_ips || []).map((h: any, i: number) => (
                  <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none', fontSize: 13 }}>
                    <td style={{ padding: '11px 16px', fontFamily: 'var(--font-mono)' }}>{h.hostname}</td>
                    <td style={{ padding: '11px 16px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{h.interface}</td>
                    <td style={{ padding: '11px 16px', fontFamily: 'var(--font-mono)' }}>{h.ip}</td>
                    <td style={{ padding: '11px 16px', fontWeight: 500 }}>{h.speed_mbps?.toLocaleString()}</td>
                  </tr>
                ))}</tbody>
              </table>
              {!data.hsn?.hsn_ips?.length && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No HSN data found</div>}
            </div>
          )}
        </>
      )}

      {/* Version */}
      {version && (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 18px', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Version: {typeof version === 'object' ? JSON.stringify(version) : version}
        </div>
      )}
    </div>
  )
}
