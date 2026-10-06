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

// Cloud icon SVG (no external dep)
function CloudIcon({ color = '#0D9488', size = 13 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 20 15" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M16.5 6.5a4 4 0 0 0-7.7-1.5A3 3 0 1 0 3 8h13a3 3 0 0 0 .5-1.5z" />
    </svg>
  )
}

export default function Header({ groups, activeGroup, onGroupChange, tenantSlot }: Props) {
  const { theme, toggleTheme } = useTheme()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const isDark = theme === 'dark'
  const dividerColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'

  return (
    <header style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      background: 'var(--surface-card)',
      borderBottom: `1px solid ${dividerColor}`,
      zIndex: 100,
      boxShadow: scrolled ? '0 1px 12px rgba(0,0,0,0.08)' : 'none',
      transition: 'box-shadow 0.2s',
    }}>

      {/* ── Main nav row ── */}
      <div style={{
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
      }}>

        {/* ── Logo + branding ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>

          {/* DDN logo */}
          <img
            src="/logo-ddn.svg"
            alt="DDN"
            style={{ height: 26, width: 'auto', filter: isDark ? 'invert(1)' : 'none' }}
          />

          {/* Divider */}
          <div style={{
            width: 1, height: 22, margin: '0 12px',
            background: dividerColor,
          }} />

          {/* BUILD.DDN:INFINIA */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
            <span style={{
              fontSize: 12, fontWeight: 300,
              color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)',
              letterSpacing: '0.06em',
            }}>
              BUILD.DDN:
            </span>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: isDark ? 'rgba(255,255,255,0.92)' : '#ED2738',
              letterSpacing: '0.06em',
            }}>
              INFINIA
            </span>
          </div>

          {/* Divider */}
          <div style={{
            width: 1, height: 16, margin: '0 12px',
            background: dividerColor,
          }} />

          {/* CLOUD BUILDER EDITION + cloud icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: isDark ? '#2DD4BF' : '#0D9488',
              letterSpacing: '0.1em',
              textTransform: 'uppercase' as const,
            }}>
              Cloud Builder Edition
            </span>
            <CloudIcon color={isDark ? '#2DD4BF' : '#0D9488'} size={13} />
          </div>

          {/* NCP PARTNER PROGRAM pill badge */}
          <div style={{
            marginLeft: 10,
            display: 'flex', alignItems: 'center',
            padding: '3px 9px',
            borderRadius: 20,
            background: isDark ? 'rgba(13,148,136,0.18)' : 'rgba(13,148,136,0.1)',
            border: '1px solid rgba(13,148,136,0.35)',
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700,
              color: isDark ? '#2DD4BF' : '#0D9488',
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              whiteSpace: 'nowrap' as const,
            }}>
              NCP Partner Program
            </span>
          </div>
        </div>

        {/* ── Nav group tabs ── */}
        <nav style={{ display: 'flex', gap: 2, height: '100%', alignItems: 'center' }}>
          {groups.map(group => {
            const isActive = activeGroup === group.id
            return (
              <button
                key={group.id}
                onClick={() => onGroupChange(group.id)}
                style={{
                  background: isActive ? 'rgba(237,39,56,0.07)' : 'transparent',
                  border: 'none', cursor: 'pointer',
                  padding: '5px 13px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: '0.03em',
                  color: isActive ? '#ED2738' : 'var(--text-muted)',
                  transition: 'all 0.15s',
                } as React.CSSProperties}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                {group.label}
              </button>
            )
          })}
        </nav>

        {/* ── Right controls ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {tenantSlot && (
            <>
              {tenantSlot}
              <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 2px' }} />
            </>
          )}

          {/* Infinia version badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 14,
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
              justifyContent: 'center', width: 32, height: 32,
              borderRadius: '50%', transition: 'background 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'var(--surface-hover)'}
            onMouseOut={e => e.currentTarget.style.background = 'none'}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>

      {/* ── NCP Tagline strip ── */}
      <div style={{
        height: 26,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '0 24px',
        borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
        background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.018)',
        gap: 0,
      }}>
        {[
          'Onboard Fast',
          'Isolate Completely',
          'Scale Without Limits',
          'Enterprise Compliant',
        ].map((phrase, i) => (
          <span key={phrase} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && (
              <span style={{
                margin: '0 10px',
                color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.2)',
                fontSize: 10,
              }}>·</span>
            )}
            <span style={{
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase' as const,
              color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.32)',
            }}>
              {phrase}
            </span>
          </span>
        ))}
      </div>

    </header>
  )
}
