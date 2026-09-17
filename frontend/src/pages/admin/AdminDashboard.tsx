import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Server, Users, Key, Database, Wand2, FileUp, Trash2, RefreshCw, CheckCircle, AlertCircle, Building2 } from 'lucide-react'
import { adminLogin, adminStatus, getInfraClusters, getInfraNodes, getInfraVersion, listTenants, listUsers } from '../../services/adminApi'

interface AuthState { authenticated: boolean; username?: string; server?: string }

function StatCard({ icon: Icon, label, value, color = '#ED2738' }: any) {
  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={22} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{value ?? '—'}</div>
      </div>
    </div>
  )
}

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [server, setServer] = useState('192.168.147.129')
  const [username, setUsername] = useState('realm_admin')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const doLogin = async () => {
    if (!password) return toast.error('Enter password')
    setLoading(true)
    try {
      await adminLogin(username, password, server)
      localStorage.setItem('infinia-admin-auth', JSON.stringify({ authenticated: true, username, server }))
      toast.success(`Logged in as ${username}`)
      onLogin()
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 440, margin: '60px auto', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#ED273815', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Server size={20} color="#ED2738" />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Management API Login</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Connect to Infinia Management Plane</p>
        </div>
      </div>
      {[
        { label: 'Server IP', value: server, set: setServer, placeholder: '192.168.147.129' },
        { label: 'Username', value: username, set: setUsername, placeholder: 'realm_admin' },
        { label: 'Password', value: password, set: setPassword, placeholder: '••••••••', type: 'password' },
      ].map(f => (
        <div key={f.label} style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{f.label}</label>
          <input type={f.type || 'text'} value={f.value} onChange={e => f.set(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doLogin()}
            placeholder={f.placeholder}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' }} />
        </div>
      ))}
      <button onClick={doLogin} disabled={loading}
        style={{ width: '100%', padding: '12px', background: '#ED2738', border: 'none', borderRadius: 8, color: 'white', fontWeight: 600, fontSize: 15, cursor: 'pointer', marginTop: 8, opacity: loading ? 0.7 : 1 }}>
        {loading ? 'Connecting…' : 'Login to Management API'}
      </button>
    </div>
  )
}

export default function AdminDashboard({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [auth, setAuth] = useState<AuthState>({ authenticated: false })
  const [stats, setStats] = useState<any>({})
  const [loading, setLoading] = useState(true)

  const checkAuth = async () => {
    try {
      const res = await adminStatus()
      setAuth(res.data)
      if (res.data.authenticated) loadStats()
      else setLoading(false)
    } catch { setAuth({ authenticated: false }); setLoading(false) }
  }

  const loadStats = async () => {
    setLoading(true)
    try {
      const [clusters, nodes, tenants, users, version] = await Promise.allSettled([
        getInfraClusters(), getInfraNodes(), listTenants(), listUsers(), getInfraVersion()
      ])
      setStats({
        clusters: clusters.status === 'fulfilled' ? clusters.value.data.clusters?.length : 0,
        nodes:    nodes.status === 'fulfilled' ? nodes.value.data.count : 0,
        tenants:  tenants.status === 'fulfilled' ? tenants.value.data.tenants?.length : 0,
        users:    users.status === 'fulfilled' ? users.value.data.users?.length : 0,
        version:  version.status === 'fulfilled' ? version.value.data : null,
      })
    } catch (e: any) { toast.error('Failed to load stats') }
    finally { setLoading(false) }
  }

  useEffect(() => { checkAuth() }, [])

  if (!auth.authenticated) return <LoginForm onLogin={checkAuth} />

  const quickActions = [
    { label: 'Provision Tenant', icon: Wand2, tab: 'admin-wizard', color: '#ED2738', desc: 'Zero-to-working tenant wizard' },
    { label: 'Manage Tenants', icon: Building2, tab: 'admin-tenants', color: '#6366F1', desc: 'Create, update, delete tenants' },
    { label: 'Manage Users', icon: Users, tab: 'admin-users', color: '#0EA5E9', desc: 'User CRUD across tenants' },
    { label: 'S3 Access Keys', icon: Key, tab: 'admin-s3access', color: '#F59E0B', desc: 'Manage S3 credentials' },
    { label: 'Infrastructure', icon: Server, tab: 'admin-infra', color: '#10B981', desc: 'Nodes, drives, networks' },
    { label: 'CSV / YAML Import', icon: FileUp, tab: 'admin-import', color: '#8B5CF6', desc: 'Bulk provision from file' },
    { label: 'Teardown Wizard', icon: Trash2, tab: 'admin-teardown', color: '#EF4444', desc: 'Safe tenant teardown' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px 0' }}>Admin Dashboard</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            <CheckCircle size={14} color="#00C280" />
            <span>Connected as <strong style={{ color: 'var(--text-primary)' }}>{auth.username}</strong> @ {auth.server}</span>
          </div>
        </div>
        <button onClick={loadStats} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[...Array(4)].map((_, i) => <div key={i} style={{ height: 88, borderRadius: 12, background: 'var(--surface-hover)', animation: 'pulse 1.5s infinite' }} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StatCard icon={Database} label="Clusters" value={stats.clusters} color="#ED2738" />
          <StatCard icon={Server} label="Nodes" value={stats.nodes} color="#6366F1" />
          <StatCard icon={Building2} label="Tenants" value={stats.tenants} color="#0EA5E9" />
          <StatCard icon={Users} label="Total Users" value={stats.users} color="#10B981" />
        </div>
      )}

      {/* Version info */}
      {stats.version?.version && stats.version.version !== 'Unknown' && (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>DDN Infinia</span>
          </div>
          <div style={{ width: 1, height: 18, background: 'var(--border-subtle)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Version</span>
            <span style={{ padding: '2px 10px', background: '#ED273815', border: '1px solid #ED273840', borderRadius: 20, fontSize: 13, fontWeight: 700, color: '#ED2738', fontFamily: 'var(--font-mono)' }}>
              {stats.version.version}
            </span>
          </div>
          <div style={{ width: 1, height: 18, background: 'var(--border-subtle)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Host</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{stats.version.hostname}</span>
          </div>
          {stats.version.build_date && stats.version.build_date !== '-' && (
            <>
              <div style={{ width: 1, height: 18, background: 'var(--border-subtle)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Built</span>
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{stats.version.build_date}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 14px 0' }}>Quick Actions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {quickActions.map(a => (
            <button key={a.tab} onClick={() => onNavigate?.(a.tab)}
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '18px 20px', textAlign: 'left', cursor: 'pointer', transition: 'border-color 0.15s', display: 'flex', flexDirection: 'column', gap: 10 }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = a.color)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${a.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <a.icon size={18} color={a.color} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 3 }}>{a.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
