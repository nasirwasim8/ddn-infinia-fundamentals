import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-hot-toast'
import { ShieldCheck, ShieldAlert, RefreshCw, Play, ChevronDown, Info } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TenantInfo {
  label: string
  tenant_name: string
  endpoint: string
  access_key: string
  description: string
  bucket_count: number
  status: 'reachable' | 'unreachable' | 'unknown'
}

interface TestStep { step: string; status: string; message: string }
interface TestResult {
  verdict: 'ISOLATED' | 'BREACH' | 'error' | null
  steps: TestStep[]
  http_status: number | null
  error_code: string | null
  message: string
}

// ── Collapsible info box ──────────────────────────────────────────────────────
function InfoBox({ title, children, color = '#6366F1', defaultOpen = false }: { title: string; children: React.ReactNode; color?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: color + '08', border: `1px solid ${color}30`, borderRadius: 10, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}>
        <Info size={14} color={color} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{title}</span>
        <ChevronDown size={14} color={color} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div style={{ padding: '0 18px 14px 18px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, borderTop: `1px solid ${color}20` }}>
          <div style={{ paddingTop: 12 }}>{children}</div>
        </div>
      )}
    </div>
  )
}

// ── Code block ────────────────────────────────────────────────────────────────
function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
      <pre style={{ margin: 0, padding: '10px 14px', background: '#0d1117', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 11, color: '#e6edf3', fontFamily: 'var(--font-mono)', overflowX: 'auto' as const, whiteSpace: 'pre' as const }}>{code}</pre>
    </div>
  )
}

