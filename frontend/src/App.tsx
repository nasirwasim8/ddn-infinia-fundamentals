import { useState, lazy, Suspense } from 'react'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from './contexts/ThemeContext'
import Header from './components/Header'
import DemoSidebar from './components/DemoSidebar'
import PageErrorBoundary from './components/PageErrorBoundary'
import TenantSwitcher from './components/TenantSwitcher'

// S3 Data Plane pages (existing)
import Configuration from './pages/Configuration'
import SystemHealth from './pages/SystemHealth'
import BucketManager from './pages/BucketManager'
import ObjectExplorer from './pages/ObjectExplorer'
import Versioning from './pages/Versioning'
import ObjectLock from './pages/ObjectLock'
import LegalHold from './pages/LegalHold'
import MultipartUpload from './pages/MultipartUpload'
import PresignedURL from './pages/PresignedURL'
import Lifecycle from './pages/Lifecycle'
import CorsPolicy from './pages/CorsPolicy'
import Benchmark from './pages/Benchmark'
import Analytics from './pages/Analytics'

// Admin / Management Plane pages (lazy loaded)
const AdminDashboard   = lazy(() => import('./pages/admin/AdminDashboard'))
const TenantManager    = lazy(() => import('./pages/admin/TenantManager'))
const UserManager      = lazy(() => import('./pages/admin/UserManager'))
const S3AccessManager  = lazy(() => import('./pages/admin/S3AccessManager'))
const Infrastructure   = lazy(() => import('./pages/admin/Infrastructure'))
const ProvisionWizard  = lazy(() => import('./pages/admin/ProvisionWizard'))
const TeardownWizard   = lazy(() => import('./pages/admin/TeardownWizard'))
const CSVImport        = lazy(() => import('./pages/admin/CSVImport'))

// ── Tab definitions ──────────────────────────────────────────────
const TABS = [
  // Admin (Management Plane)
  { id: 'admin-dashboard',   label: 'Admin Dashboard',   icon: 'LayoutDashboard', group: 'admin' },
  { id: 'admin-tenants',     label: 'Tenant Manager',    icon: 'Building2',       group: 'admin' },
  { id: 'admin-users',       label: 'User Manager',      icon: 'Users',           group: 'admin' },
  { id: 'admin-s3access',    label: 'S3 Access',         icon: 'Key',             group: 'admin' },
  { id: 'admin-infra',       label: 'Infrastructure',    icon: 'Server',          group: 'admin' },
  { id: 'admin-wizard',      label: 'Provision Wizard',  icon: 'Wand2',           group: 'admin' },
  { id: 'admin-teardown',    label: 'Teardown Wizard',   icon: 'Trash2',          group: 'admin' },
  { id: 'admin-import',      label: 'CSV / YAML Import', icon: 'FileUp',          group: 'admin' },
  // Setup (S3 Data Plane)
  { id: 'config',            label: 'S3 Configuration',  icon: 'Settings',        group: 'setup' },
  { id: 'health',            label: 'System Health',     icon: 'Activity',        group: 'setup' },
  // Storage
  { id: 'buckets',           label: 'Bucket Manager',    icon: 'Database',        group: 'storage' },
  { id: 'objects',           label: 'Object Explorer',   icon: 'Box',             group: 'storage' },
  // Compliance
  { id: 'versioning',        label: 'Versioning',        icon: 'GitBranch',       group: 'compliance' },
  { id: 'object-lock',       label: 'Object Lock / WORM',icon: 'Lock',            group: 'compliance' },
  { id: 'legal-hold',        label: 'Legal Hold',        icon: 'Shield',          group: 'compliance' },
  // Advanced
  { id: 'multipart',         label: 'Multipart Upload',  icon: 'UploadCloud',     group: 'advanced' },
  { id: 'presigned',         label: 'Presigned URLs',    icon: 'Link',            group: 'advanced' },
  { id: 'lifecycle',         label: 'Lifecycle Rules',   icon: 'RefreshCw',       group: 'advanced' },
  { id: 'cors',              label: 'CORS & Policy',     icon: 'Globe',           group: 'advanced' },
  // Performance
  { id: 'benchmark',         label: 'Performance',       icon: 'BarChart2',       group: 'perf' },
  { id: 'analytics',         label: 'Analytics',         icon: 'PieChart',        group: 'perf' },
]

