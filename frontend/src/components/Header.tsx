import { Sun, Moon, Circle } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useEffect, useState } from 'react'

interface NavGroup { id: string; label: string }
interface Props {
  groups: NavGroup[]
  activeGroup: string
  onGroupChange: (id: string) => void
}

export default function Header({ groups, activeGroup, onGroupChange }: Props) {
  const { theme, toggleTheme } = useTheme()
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const checkConnection = () => {
      setIsConnected(localStorage.getItem('ddn-os-connected') === 'true')
    }
    checkConnection()
    window.addEventListener('storage', checkConnection)
    const interval = setInterval(checkConnection, 2000)
    return () => {
      window.removeEventListener('storage', checkConnection)
      clearInterval(interval)
    }
  }, [])

  return (
    <header style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      height: 'var(--nav-height, 60px)',
      background: 'var(--surface-card)',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Circle size={16} fill="#ED2738" color="#ED2738" />
        <span style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '-0.5px' }}>DDN</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '14px', marginLeft: '8px' }}>Infinia Object Store Validator</span>
      </div>

      <nav style={{ display: 'flex', gap: '24px', height: '100%' }}>
        {groups.map(group => {
          const isActive = activeGroup === group.id
          return (
            <button
              key={group.id}
              onClick={() => onGroupChange(group.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '14px', fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                height: '100%',
                borderBottom: isActive ? '2px solid #ED2738' : '2px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              {group.label}
            </button>
          )
        })}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 12px',
          borderRadius: '16px',
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-subtle)',
          fontSize: '12px', fontWeight: 500
        }}>
          {isConnected ? (
            <>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00C280', boxShadow: '0 0 0 2px rgba(0, 194, 128, 0.2)' }} />
              Connected
            </>
          ) : (
            <>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-muted)' }}>Not configured</span>
            </>
          )}
        </div>
        
        <button
          onClick={toggleTheme}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: '50%', transition: 'background 0.2s'
          }}
          onMouseOver={e => e.currentTarget.style.background = 'var(--surface-hover)'}
          onMouseOut={e => e.currentTarget.style.background = 'none'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  )
}
