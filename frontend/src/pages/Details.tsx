const REST = '#3B82F6'
const SSH  = '#F59E0B'
const S3   = '#10B981'

const IconGlobe = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>)
const IconTerm  = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>)
const IconDb    = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>)

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700,
      textTransform:'uppercase' as const, letterSpacing:'0.05em',
      padding:'3px 8px', borderRadius:5, background:color+'18', color, border:'1px solid '+color+'40' }}>
      {label === 'REST API' ? <IconGlobe /> : label === 'SSH + redcli' ? <IconTerm /> : <IconDb />}
      {label}
    </span>
  )
}

function Row({ feature, tag, call, note }: { feature: string; tag: string; call: string; note?: string }) {
  const color = tag === 'REST API' ? REST : tag === 'SSH + redcli' ? SSH : S3
  return (
    <tr style={{ borderBottom:'1px solid var(--border-subtle)' }}>
      <td style={{ padding:'12px 16px 12px 0', fontSize:13, fontWeight:600, color:'var(--text-primary)', whiteSpace:'nowrap' as const, verticalAlign:'top' as const }}>{feature}</td>
      <td style={{ padding:'12px 12px 12px 0', verticalAlign:'top' as const, whiteSpace:'nowrap' as const }}><Tag label={tag} color={color} /></td>
      <td style={{ padding:'12px 0', verticalAlign:'top' as const }}>
        <code style={{ fontFamily:'monospace', fontSize:12, color:'var(--text-primary)', wordBreak:'break-all' as const, display:'block' }}>{call}</code>
        {note && <span style={{ fontSize:11, color:'var(--text-muted)', marginTop:4, display:'block' }}>{note}</span>}
      </td>
    </tr>
  )
}

