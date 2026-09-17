import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props { children: ReactNode; pageName?: string }
interface State { hasError: boolean; error: string }

export default class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message || String(error) }
  }

  componentDidCatch(error: Error) {
    console.error('[PageErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 16, padding: 40, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#ED273815', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={28} color="#ED2738" />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Page failed to render</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', background: 'var(--surface-hover)', padding: '8px 14px', borderRadius: 8, maxWidth: 520, wordBreak: 'break-all' }}>
              {this.state.error}
            </div>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: '' })}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: '#ED2738', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            <RefreshCw size={15} /> Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
