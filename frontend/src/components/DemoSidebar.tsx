import React from 'react'
import * as LucideIcons from 'lucide-react'

interface Tab {
  id: string
  label: string
  icon: string
  group: string
}

interface Props {
  tabs: Tab[]
  activeTab: string
  onTabChange: (id: string) => void
}

const GROUP_LABELS: Record<string, string> = {
  setup: 'Setup',
  storage: 'Storage',
  compliance: 'Compliance',
  advanced: 'Advanced',
  perf: 'Performance'
}

export default function DemoSidebar({ tabs, activeTab, onTabChange }: Props) {
  // Group tabs
  const groups = tabs.reduce((acc, tab) => {
    if (!acc[tab.group]) acc[tab.group] = []
    acc[tab.group].push(tab)
    return acc
  }, {} as Record<string, Tab[]>)

  return (
    <aside style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {Object.entries(groups).map(([groupKey, groupTabs]) => (
        <div key={groupKey} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ 
            fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', 
            color: 'var(--text-muted)', letterSpacing: '0.5px', 
            paddingLeft: '16px', marginBottom: '8px' 
          }}>
            {GROUP_LABELS[groupKey]}
          </div>
          
          {groupTabs.map(tab => {
            const isActive = activeTab === tab.id
            const Icon = (LucideIcons as any)[tab.icon] || LucideIcons.Circle

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 16px',
                  background: isActive ? 'rgba(237, 39, 56, 0.05)' : 'transparent',
                  border: 'none',
                  borderLeft: isActive ? '3px solid #ED2738' : '3px solid transparent',
                  cursor: 'pointer',
                  color: isActive ? '#ED2738' : 'var(--text-primary)',
                  fontWeight: isActive ? 500 : 400,
                  fontSize: '14px',
                  textAlign: 'left',
                  borderRadius: '0 8px 8px 0',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-hover)' }}
                onMouseOut={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} style={{ opacity: isActive ? 1 : 0.7 }} />
                {tab.label}
              </button>
            )
          })}
        </div>
      ))}
    </aside>
  )
}
