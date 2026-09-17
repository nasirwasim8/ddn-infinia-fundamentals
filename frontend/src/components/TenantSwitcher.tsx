/**
 * TenantSwitcher — persistent dropdown for selecting the active S3 tenant credential.
 * Shown in the sidebar/header for all non-admin sections.
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
}

export default function TenantSwitcher({ activeTenant, onTenantChange, onTenantsLoaded }: Props) {
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
      // Auto-select first if none selected
      if (!activeTenant && list.length > 0) {
        onTenantChange(list[0].label)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const active = tenants.find(t => t.label === activeTenant)

  if (tenants.length === 0) {
    return (
      <div style={{ margin: '0 0 16px 0', padding: '10px 14px', background: '#ED273810', border: '1px solid #ED273840', borderRadius: 8, fontSize: 12, color: '#ED2738' }}>
        ⚠ No S3 tenants configured — add one in{' '}
        <strong>S3 Configuration</strong>
      </div>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative', margin: '0 0 16px 0' }}>
      {/* Trigger */}
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

      {/* Dropdown */}
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