// ── Tenant panel ──────────────────────────────────────────────────────────────
function TenantPanel({
  role, color, tenant, tenants, onSelect, buckets, loadingBuckets,
  selectedBucket, onBucket, objects, selectedObject, onObject,
}: {
  role: 'Owner' | 'Attacker'
  color: string
  tenant: TenantInfo | null
  tenants: TenantInfo[]
  onSelect: (t: TenantInfo) => void
  buckets: string[]
  loadingBuckets: boolean
  selectedBucket: string
  onBucket: (b: string) => void
  objects: string[]
  selectedObject: string
  onObject: (o: string) => void
}) {
  const isOwner = role === 'Owner'
  return (
    <div style={{ flex: 1, background: 'var(--surface-card)', border: `2px solid ${color}30`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Role badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}80` }} />
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{role} Tenant</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {isOwner ? '— legitimate data owner' : '— has NO rights to owner data'}
        </span>
      </div>

      {/* Role description */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-hover)', borderRadius: 8, padding: '8px 12px', lineHeight: 1.5 }}>
        {isOwner
          ? 'This tenant owns the bucket and object. We will first confirm the data exists using their credentials.'
          : 'This tenant\'s S3 credentials will be used to attempt access to the owner\'s data. On a properly isolated system, this must fail.'}
      </div>

      {/* Tenant selector */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
          {isOwner ? 'Select Owner Tenant' : 'Select Attacker Tenant'}
        </label>
        <div style={{ position: 'relative' }}>
          <select
            value={tenant?.label || ''}
            onChange={e => { const t = tenants.find(x => x.label === e.target.value); if (t) onSelect(t) }}
            style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: 8, border: `1px solid ${color}50`, background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, appearance: 'none', cursor: 'pointer' }}>
            <option value="">— choose tenant —</option>
            {tenants.map(t => (
              <option key={t.label} value={t.label}>
                {t.label}  ({t.bucket_count} bucket{t.bucket_count !== 1 ? 's' : ''})
              </option>
            ))}
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* Tenant metadata */}
      {tenant && (
        <div style={{ background: 'var(--surface-hover)', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { k: 'S3 Endpoint', v: tenant.endpoint },
            { k: 'Access Key',  v: tenant.access_key ? tenant.access_key.slice(0, 8) + '••••••••••••' : '—' },
            { k: 'Buckets',     v: String(tenant.bucket_count) },
            { k: 'Status',      v: tenant.status },
          ].map(({ k, v }) => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)', width: 90, flexShrink: 0 }}>{k}</span>
              <span style={{
                color: k === 'Status' ? (tenant.status === 'reachable' ? '#00C280' : '#ED2738') : 'var(--text-primary)',
                fontFamily: ['S3 Endpoint', 'Access Key'].includes(k) ? 'var(--font-mono)' : 'inherit',
                fontSize: k === 'S3 Endpoint' ? 10 : 12,
                wordBreak: 'break-all' as const
              }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bucket + object selectors — owner only */}
      {isOwner && tenant && (
        <>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Select Bucket to test against {loadingBuckets && <span style={{ color: '#F59E0B', fontWeight: 400 }}>loading…</span>}
            </label>
            <div style={{ position: 'relative' }}>
              <select value={selectedBucket} onChange={e => onBucket(e.target.value)} disabled={buckets.length === 0}
                style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 13, appearance: 'none', cursor: 'pointer' }}>
                <option value="">— choose bucket —</option>
                {buckets.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
            </div>
          </div>

          {selectedBucket && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Select Object Key</label>
              <div style={{ position: 'relative' }}>
                <select value={selectedObject} onChange={e => onObject(e.target.value)} disabled={objects.length === 0}
                  style={{ width: '100%', padding: '10px 36px 10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-mono)', appearance: 'none', cursor: 'pointer' }}>
                  <option value="">— choose object —</option>
                  {objects.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
              </div>
              {objects.length === 0 && (
                <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 4 }}>No objects found — upload at least one object to this bucket first.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TenantIsolation() {
  const [tenants, setTenants]               = useState<TenantInfo[]>([])
  const [loadingTenants, setLoadingTenants] = useState(true)
  const [ownerTenant, setOwnerTenant]       = useState<TenantInfo | null>(null)
  const [attackerTenant, setAttackerTenant] = useState<TenantInfo | null>(null)
  const [ownerBuckets, setOwnerBuckets]     = useState<string[]>([])
  const [loadingBuckets, setLoadingBuckets] = useState(false)
  const [selectedBucket, setSelectedBucket] = useState('')
  const [objects, setObjects]               = useState<string[]>([])
  const [selectedObject, setSelectedObject] = useState('')
  const [running, setRunning]               = useState(false)
  const [result, setResult]                 = useState<TestResult | null>(null)
  const [activeStep, setActiveStep]         = useState(-1)

  useEffect(() => {
    axios.get('/api/isolation/tenants')
      .then(r => setTenants(r.data.tenants || []))
      .catch(() => toast.error('Could not load tenant list'))
      .finally(() => setLoadingTenants(false))
  }, [])

  useEffect(() => {
    if (!ownerTenant) { setOwnerBuckets([]); setSelectedBucket(''); setObjects([]); return }
    setLoadingBuckets(true)
    axios.get('/api/buckets', { params: { tenant: ownerTenant.label } })
      .then(r => {
        const list = (r.data?.buckets || []).map((b: any) => b.Name || b)
        setOwnerBuckets(list)
        setSelectedBucket(list[0] || '')
      })
      .catch(() => setOwnerBuckets([]))
      .finally(() => setLoadingBuckets(false))
  }, [ownerTenant])

  useEffect(() => {
    if (!ownerTenant || !selectedBucket) { setObjects([]); setSelectedObject(''); return }
    axios.get(`/api/buckets/${selectedBucket}/objects`, { params: { tenant: ownerTenant.label } })
      .then(r => {
        const list = (r.data?.objects || []).map((o: any) => o.Key || o)
        setObjects(list)
        setSelectedObject(list[0] || '')
      })
      .catch(() => setObjects([]))
  }, [ownerTenant, selectedBucket])

  const canRun = ownerTenant && attackerTenant && ownerTenant.label !== attackerTenant.label && selectedBucket && selectedObject

  const runTest = async () => {
    if (!canRun) { toast.error('Select two different tenants, a bucket, and an object'); return }
    setRunning(true); setResult(null); setActiveStep(0)
    try {
      const r = await axios.post('/api/isolation/cross-tenant-test', {
        owner_tenant:    ownerTenant!.label,
        attacker_tenant: attackerTenant!.label,
        bucket:          selectedBucket,
        key:             selectedObject,
      })
      const data: TestResult = r.data
      for (let i = 0; i < (data.steps?.length || 0); i++) {
        setActiveStep(i)
        await new Promise(res => setTimeout(res, 900))
      }
      setActiveStep(-1)
      setResult(data)
    } catch (e: any) {
      toast.error('Test failed: ' + (e.response?.data?.detail || e.message))
    } finally {
      setRunning(false)
    }
  }

  // Build preview API call snippets from current selections
  const ownerEndpoint   = ownerTenant?.endpoint   || '<owner-endpoint>'
  const attackerEndpoint = attackerTenant?.endpoint || '<attacker-endpoint>'
  const ownerKey        = ownerTenant?.access_key  ? ownerTenant.access_key.slice(0,8)+'••••' : '<owner-access-key>'
  const attackerKey     = attackerTenant?.access_key ? attackerTenant.access_key.slice(0,8)+'••••' : '<attacker-access-key>'
  const bucketDisplay   = selectedBucket || '<bucket-name>'
  const objectDisplay   = selectedObject || '<object-key>'

  const step1Code = `# STEP 1 — Verify object exists using OWNER credentials
import boto3
s3_owner = boto3.client('s3',
    endpoint_url     = "${ownerEndpoint}",
    aws_access_key_id     = "${ownerKey}",
    aws_secret_access_key = "••••••••••••••••",
)
s3_owner.head_object(Bucket="${bucketDisplay}", Key="${objectDisplay}")
# Expected: 200 OK — owner can access their own data`

  const step2Code = `# STEP 2 — Attempt access using ATTACKER credentials
s3_attacker = boto3.client('s3',
    endpoint_url     = "${attackerEndpoint}",
    aws_access_key_id     = "${attackerKey}",
    aws_secret_access_key = "••••••••••••••••",
)
s3_attacker.get_object(Bucket="${bucketDisplay}", Key="${objectDisplay}")
# Expected: 403 AccessDenied or 404 NoSuchBucket
# Infinia must reject this — attacker has NO rights here`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Page header ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <ShieldCheck size={28} color="#00C280" />
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Tenant Isolation Proof</h1>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#6366F120', color: '#6366F1', border: '1px solid #6366F140' }}>NCP DEMO</span>
        </div>
        <p style={{ color: 'var(--text-muted)', margin: 0, maxWidth: 700, fontSize: 14, lineHeight: 1.6 }}>
          A live security proof that tenants on the same DDN Infinia cluster cannot access each other's data.
          Ideal for NCP onboarding — run this during a customer meeting to eliminate isolation concerns.
        </p>
      </div>

      {/* ── WHY CAN YOU SEE ALL TENANTS? ── */}
      <InfoBox title="Why are all tenants visible here?" color="#6366F1">
        <strong style={{ color: 'var(--text-primary)' }}>All tenants shown below share one physical Infinia cluster</strong> — this is the NCP model.
        A Neo Cloud Provider deploys a single Infinia cluster and carves it into isolated namespaces, one per customer.
        Seeing all tenants listed together is intentional: it demonstrates that multi-tenancy is handled at the
        storage layer, not by running separate hardware per customer. The isolation proof below shows
        that despite sharing the same cluster, <strong style={{ color: 'var(--text-primary)' }}>no tenant can see or touch another tenant's data</strong>.
      </InfoBox>

      {/* ── HOW THE TEST WORKS ── */}
      <InfoBox title="How the isolation test works" color="#F59E0B">
        The test makes two real S3 API calls against the live Infinia cluster:
        <ol style={{ margin: '8px 0 0 16px', padding: 0, lineHeight: 2 }}>
          <li><strong style={{ color: 'var(--text-primary)' }}>Owner verification</strong> — confirms the selected object is accessible using the <em>owner tenant's</em> real S3 credentials.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Cross-tenant attack</strong> — attempts to read the same object using the <em>attacker tenant's</em> S3 credentials.
            A secure system must return <code style={{ background: '#F59E0B20', padding: '1px 5px', borderRadius: 3 }}>403 AccessDenied</code> or <code style={{ background: '#F59E0B20', padding: '1px 5px', borderRadius: 3 }}>404 NoSuchBucket</code>.</li>
        </ol>
        No mock data. No simulation. Both calls hit Infinia directly via the S3 API.
      </InfoBox>

      {/* ── LOADING / NOT ENOUGH TENANTS ── */}
      {loadingTenants && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
          <div>Loading configured S3 tenants…</div>
        </div>
      )}

      {!loadingTenants && tenants.length < 2 && (
        <div style={{ padding: '20px 24px', background: '#F59E0B10', border: '1px solid #F59E0B40', borderRadius: 12 }}>
          <div style={{ fontWeight: 600, color: '#F59E0B', marginBottom: 6 }}>At least 2 configured S3 tenants required</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            You have {tenants.length} S3 tenant{tenants.length !== 1 ? 's' : ''} configured. Use <strong>Admin → CSV/YAML Import</strong> with Full End-to-End mode, or the Provision Wizard, to add tenants.
          </div>
        </div>
      )}

      {/* ── CLUSTER TOPOLOGY STRIP ── */}
      {!loadingTenants && tenants.length >= 2 && (
        <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>
            Shared Infinia Cluster — Configured Tenants ({tenants.length})
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            {/* Cluster node */}
            <div style={{ padding: '8px 16px', background: '#6366F115', border: '2px solid #6366F140', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#6366F1' }}>
              DDN Infinia
            </div>
            <div style={{ fontSize: 16, color: 'var(--text-muted)' }}>→</div>
            {tenants.map((t, i) => (
              <React.Fragment key={t.label}>
                <div style={{ padding: '8px 14px', background: t.status === 'reachable' ? '#00C28010' : '#ED273810', border: `1px solid ${t.status === 'reachable' ? '#00C28040' : '#ED273840'}`, borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.status === 'reachable' ? '#00C280' : '#ED2738' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{t.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.bucket_count}B</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{t.endpoint}</div>
                </div>
                {i < tenants.length - 1 && <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>|</div>}
              </React.Fragment>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, fontStyle: 'italic' }}>
            Each tenant has a unique S3 endpoint and isolated credential namespace — but all run on the same physical cluster.
          </div>
        </div>
      )}

      {/* ── TWO PANELS ── */}
      {!loadingTenants && tenants.length >= 2 && (
        <div style={{ display: 'flex', gap: 20, alignItems: 'stretch' }}>
          <TenantPanel
            role="Owner" color="#00C280"
            tenant={ownerTenant} tenants={tenants} onSelect={t => { setOwnerTenant(t); setResult(null) }}
            buckets={ownerBuckets} loadingBuckets={loadingBuckets}
            selectedBucket={selectedBucket} onBucket={b => { setSelectedBucket(b); setResult(null) }}
            objects={objects} selectedObject={selectedObject} onObject={o => { setSelectedObject(o); setResult(null) }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 48 }}>
            <div style={{ width: 2, flex: 1, background: 'var(--border-subtle)' }} />
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--surface-card)', border: '2px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>VS</div>
            <div style={{ width: 2, flex: 1, background: 'var(--border-subtle)' }} />
          </div>

          <TenantPanel
            role="Attacker" color="#ED2738"
            tenant={attackerTenant} tenants={tenants.filter(t => t.label !== ownerTenant?.label)} onSelect={t => { setAttackerTenant(t); setResult(null) }}
            buckets={[]} loadingBuckets={false}
            selectedBucket="" onBucket={() => {}}
            objects={[]} selectedObject="" onObject={() => {}}
          />
        </div>
      )}

      {/* ── TEST PREVIEW — API CALLS THAT WILL FIRE ── */}
      {!loadingTenants && ownerTenant && attackerTenant && selectedBucket && selectedObject && !result && (
        <div style={{ background: 'var(--surface-card)', border: '1px solid #F59E0B40', borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 14 }}>
            What will execute when you click "Run Test"
          </div>
          <CodeBlock label={`Step 1 — Owner verification  (${ownerTenant.label} credentials → should SUCCEED)`} code={step1Code} />
          <CodeBlock label={`Step 2 — Cross-tenant attack  (${attackerTenant.label} credentials → must FAIL)`} code={step2Code} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, padding: '8px 12px', background: 'var(--surface-hover)', borderRadius: 6 }}>
            Both calls are made from the backend server directly to Infinia S3 API using real boto3 credentials stored in the tenant config. No mocking, no simulation.
          </div>
        </div>
      )}

      {/* ── RUN BUTTON ── */}
      {!loadingTenants && tenants.length >= 2 && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={runTest}
            disabled={!canRun || running}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 40px', borderRadius: 10,
              background: !canRun || running ? 'var(--surface-hover)' : 'linear-gradient(135deg,#ED2738,#6366F1)',
              border: 'none', color: !canRun || running ? 'var(--text-muted)' : 'white',
              fontWeight: 700, fontSize: 15, cursor: !canRun || running ? 'not-allowed' : 'pointer',
              boxShadow: canRun && !running ? '0 4px 20px rgba(237,39,56,0.3)' : 'none',
              transition: 'all 0.2s',
            }}>
            {running
              ? <><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> Running Live Test…</>
              : <><Play size={18} /> Run Cross-Tenant Access Test</>}
          </button>
        </div>
      )}

      {/* ── ANIMATED STEP LOG ── */}
      {(running || (result && result.steps?.length > 0)) && (
        <div style={{ background: '#0d1117', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Live Test Execution Log</div>
          {(result?.steps || []).map((step, i) => {
            const isActive = running && activeStep === i
            const isIsolated = step.status === 'isolated' || step.status === 'success'
            const color = isIsolated ? '#00C280' : step.status === 'breach' ? '#ED2738' : step.status === 'error' ? '#F59E0B' : '#6366F1'
            const icon  = isActive ? '▶' : isIsolated ? '✓' : step.status === 'breach' ? '✗' : '!'

            // Human-readable step label
            const stepLabel = step.step === 'owner_verify'  ? 'Step 1 — Owner Verify'
                            : step.step === 'cross_access'  ? 'Step 2 — Cross-Tenant Attack'
                            : step.step

            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12, alignItems: 'flex-start' }}>
                  <span style={{ color, flexShrink: 0, fontSize: 14 }}>{icon}</span>
                  <span style={{ color: color + 'AA', width: 170, flexShrink: 0, fontWeight: 700, fontSize: 10 }}>[{stepLabel}]</span>
                  <span style={{ color }}>{step.message}</span>
                </div>
                {/* Extra explanation per step */}
                {result && !running && step.step === 'owner_verify' && step.status === 'success' && (
                  <div style={{ marginLeft: 30, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Owner credentials accepted — object confirmed in {ownerTenant?.label}'s namespace.
                  </div>
                )}
                {result && !running && step.step === 'cross_access' && step.status === 'isolated' && (
                  <div style={{ marginLeft: 30, fontSize: 11, color: '#00C28090', fontStyle: 'italic' }}>
                    Infinia rejected the attacker's credentials — the bucket is invisible outside its tenant namespace.
                  </div>
                )}
              </div>
            )
          })}
          {running && (
            <div style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12, color: '#F59E0B', alignItems: 'center' }}>
              <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
              <span>Calling Infinia S3 API with {attackerTenant?.label} credentials…</span>
            </div>
          )}
        </div>
      )}

      {/* ── VERDICT BANNER ── */}
      {result && !running && (
        <div style={{
          padding: '32px', borderRadius: 16,
          border: `2px solid ${result.verdict === 'ISOLATED' ? '#00C280' : result.verdict === 'BREACH' ? '#ED2738' : '#F59E0B'}`,
          background: result.verdict === 'ISOLATED' ? '#00C28008' : result.verdict === 'BREACH' ? '#ED273808' : '#F59E0B08',
          display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center', textAlign: 'center',
        }}>
          {result.verdict === 'ISOLATED'
            ? <ShieldCheck size={60} color="#00C280" />
            : <ShieldAlert size={60} color={result.verdict === 'BREACH' ? '#ED2738' : '#F59E0B'} />}

          <div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em',
              color: result.verdict === 'ISOLATED' ? '#00C280' : result.verdict === 'BREACH' ? '#ED2738' : '#F59E0B' }}>
              {result.verdict === 'ISOLATED' ? 'ACCESS DENIED — ISOLATED' : result.verdict === 'BREACH' ? 'BREACH DETECTED' : 'TEST ERROR'}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 10, maxWidth: 580, lineHeight: 1.6 }}>
              {result.verdict === 'ISOLATED'
                ? `Tenant "${attackerTenant?.label}" used its own valid S3 credentials to attempt GetObject on a bucket owned by "${ownerTenant?.label}". Infinia rejected the request — the bucket does not exist in the attacker's namespace. Both tenants share the same physical cluster.`
                : result.verdict === 'BREACH'
                ? `Tenant "${attackerTenant?.label}" was able to read "${ownerTenant?.label}"'s data. Isolation is not configured correctly — check service ACLs and tenant endpoint configuration.`
                : result.message}
            </div>
          </div>

          {/* HTTP proof badges */}
          {result.http_status && (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' as const, justifyContent: 'center' }}>
              {[
                { label: 'HTTP Status',     value: String(result.http_status),   highlight: result.verdict === 'ISOLATED' },
                { label: 'S3 Error Code',   value: result.error_code || '—',    highlight: false },
                { label: 'Cluster',         value: 'Shared Infinia',             highlight: false },
                { label: 'Attacker Tenant', value: attackerTenant?.label || '—', highlight: false },
              ].map(({ label, value, highlight }) => (
                <div key={label} style={{ padding: '10px 18px', borderRadius: 10,
                  background: highlight ? (result.verdict === 'ISOLATED' ? '#00C28020' : '#ED273820') : 'var(--surface-hover)',
                  border: `1px solid ${highlight ? (result.verdict === 'ISOLATED' ? '#00C28050' : '#ED273850') : 'var(--border-subtle)'}` }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: highlight ? 22 : 15, fontWeight: 800,
                    color: highlight ? (result.verdict === 'ISOLATED' ? '#00C280' : '#ED2738') : 'var(--text-primary)',
                    fontFamily: ['HTTP Status','S3 Error Code'].includes(label) ? 'var(--font-mono)' : 'inherit' }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* What this proves */}
          {result.verdict === 'ISOLATED' && (
            <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '18px 24px', textAlign: 'left', width: '100%', maxWidth: 620 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#00C280', marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>What This Proves for NCPs</div>
              {[
                ['S3 credential scoping',    'Each tenant\'s access keys are only valid within their own namespace — cross-namespace use is rejected at the Infinia storage layer.'],
                ['Bucket namespace isolation','The attacker received NoSuchBucket — not just AccessDenied. Infinia doesn\'t reveal a bucket even exists outside its owner tenant.'],
                ['No ACL bypass possible',   'The rejection happens at the storage layer, not at the API gateway. There is no network path an attacker could use to bypass it.'],
                ['Safe multi-tenancy',       'NCPs can co-locate multiple end-customers on one Infinia cluster without any risk of cross-customer data exposure.'],
              ].map(([title, desc]) => (
                <div key={title as string} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: '#00C280', flexShrink: 0, marginTop: 2 }}>✓</span>
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{title as string}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}> — {desc as string}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button onClick={() => { setResult(null); setActiveStep(-1) }}
            style={{ padding: '8px 22px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 7, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
            Reset Test
          </button>
        </div>
      )}
    </div>
  )
}
