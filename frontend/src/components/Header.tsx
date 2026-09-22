import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface NavGroup { id: string; label: string }
interface Props {
  groups: NavGroup[]
  activeGroup: string
  onGroupChange: (id: string) => void
  tenantSlot?: ReactNode
}

export default function Header({ groups, activeGroup, onGroupChange, tenantSlot }: Props) {
  const { theme, toggleTheme } = useTheme()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const borderColor = theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'

  return (
    <header style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      height: 'var(--nav-height, 60px)',
      background: 'var(--surface-card)',
      borderBottom: `1px solid ${borderColor}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 28px',
      zIndex: 100,
      boxShadow: scrolled ? '0 1px 12px rgba(0,0,0,0.08)' : 'none',
      transition: 'box-shadow 0.2s',
    }}>
      {/* ── Logo — identical to KV Cache ── */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <img
          src="/logo-ddn.svg"
          alt="DDN"
          style={{ height: 28, width: 'auto', filter: theme === 'dark' ? 'invert(1)' : 'none' }}
        />
        <div style={{
          display: 'flex', alignItems: 'baseline',
          marginLeft: 10, paddingLeft: 10,
          borderLeft: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}`,
          height: 20, alignSelf: 'center',
        }}>
          <span style={{
            fontSize: 13, fontWeight: 300,
            color: theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)',
            letterSpacing: '0.05em',
          }}>
            BUILD.DDN:
          </span>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: theme === 'dark' ? 'rgba(255,255,255,0.9)' : '#ED2738',
            letterSpacing: '0.05em',
          }}>
            INFINIA
          </span>
        </div>
      </div>

      {/* ── Nav group tabs ── */}
      <nav style={{ display: 'flex', gap: 4, height: '100%', alignItems: 'center' }}>
        {groups.map(group => {
          const isActive = activeGroup === group.id
          return (
            <button
              key={group.id}
              onClick={() => onGroupChange(group.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                letterSpacing: '0.03em',
                color: isActive ? '#ED2738' : 'var(--text-muted)',
                background: isActive ? 'rgba(237,39,56,0.07)' : 'transparent',
                transition: 'all 0.15s',
              } as React.CSSProperties}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              {group.label}
            </button>
          )
        })}
      </nav>

      {/* ── Right controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Tenant switcher slot — only shown in S3 sections */}
        {tenantSlot && (
          <>
            {tenantSlot}
            <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 2px' }} />
          </>
        )}

        {/* Infinia version badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 11px', borderRadius: 16,
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-subtle)',
          fontSize: 11, fontWeight: 500,
          color: 'var(--text-muted)',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
          Infinia 2.4.0
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', width: 34, height: 34,
            borderRadius: '50%', transition: 'background 0.15s',
          }}
          onMouseOver={e => e.currentTarget.style.background = 'var(--surface-hover)'}
          onMouseOut={e => e.currentTarget.style.background = 'none'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </header>
  )
}