export default function Details() {
  return (
    <div style={{ display:'flex', flexDirection:'column' as const, gap:28 }}>

      <div>
        <h1 style={{ fontSize:22, fontWeight:700, margin:'0 0 6px', color:'var(--text-primary)' }}>How It Works — Integration Reference</h1>
        <p style={{ margin:0, color:'var(--text-muted)', fontSize:14 }}>Which mechanism each feature uses to talk to Infinia.</p>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap' as const }}>
        {[
          { label:'REST API', color:REST, desc:'Infinia Management API — https://<infinia-server-ip>/redapi/v1' },
          { label:'SSH + redcli', color:SSH, desc:'redcli CLI over SSH via paramiko — host <infinia-server-ip>:22' },
          { label:'S3 / boto3', color:S3, desc:'S3-compatible object store — https://<infinia-server-ip>:8111 (or per-tenant vhost:8111)' },
        ].map(m => (
          <div key={m.label} style={{ flex:1, minWidth:200, padding:'12px 16px', borderRadius:10, border:'1px solid '+m.color+'30', background:m.color+'08' }}>
            <Tag label={m.label} color={m.color} />
            <p style={{ margin:'8px 0 0', fontSize:12, color:'var(--text-muted)' }}>{m.desc}</p>
          </div>
        ))}
      </div>

      {/* Control Plane table */}
      <div style={{ background:'var(--surface-card)', borderRadius:14, padding:24, border:'1px solid var(--border-subtle)' }}>
        <h2 style={{ margin:'0 0 16px', fontSize:15, fontWeight:700, color:'var(--text-primary)' }}>Control Plane Operations</h2>
        <table style={{ width:'100%', borderCollapse:'collapse' as const }}>
          <thead>
            <tr style={{ borderBottom:'2px solid var(--border-subtle)' }}>
              <th style={{ padding:'0 16px 10px 0', textAlign:'left' as const, fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase' as const }}>Feature</th>
              <th style={{ padding:'0 12px 10px 0', textAlign:'left' as const, fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase' as const }}>Mechanism</th>
              <th style={{ padding:'0 0 10px', textAlign:'left' as const, fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase' as const }}>API Call / Command</th>
            </tr>
          </thead>
          <tbody>
            <Row feature="List Tenants"           tag="REST API"      call="GET  /redapi/v1/clusters/{cluster}/tenants" />
            <Row feature="Create Tenant"          tag="REST API"      call="POST /redapi/v1/clusters/{cluster}/tenants" note="body: { name, quota_gb }" />
            <Row feature="List Sub-tenants"       tag="REST API"      call="GET  /redapi/v1/clusters/{cluster}/tenants/{tenant}/subtenants" />
            <Row feature="Create Sub-tenant"      tag="REST API"      call="POST /redapi/v1/clusters/{cluster}/tenants/{tenant}/subtenants" />
            <Row feature="Create Tenant User"     tag="SSH + redcli"  call="redcli user add &lt;user&gt; -t &lt;tenant&gt;" note="REST API only creates realm users — tenant S3 users require redcli" />
            <Row feature="Generate S3 Keys"       tag="SSH + redcli"  call="redcli s3 access add &lt;user&gt; -t &lt;tenant&gt; -e 1y" note="REST API s3/access endpoint fails with date format errors" />
            <Row feature="Register S3 Service"    tag="SSH + redcli"  call="redcli service create &lt;name&gt; -T file-and-object -P s3 -t &lt;tenant&gt; -s &lt;subtenant&gt; -V &lt;vhost&gt; -A &lt;user&gt;" note="-A flag required to register user in S3 daemon" />
            <Row feature="Register DNS (WSL)"     tag="SSH + redcli"  call={'echo "admin" | sudo -S tee -a /etc/hosts'} note="Required so boto3 can resolve per-tenant virtual host endpoints" />
            <Row feature="Cluster / Node Info"    tag="REST API"      call="GET /redapi/v1/version   GET /redapi/v1/clusters/{cluster}/nodes" />
            <Row feature="User Listing (realm)"   tag="REST API"      call="GET /redapi/v1/user" />
            <Row feature="User Listing (S3)"      tag="SSH + redcli"  call="redcli s3 access list -t &lt;tenant&gt; -a" note="Tenant users are invisible in the REST API user list" />
          </tbody>
        </table>
      </div>

      {/* Data Plane table */}
      <div style={{ background:'var(--surface-card)', borderRadius:14, padding:24, border:'1px solid var(--border-subtle)' }}>
        <h2 style={{ margin:'0 0 16px', fontSize:15, fontWeight:700, color:'var(--text-primary)' }}>Data Plane Operations — S3 / boto3</h2>
        <table style={{ width:'100%', borderCollapse:'collapse' as const }}>
          <thead>
            <tr style={{ borderBottom:'2px solid var(--border-subtle)' }}>
              <th style={{ padding:'0 16px 10px 0', textAlign:'left' as const, fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase' as const }}>Feature</th>
              <th style={{ padding:'0 12px 10px 0', textAlign:'left' as const, fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase' as const }}>Mechanism</th>
              <th style={{ padding:'0 0 10px', textAlign:'left' as const, fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase' as const }}>boto3 Call</th>
            </tr>
          </thead>
          <tbody>
            <Row feature="Create Bucket"       tag="S3 / boto3" call="s3.create_bucket(Bucket=name, ObjectLockEnabledForBucket=True)" />
            <Row feature="List Buckets"        tag="S3 / boto3" call="s3.list_buckets()" />
            <Row feature="Upload Object"       tag="S3 / boto3" call="s3.upload_fileobj(file_obj, bucket, key)" />
            <Row feature="List Objects"        tag="S3 / boto3" call="s3.list_objects_v2(Bucket=bucket, Prefix=prefix)" />
            <Row feature="Download Object"     tag="S3 / boto3" call="s3.get_object(Bucket=bucket, Key=key)" />
            <Row feature="Delete Object"       tag="S3 / boto3" call="s3.delete_object(Bucket=bucket, Key=key, VersionId=vid)" note="VersionId required — without it, delete only creates a marker (WORM not triggered)" />
            <Row feature="Object Metadata"     tag="S3 / boto3" call="s3.head_object(Bucket=bucket, Key=key)" note="Returns VersionId, ETag, ContentType, ContentLength" />
            <Row feature="Set Bucket Lock"     tag="S3 / boto3" call="s3.put_object_lock_configuration(Bucket=b, ObjectLockConfiguration={...})" />
            <Row feature="Set Object Retention" tag="S3 / boto3" call="s3.put_object_retention(Bucket=b, Key=k, Retention={Mode, RetainUntilDate})" />
            <Row feature="Bypass GOVERNANCE"   tag="S3 / boto3" call="s3.delete_object(..., BypassGovernanceRetention=True)" note="Only GOVERNANCE mode can be bypassed — COMPLIANCE cannot" />
            <Row feature="Presigned URL"       tag="S3 / boto3" call="s3.generate_presigned_url('get_object' | 'put_object', Params={...}, ExpiresIn=N)" />
            <Row feature="Lifecycle Policy"    tag="S3 / boto3" call="s3.put_bucket_lifecycle_configuration(Bucket=b, LifecycleConfiguration={Rules:[...]})" />
            <Row feature="CORS"                tag="S3 / boto3" call="s3.put_bucket_cors(Bucket=b, CORSConfiguration={CORSRules:[...]})" />
            <Row feature="Multipart Upload"    tag="S3 / boto3" call="s3.create_multipart_upload → upload_part → complete_multipart_upload" />
            <Row feature="Benchmark (PUT)"     tag="S3 / boto3" call="s3.put_object(Bucket=b, Key=k, Body=payload)" />
            <Row feature="Benchmark (GET)"     tag="S3 / boto3" call="s3.get_object(Bucket=b, Key=k)" />
          </tbody>
        </table>
      </div>

      {/* S3 Routing note */}
      <div style={{ padding:'14px 18px', borderRadius:10, border:'1px solid '+S3+'30', background:S3+'08', fontSize:13, color:'var(--text-muted)' }}>
        <span style={{ fontWeight:700, color:S3 }}>S3 Endpoint Routing: </span>
        Default tenant (red) uses bare IP <code style={{ fontFamily:'monospace', fontSize:12 }}>https://<infinia-server-ip>:8111</code>.
        All other tenants use virtual-hosted style <code style={{ fontFamily:'monospace', fontSize:12 }}>https://s3.&lt;tenant&gt;.infinia.io:8111</code>
        — requires a matching entry in WSL <code style={{ fontFamily:'monospace', fontSize:12 }}>/etc/hosts</code> for boto3 to resolve the hostname.
      </div>

    </div>
  )
}