const NAV_GROUPS = [
  { id: 'admin',      label: 'Admin' },
  { id: 'setup',      label: 'Setup' },
  { id: 'storage',    label: 'Storage' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'advanced',   label: 'Advanced' },
  { id: 'perf',       label: 'Performance' },
]

// Groups that use S3 and need the tenant switcher
const S3_GROUPS = new Set(['setup', 'storage', 'compliance', 'advanced', 'perf'])

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-muted)' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border-subtle)', borderTopColor: '#ED2738', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState('admin-dashboard')
  const [activeTenant, setActiveTenant] = useState<string | null>(null)
  const activeGroup = TABS.find(t => t.id === activeTab)?.group || 'admin'

  // All S3 pages receive activeTenant so they pass ?tenant= to API calls
  const s3Props = { activeTenant }

  const renderPage = () => {
    switch (activeTab) {
      // Admin (Management Plane — no tenant prop needed)
      case 'admin-dashboard':  return <AdminDashboard onNavigate={setActiveTab} />
      case 'admin-tenants':    return <TenantManager onNavigate={setActiveTab} />
      case 'admin-users':      return <UserManager onNavigate={setActiveTab} />
      case 'admin-s3access':   return <S3AccessManager onNavigate={setActiveTab} />
      case 'admin-infra':      return <Infrastructure onNavigate={setActiveTab} />
      case 'admin-wizard':     return <ProvisionWizard onNavigate={setActiveTab} />
      case 'admin-teardown':   return <TeardownWizard onNavigate={setActiveTab} />
      case 'admin-import':     return <CSVImport onNavigate={setActiveTab} />
      // S3 Data Plane — all receive activeTenant
      case 'config':           return <Configuration />
      case 'health':           return <SystemHealth {...s3Props} />
      case 'buckets':          return <BucketManager {...s3Props} />
      case 'objects':          return <ObjectExplorer {...s3Props} />
      case 'versioning':       return <Versioning {...s3Props} />
      case 'object-lock':      return <ObjectLock {...s3Props} />
      case 'legal-hold':       return <LegalHold {...s3Props} />
      case 'multipart':        return <MultipartUpload {...s3Props} />
      case 'presigned':        return <PresignedURL {...s3Props} />
      case 'lifecycle':        return <Lifecycle {...s3Props} />
      case 'cors':             return <CorsPolicy {...s3Props} />
      case 'benchmark':        return <Benchmark {...s3Props} />
      case 'analytics':        return <Analytics {...s3Props} />
      default:                 return <AdminDashboard onNavigate={setActiveTab} />
    }
  }

  return (
    <ThemeProvider>
      <div style={{ minHeight: '100vh', background: 'var(--surface-primary)' }}>
        <Header
          groups={NAV_GROUPS}
          activeGroup={activeGroup}
          onGroupChange={(g) => {
            const first = TABS.find(t => t.group === g)
            if (first) setActiveTab(first.id)
          }}
        />

        <div style={{ display: 'flex', maxWidth: 1400, margin: '0 auto', padding: 'calc(var(--nav-height, 60px) + 24px) 24px 32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {/* Tenant switcher — only in S3 sections */}
            {S3_GROUPS.has(activeGroup) && (
              <div style={{ width: 240, marginBottom: 0 }}>
                <TenantSwitcher
                  activeTenant={activeTenant}
                  onTenantChange={setActiveTenant}
                />
              </div>
            )}
            <DemoSidebar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
          <main style={{ flex: 1, minWidth: 0, marginLeft: 24 }}>
            <PageErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                {renderPage()}
              </Suspense>
            </PageErrorBoundary>
          </main>
        </div>

        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--surface-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              fontSize: '13px',
            },
            success: { iconTheme: { primary: '#00C280', secondary: 'white' } },
            error:   { iconTheme: { primary: '#ED2738', secondary: 'white' } },
          }}
        />
      </div>
    </ThemeProvider>
  )
}
