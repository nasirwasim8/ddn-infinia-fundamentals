/**
 * TenantSwitcher — persistent dropdown for selecting the active S3 tenant credential.
 * variant='sidebar' (default): full-width card in the sidebar
 * variant='header': compact pill in the top header bar
 */
import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Database, RefreshCw } from 'lucide-react'
import axios from 'axios'

const API = 'http://localhost:8003/api'

export interface S3Tenant {
  label: string
  tenant_name: string
  endpoint: string
  access_key: string
  secret_key_masked: string
  description: string
}

interface Props {
  activeTenant: string | null
  onTenantChange: (label: string) => void
  onTenantsLoaded?: (tenants: S3Tenant[]) => void
  variant?: 'sidebar' | 'header'
}

export default function TenantSwitcher({ activeTenant, onTenantChange, onTenantsLoaded, variant = 'sidebar' }: Props) {
  const [tenants, setTenants] = useState<S3Tenant[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await axios.get(`${API}/s3-tenants`)
      const list: S3Tenant[] = r.data.tenants || []
      setTenants(list)
      onTenantsLoaded?.(list)
      if (!activeTenant && list.length > 0) onTenantChange(list[0].label)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const active = tenants.find(t => t.label === activeTenant)

  // ── Header variant — compact pill in top nav bar ──────────────────
  if (variant === 'header') {
    if (tenants.length === 0 && !loading) return null
    return (
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 11px 5px 9px',
            background: 'var(--surface-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 20, cursor: 'pointer',
            fontSize: 13, color: 'var(--text-primary)',
            transition: 'border-color 0.15s',
          }}
        >
          <Database size={13} color="#ED2738" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>Tenant</span>
          <span style={{ fontWeight: 700, color: active ? '#ED2738' : 'var(--text-muted)', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {active ? active.label : '—'}
          </span>
          {loading
            ? <RefreshCw size={12} color="var(--text-muted)" style={{ animation: 'spin 1s linear infinite' }} />
            : <ChevronDown size={12} color="var(--text-muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          }
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            minWidth: 230,
            background: 'var(--surface-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 10, zIndex: 500,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '8px 14px 6px', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)' }}>
              Switch Active Tenant
            </div>
            {tenants.map(t => (
              <button key={t.label} onClick={() => { onTenantChange(t.label); setOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  background: t.label === activeTenant ? '#ED273808' : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer', textAlign: 'left',
                }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: t.label === activeTenant ? '#ED2738' : 'var(--border-subtle)',
                  boxShadow: t.label === activeTenant ? '0 0 0 2px #ED273830' : 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.description || t.access_key}
                  </div>
                </div>
                {t.label === activeTenant && (
                  <span style={{ fontSize: 10, background: '#ED2738', color: 'white', padding: '2px 7px', borderRadius: 10, fontWeight: 600, flexShrink: 0 }}>ACTIVE</span>
                )}
              </button>
            ))}
            <button onClick={() => { load(); setOpen(false) }}
              style={{ width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={11} /> Refresh list
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Sidebar variant (default) ───────────────────────────────────────
  if (tenants.length === 0) {
    return (
      <div style={{ margin: '0 0 16px 0', padding: '10px 14px', background: '#ED273810', border: '1px solid #ED273840', borderRadius: 8, fontSize: 12, color: '#ED2738' }}>
        ⚠ No S3 tenants configured — add one in <strong>S3 Configuration</strong>
      </div>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative', margin: '0 0 16px 0' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}>
        <Database size={13} color="#ED2738" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>Active Tenant</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {active ? active.label : '— select —'}
          </div>
        </div>
        {loading
          ? <RefreshCw size={13} color="var(--text-muted)" style={{ animation: 'spin 1s linear infinite' }} />
          : <ChevronDown size={13} color="var(--text-muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        }
      </button>

      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, zIndex: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
          {tenants.map(t => (
            <button key={t.label} onClick={() => { onTenantChange(t.label); setOpen(false) }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: t.label === activeTenant ? '#ED273810' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.label === activeTenant ? '#ED2738' : 'var(--text-muted)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.description || t.access_key}
                </div>
              </div>
              {t.label === activeTenant && (
                <span style={{ fontSize: 10, background: '#ED2738', color: 'white', padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>ACTIVE</span>
              )}
            </button>
          ))}
          <button onClick={() => { load(); setOpen(false) }}
            style={{ width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={11} /> Refresh list
          </button>
        </div>
      )}
    </div>
  )
}
