import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { FileUp, Download, CheckCircle, AlertCircle, Loader, XCircle, Play, Terminal, Copy, Code, Layers } from 'lucide-react'
import { previewImport } from '../../services/adminApi'

const TYPE_COLORS: Record<string, string> = {
  tenant: '#ED2738', subtenant: '#6366F1', user: '#0EA5E9'
}

const YAML_TEMPLATE = `# DDN Infinia — Bulk Provision Template
# Edit tenant/subtenant/user names, then Import & Provision

user_default_password: "DDN@Infinia2024!"

tenants:

  my-team:
    admin: "my-team-admin"
    s3_dataset: "my-team-s3"
    s3_service: "my-team-obj"
    subtenants:
      dev:
        users:
          - "dev-user-01"
          - "dev-user-02"
      prod:
        users:
          - "prod-user-01"
`

const CSV_TEMPLATE = `tenant,subtenant,username,scope,default_password
my-team,dev,dev-user-01,service-user,DDN@Infinia2024!
my-team,dev,dev-user-02,service-user,DDN@Infinia2024!
my-team,prod,prod-user-01,service-user,DDN@Infinia2024!
`

const ANSIBLE_PLAYBOOK_STATIC = `---
# ==============================================================================
# DDN INFINIA MULTI-TENANT BULK PROVISIONING PLAYBOOK
# ==============================================================================
# 1. Control Plane (REST API): Authenticate, discover cluster, create tenants & subtenants
# 2. Data Plane (SSH/redcli): Create S3 tenant users, generate S3 access keys, create S3 services
# 3. Client Output: Export S3 credentials and vHost DNS entries
#
# Usage:
#   ansible-playbook -i inventory.ini infinia_bulk_provision.yml -e @vars/tenants.yml
# ==============================================================================

- name: "Phase 1: Control Plane — Authenticate & Create Tenants via REST API"
  hosts: localhost
  gather_facts: false
  vars_files:
    - vars/tenants.yml

  tasks:
    - name: "1.1 Authenticate with Infinia Management REST API"
      ansible.builtin.uri:
        url: "https://{{ hostvars['infinia-01']['mgmt_server'] }}:{{ hostvars['infinia-01']['mgmt_port'] | default(443) }}/redapi/v1/auth_user"
        method: GET
        headers:
          User_id: "{{ hostvars['infinia-01']['mgmt_user'] }}"
          Password: "{{ hostvars['infinia-01']['mgmt_password'] }}"
        validate_certs: "{{ hostvars['infinia-01']['mgmt_validate_certs'] | default(false) }}"
        status_code: [200]
      register: auth_resp

    - name: "1.2 Set Auth Token"
      ansible.builtin.set_fact:
        mgmt_token: "{{ auth_resp.json.data.token }}"

    - name: "1.3 Discover Infinia Cluster ID"
      ansible.builtin.uri:
        url: "https://{{ hostvars['infinia-01']['mgmt_server'] }}:{{ hostvars['infinia-01']['mgmt_port'] | default(443) }}/redapi/v1/clusters"
        method: GET
        headers:
          Authorization: "Bearer {{ mgmt_token }}"
        validate_certs: "{{ hostvars['infinia-01']['mgmt_validate_certs'] | default(false) }}"
        status_code: [200]
      register: clusters_resp

    - name: "1.4 Resolve Primary Cluster Name"
      ansible.builtin.set_fact:
        cluster_id: >-
          {{
            clusters_resp.json.data.keys() | list | first
            if (clusters_resp.json.data is mapping)
            else (clusters_resp.json.data[0].name | default(clusters_resp.json.data[0]))
          }}

    - name: "1.5 Provision Tenants via REST API"
      ansible.builtin.uri:
        url: "https://{{ hostvars['infinia-01']['mgmt_server'] }}:{{ hostvars['infinia-01']['mgmt_port'] | default(443) }}/redapi/v1/clusters/{{ cluster_id }}/tenants"
        method: POST
        headers:
          Authorization: "Bearer {{ mgmt_token }}"
          Content-Type: "application/json"
        body_format: json
        body:
          name: "{{ item.name }}"
          xattrs:
            RED_INTERNAL:
              primary-admin: "{{ item.admin }}"
        validate_certs: "{{ hostvars['infinia-01']['mgmt_validate_certs'] | default(false) }}"
        status_code: [200, 201, 409]
      loop: "{{ tenants }}"
      register: tenant_create_resp
      changed_when: tenant_create_resp.status in [200, 201]

    - name: "1.6 Provision Subtenants via REST API"
      ansible.builtin.uri:
        url: "https://{{ hostvars['infinia-01']['mgmt_server'] }}:{{ hostvars['infinia-01']['mgmt_port'] | default(443) }}/redapi/v1/clusters/{{ cluster_id }}/tenants/{{ item.0.name }}/subtenants"
        method: POST
        headers:
          Authorization: "Bearer {{ mgmt_token }}"
          Content-Type: "application/json"
        body_format: json
        body:
          name: "{{ item.1.name }}"
          xattrs: {}
        validate_certs: "{{ hostvars['infinia-01']['mgmt_validate_certs'] | default(false) }}"
        status_code: [200, 201, 409]
      loop: "{{ tenants | subelements('subtenants', skip_missing=true) }}"
      register: subtenant_create_resp
      changed_when: subtenant_create_resp.status in [200, 201]

- name: "Phase 2: Data Plane — S3 Users, Keys & Virtual-Hosted Services"
  hosts: infinia_nodes
  gather_facts: false
  vars_files:
    - vars/tenants.yml

  tasks:
    - name: "2.1 Register S3 Admin Users in Tenant S3 Daemon Store"
      ansible.builtin.command: >
        redcli user add {{ item.admin }} -t {{ item.name }} -p '{{ item.admin_password | default(default_user_password) }}'
      loop: "{{ tenants }}"
      register: s3_user_res
      changed_when: "'has been added' in s3_user_res.stdout"
      failed_when:
        - s3_user_res.rc != 0
        - "'already exists' not in s3_user_res.stdout and 'already exists' not in s3_user_res.stderr"

    - name: "2.2 Grant Subtenant Scope to S3 Admin Users"
      ansible.builtin.command: >
        redcli user grant {{ item.admin }} {{ item.name }}/{{ item.subtenants[0].name | default(item.name) }}
      loop: "{{ tenants }}"
      failed_when: false

    - name: "2.3 Generate S3 Access Keys for Each Tenant"
      ansible.builtin.shell: >
        redcli user login {{ mgmt_user }} -p '{{ mgmt_password }}' ;
        redcli s3 access add {{ item.admin }} -t {{ item.name }} -e {{ item.s3_expiry | default(default_s3_expiry) }}
      loop: "{{ tenants }}"
      register: s3_key_raw

    - name: "2.4 Parse Generated S3 Access Keys"
      ansible.builtin.set_fact:
        s3_credentials: >-
          {{
            s3_credentials | default([]) + [
              {
                'tenant': item.item.name,
                'admin_user': item.item.admin,
                's3_key': (item.stdout | regex_search('S3_KEY\\s*│\\s*(\\S+)', '\\1') | first | default('')),
                's3_secret': (item.stdout | regex_search('S3_SECRET\\s*│\\s*(\\S+)', '\\1') | first | default('')),
                'vhost': 's3.' ~ item.item.name ~ '.' ~ (s3_vhost_domain | default('infinia.io')),
                'service_name': item.item.name ~ (s3_service_suffix | default('obj')),
                'endpoint': 'https://s3.' ~ item.item.name ~ '.' ~ (s3_vhost_domain | default('infinia.io')) ~ ':' ~ (s3_port | default('8111'))
              }
            ]
          }}
      loop: "{{ s3_key_raw.results }}"

    - name: "2.5 Create Virtual-Hosted S3 Services"
      ansible.builtin.command: >
        redcli service create {{ item.name }}{{ s3_service_suffix | default('obj') }}
        -T file-and-object -P s3
        -t {{ item.name }} -s {{ item.subtenants[0].name | default(item.name) }}
        -V s3.{{ item.name }}.{{ s3_vhost_domain | default('infinia.io') }}
        -A {{ item.admin }}
      loop: "{{ tenants }}"
      register: s3_svc_res
      changed_when: "'added' in s3_svc_res.stdout.lower()"
      failed_when:
        - s3_svc_res.rc != 0
        - "'already exists' not in s3_svc_res.stdout.lower() and 'already exists' not in s3_svc_res.stderr.lower()"

- name: "Phase 3: Client Output — Export S3 Credentials & DNS Records"
  hosts: localhost
  gather_facts: false
  tasks:
    - name: "3.1 Save S3 Credentials to JSON File"
      ansible.builtin.copy:
        content: "{{ hostvars['infinia-01']['s3_credentials'] | to_nice_json }}"
        dest: "s3_credentials_output.json"
        mode: "0600"
`

const ANSIBLE_INVENTORY_STATIC = `[infinia_nodes]
infinia-01 ansible_host=192.168.1.100

[infinia_nodes:vars]
ansible_user=YOUR_SSH_USER
ansible_password=YOUR_SSH_PASSWORD
ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'
ansible_python_interpreter=/usr/bin/python3

mgmt_server=192.168.1.100
mgmt_port=443
mgmt_user=realm_admin
mgmt_password=YOUR_MGMT_PASSWORD
mgmt_validate_certs=false

s3_port=8111
s3_service_suffix=obj
s3_vhost_domain=infinia.io
`

type Format = 'yaml' | 'csv'
type Status = 'idle' | 'previewing' | 'provisioning' | 'done'
interface SSEEvent { step: string; name: string; status: string; message: string; detail?: string }

const STEP_COLORS: Record<string, string> = {
  'tenant-create': '#ED2738', 'subtenant-create': '#6366F1', 'user-create': '#0EA5E9',
  's3-user': '#F59E0B', 's3-access': '#F59E0B', 's3-service': '#10B981',
  'hosts': '#8B5CF6', 'config': '#10B981', 'init': '#6366F1', 'done': '#00C280',
}

function StepIcon({ status }: { status: string }) {
  if (status === 'running') return <Loader size={15} color="#F59E0B" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
  if (status === 'success') return <CheckCircle size={15} color="#00C280" style={{ flexShrink: 0 }} />
  if (status === 'skipped') return <CheckCircle size={15} color="#6366F1" style={{ flexShrink: 0 }} />
  if (status === 'failed') return <XCircle size={15} color="#ED2738" style={{ flexShrink: 0 }} />
  return <div style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid var(--border-subtle)', flexShrink: 0 }} />
}

function generateAnsibleVars(rawContent: string, format: Format, s3Expiry = '1y'): string {
  if (!rawContent.trim()) {
    return `# ── Infinia Declarative Tenants (Default Sample) ──
default_user_password: "DDN@Infinia2024!"
default_s3_expiry: "${s3Expiry}"

tenants:
  - name: "devops"
    admin: "devops-admin"
    admin_password: "DDN@Infinia2024!"
    s3_expiry: "${s3Expiry}"
    subtenants:
      - name: "ci-cd"
        users:
          - username: "jenkins-bot"
            scope: "service-user"
          - username: "deployer"
            scope: "service-user"
      - name: "staging"
        users:
          - username: "qa-lead"
            scope: "service-user"

  - name: "research"
    admin: "research-admin"
    admin_password: "DDN@Infinia2024!"
    s3_expiry: "${s3Expiry}"
    subtenants:
      - name: "ml-training"
        users:
          - username: "pytorch-runner"
            scope: "service-user"
`
  }

  if (format === 'csv') {
    const lines = rawContent.trim().split('\n')
    const header = lines[0].split(',').map(s => s.trim().toLowerCase())
    const tIdx = header.indexOf('tenant')
    const stIdx = header.indexOf('subtenant')
    const uIdx = header.indexOf('username')
    const scIdx = header.indexOf('scope')
    const pwIdx = header.indexOf('default_password')

    const tenantsMap: Record<string, { admin: string; pw: string; subtenants: Record<string, any[]> }> = {}

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(s => s.trim())
      if (!row || row.length === 0 || !row[0]) continue
      const t = tIdx >= 0 ? row[tIdx] : row[0]
      const st = stIdx >= 0 ? row[stIdx] : row[1]
      const user = uIdx >= 0 ? row[uIdx] : row[2]
      const sc = scIdx >= 0 ? row[scIdx] : 'service-user'
      const pw = pwIdx >= 0 && row[pwIdx] ? row[pwIdx] : 'DDN@Infinia2024!'

      if (!t) continue
      if (!tenantsMap[t]) {
        tenantsMap[t] = { admin: `${t}-admin`, pw, subtenants: {} }
      }
      if (st) {
        if (!tenantsMap[t].subtenants[st]) tenantsMap[t].subtenants[st] = []
        if (user) {
          tenantsMap[t].subtenants[st].push({ username: user, scope: sc || 'service-user' })
        }
      }
    }

    let yml = `# ── Generated from CSV for Ansible Playbook ──\ndefault_user_password: "DDN@Infinia2024!"\ndefault_s3_expiry: "${s3Expiry}"\n\ntenants:\n`
    for (const [tname, tdata] of Object.entries(tenantsMap)) {
      yml += `  - name: "${tname}"\n`
      yml += `    admin: "${tdata.admin}"\n`
      yml += `    admin_password: "${tdata.pw}"\n`
      yml += `    s3_expiry: "${s3Expiry}"\n`
      yml += `    subtenants:\n`
      for (const [stname, users] of Object.entries(tdata.subtenants)) {
        yml += `      - name: "${stname}"\n`
        if (users.length > 0) {
          yml += `        users:\n`
          for (const u of users) {
            yml += `          - username: "${u.username}"\n`
            yml += `            scope: "${u.scope}"\n`
          }
        }
      }
    }
    return yml
  }

  return `# ── Generated from YAML for Ansible Playbook ──\ndefault_user_password: "DDN@Infinia2024!"\ndefault_s3_expiry: "${s3Expiry}"\n\n` + rawContent.trim()
}

export default function CSVImport({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  // Mode switcher: 'web' (default existing UI) vs 'ansible' (IaC Automation)
  const [viewMode, setViewMode] = useState<'web' | 'ansible'>('web')
  const [ansibleTab, setAnsibleTab] = useState<'vars' | 'playbook' | 'inventory' | 'quickstart'>('vars')

  const [format, setFormat] = useState<Format>('yaml')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [plan, setPlan] = useState<any[]>([])
  const [tenantCount, setTenantCount] = useState(0)
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [dragging, setDragging] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [summary, setSummary] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  // ── Full provision mode ──────────────────────────────────────────
  const [fullProvision, setFullProvision] = useState(false)
  const [s3Config, setS3Config] = useState({
    s3_service_suffix: 'obj',
    s3_vhost_template: 's3.{tenant}.infinia.io',
    s3_admin_suffix: 'admin',
    s3_expiry: '1y',
  })
  const setS3 = (k: string, v: string) => setS3Config(prev => ({ ...prev, [k]: v }))

  const downloadTemplate = (fmt: Format) => {
    const text = fmt === 'yaml' ? YAML_TEMPLATE : CSV_TEMPLATE
    const ext = fmt === 'yaml' ? 'yaml' : 'csv'
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `infinia_template.${ext}`; a.click()
  }

  const handleFile = (file: File) => {
    const isCSV = file.name.endsWith('.csv')
    if (isCSV) setFormat('csv')
    else setFormat('yaml')
    const reader = new FileReader()
    reader.onload = e => setContent(e.target?.result as string || '')
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]; if (file) handleFile(file)
  }

  const browseFile = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.yaml,.yml,.csv'
    i.onchange = (e: any) => handleFile(e.target.files[0]); i.click()
  }

  const doPreview = async () => {
    if (!content.trim()) return toast.error('Paste content or upload a file first')
    setStatus('previewing'); setPlan([]); setEvents([]); setIsDone(false)
    try {
      const r = await previewImport(content, format)
      setPlan(r.data.plan || [])
      setTenantCount(r.data.tenant_count || 0)
      setStatus('idle')
      toast.success(`Preview ready — ${r.data.tenant_count} tenants, ${r.data.total} total resources`)
    } catch (e: any) {
      setStatus('idle')
      toast.error(e.response?.data?.detail || 'Parse failed — check format')
    }
  }

  const doProvision = async () => {
    if (!content.trim()) return toast.error('No content to provision')
    setStatus('provisioning'); setEvents([]); setIsDone(false); setSummary('')
    try {
      const res = await fetch('/api/admin/wizard/bulk-provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content, format,
          full_provision: fullProvision,
          ...(fullProvision ? s3Config : {}),
        }),
      })
      const reader = res.body!.getReader(); const dec = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        for (const line of dec.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev: SSEEvent = JSON.parse(line.slice(6))
            setEvents(prev => [...prev, ev])
            if (ev.step === 'done') {
              setIsDone(true); setSummary(ev.message)
              setStatus('done')
            }
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
          } catch {}
        }
      }
    } catch (e: any) {
      setStatus('idle')
      toast.error('Provisioning stream failed: ' + e.message)
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied to clipboard!`))
  }

  const downloadTextFile = (filename: string, text: string) => {
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    toast.success(`Downloaded ${filename}`)
  }

  const hasPreview = plan.length > 0
  const isProvisioning = status === 'provisioning'
  const generatedAnsibleVars = generateAnsibleVars(content, format, s3Config.s3_expiry)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px 0' }}>Multi-Tenant Bulk Provisioning</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Provision <strong>multiple tenants</strong>, subtenants, and users via Web Stream or automated <strong>Ansible IaC Playbook</strong>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {viewMode === 'web' && (
            <>
              <button onClick={() => downloadTemplate('yaml')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 7, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
                <Download size={13} /> YAML Template
              </button>
              <button onClick={() => downloadTemplate('csv')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 7, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>
                <Download size={13} /> CSV Template
              </button>
            </>
          )}
          <button
            onClick={() => setViewMode(v => v === 'web' ? 'ansible' : 'web')}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px',
              background: viewMode === 'ansible' ? '#0D9488' : 'linear-gradient(135deg, rgba(13,148,136,0.15) 0%, rgba(237,39,56,0.15) 100%)',
              border: '1px solid ' + (viewMode === 'ansible' ? '#0D9488' : '#0D948860'),
              borderRadius: 8, color: viewMode === 'ansible' ? 'white' : 'var(--text-primary)',
              cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
            }}>
            <Terminal size={14} color={viewMode === 'ansible' ? 'white' : '#0D9488'} />
            {viewMode === 'ansible' ? 'Back to Web Provisioning' : 'Ansible IaC Export'}
          </button>
        </div>
      </div>

      {/* Top Mode Bar */}
      <div style={{ display: 'flex', gap: 8, background: 'var(--surface-card)', padding: '5px', borderRadius: 10, border: '1px solid var(--border-subtle)', width: 'fit-content' }}>
        <button
          onClick={() => setViewMode('web')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px', borderRadius: 7,
            background: viewMode === 'web' ? '#ED2738' : 'transparent', border: 'none',
            color: viewMode === 'web' ? 'white' : 'var(--text-muted)',
            fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
          }}>
          <Play size={13} /> Web Direct (Live SSE Stream)
        </button>
        <button
          onClick={() => setViewMode('ansible')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px', borderRadius: 7,
            background: viewMode === 'ansible' ? '#0D9488' : 'transparent', border: 'none',
            color: viewMode === 'ansible' ? 'white' : 'var(--text-muted)',
            fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
          }}>
          <Terminal size={13} /> Ansible IaC Automation (CLI / CI/CD)
        </button>
      </div>

      {/* ==================================================================== */}
      {/* VIEW MODE 1: WEB DIRECT PROVISIONING (Original 100% Preserved)        */}
      {/* ==================================================================== */}
      {viewMode === 'web' && (
        <>
          {/* Format selector */}
          <div style={{ display: 'flex', gap: 8 }}>
            {(['yaml', 'csv'] as Format[]).map(f => (
              <button key={f} onClick={() => setFormat(f)}
                style={{ padding: '8px 20px', background: format === f ? '#ED2738' : 'var(--surface-hover)', border: `1px solid ${format === f ? '#ED2738' : 'var(--border-subtle)'}`, borderRadius: 8, color: format === f ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: 13, textTransform: 'uppercase' }}>
                {f}
              </button>
            ))}
          </div>

          {/* Drop zone */}
          <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
            onDrop={handleDrop} onClick={browseFile}
            style={{ border: `2px dashed ${dragging ? '#ED2738' : 'var(--border-subtle)'}`, borderRadius: 12, padding: '28px 24px', textAlign: 'center', cursor: 'pointer', background: dragging ? '#ED273808' : 'var(--surface-card)', transition: 'all 0.15s' }}>
            <FileUp size={26} color={dragging ? '#ED2738' : 'var(--text-muted)'} style={{ marginBottom: 8 }} />
            <div style={{ fontWeight: 500, marginBottom: 4 }}>Drop {format.toUpperCase()} file here or click to browse</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Accepts .yaml, .yml, .csv</div>
          </div>

          {/* Textarea */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Or paste {format.toUpperCase()} directly</label>
            <textarea value={content} onChange={e => { setContent(e.target.value); setPlan([]); setEvents([]); setIsDone(false) }}
              placeholder={format === 'yaml' ? YAML_TEMPLATE : CSV_TEMPLATE}
              style={{ width: '100%', height: 200, padding: 14, borderRadius: 10, border: '1px solid var(--border-subtle)', background: '#0d1117', color: '#e6edf3', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          {/* ── Provision Mode Toggle ──────────────────────────────── */}
          <div style={{ background: 'var(--surface-card)', border: `1px solid ${fullProvision ? '#10B98140' : 'var(--border-subtle)'}`, borderRadius: 12, padding: '16px 20px', transition: 'border-color 0.2s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => setFullProvision(p => !p)}>
              <div style={{ width: 44, height: 24, borderRadius: 12, background: fullProvision ? '#10B981' : 'var(--surface-hover)', border: '1px solid var(--border-subtle)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                <div style={{ position: 'absolute', top: 3, left: fullProvision ? 22 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: fullProvision ? '#10B981' : 'var(--text-primary)' }}>
                  Full End-to-End Provisioning
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {fullProvision
                    ? 'Will also create S3 users, generate access keys, register S3 service, update DNS, and save credentials — same as Provision Wizard.'
                    : 'Currently: creates tenants, subtenants, and realm users only.'}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                {(fullProvision
                  ? [['Tenant', '#ED2738'], ['Subtenant', '#6366F1'], ['User', '#0EA5E9'], ['S3 User', '#F59E0B'], ['S3 Keys', '#F59E0B'], ['S3 Service', '#10B981'], ['DNS', '#8B5CF6'], ['Credentials', '#10B981']]
                  : [['Tenant', '#ED2738'], ['Subtenant', '#6366F1'], ['User', '#0EA5E9']]
                ).map(([label, color]) => (
                  <span key={label} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, padding: '2px 7px', borderRadius: 4, background: (color as string) + '18', color: color as string, border: '1px solid ' + (color as string) + '40' }}>{label}</span>
                ))}
              </div>
            </div>

            {fullProvision && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'S3 Service Name Suffix', key: 's3_service_suffix', ph: 'obj', hint: 'Service name = {tenant}{suffix}  e.g. redobj' },
                  { label: 'vHost Template', key: 's3_vhost_template', ph: 's3.{tenant}.infinia.io', hint: '{tenant} is replaced per tenant' },
                  { label: 'S3 Admin Username Suffix', key: 's3_admin_suffix', ph: 'admin', hint: 'Admin user = {tenant}-{suffix}  e.g. red-admin' },
                  { label: 'Key Expiry', key: 's3_expiry', ph: '1y', hint: '1y, 6m, 30d, never' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5 }}>{f.label}</label>
                    <input
                      value={(s3Config as any)[f.key]}
                      onChange={e => setS3(f.key, e.target.value)}
                      placeholder={f.ph}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--surface-primary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' as const }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{f.hint}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={doPreview} disabled={isProvisioning || status === 'previewing'}
              style={{ flex: 1, padding: '11px 0', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: isProvisioning ? 0.5 : 1 }}>
              {status === 'previewing' ? 'Parsing…' : 'Preview Plan'}
            </button>
            <button onClick={doProvision} disabled={isProvisioning || !content.trim()}
              style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', background: isProvisioning ? '#ED273880' : fullProvision ? '#10B981' : '#ED2738', border: 'none', borderRadius: 8, color: 'white', fontWeight: 700, fontSize: 15, cursor: isProvisioning ? 'not-allowed' : 'pointer' }}>
              {isProvisioning
                ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Provisioning…</>
                : <><Play size={16} /> {fullProvision ? 'Full Provision All Tenants' : 'Provision Tenants + Users'}</>}
            </button>
          </div>

          {/* Preview table */}
          {hasPreview && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <CheckCircle size={16} color="#00C280" />
                <span style={{ fontWeight: 600, fontSize: 15 }}>
                  {tenantCount} tenant{tenantCount !== 1 ? 's' : ''} · {plan.length} total resources
                </span>
              </div>
              <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden', maxHeight: 360, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0 }}>
                    <tr style={{ background: 'var(--surface-hover)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      {['Type', 'Name', 'Tenant', 'Subtenant'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {plan.map((p, i) => (
                      <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none', fontSize: 13 }}>
                        <td style={{ padding: '9px 16px' }}>
                          <span style={{ background: `${TYPE_COLORS[p.type] || '#888'}20`, color: TYPE_COLORS[p.type] || '#888', padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>{p.type}</span>
                        </td>
                        <td style={{ padding: '9px 16px', fontWeight: p.type === 'tenant' ? 700 : 400, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{p.name}</td>
                        <td style={{ padding: '9px 16px', color: 'var(--text-muted)' }}>{p.tenant || '—'}</td>
                        <td style={{ padding: '9px 16px', color: 'var(--text-muted)' }}>{p.subtenant || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, padding: '9px 14px', background: 'rgba(237,39,56,0.05)', border: '1px solid rgba(237,39,56,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                <AlertCircle size={14} color="#ED2738" />
                Existing resources will be skipped — no data will be overwritten.
              </div>
            </div>
          )}

          {/* Live provision log */}
          {events.length > 0 && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px 0' }}>
                {isProvisioning ? 'Provisioning in progress…' : isDone ? 'Provisioning complete' : 'Provision log'}
              </h3>
              <div ref={logRef} style={{ background: '#0d1117', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '14px 16px', maxHeight: 450, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {events.map((ev, i) => {
                  const stepColor = STEP_COLORS[ev.step] || '#888'
                  let keyData: { tenant?: string; user?: string; s3_key?: string; s3_secret?: string } | null = null
                  if (ev.step === 's3-access' && ev.status === 'success' && ev.detail) {
                    try { keyData = JSON.parse(ev.detail) } catch {}
                  }

                  const copyField = (val: string) => navigator.clipboard.writeText(val).then(() => toast.success('Copied!'))

                  return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      <StepIcon status={ev.status} />
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: stepColor + '20', color: stepColor, flexShrink: 0, marginTop: 1, textTransform: 'uppercase' as const }}>{ev.step}</span>
                      <div style={{ flex: 1 }}>
                        <span style={{ color: ev.status === 'success' ? '#00C280' : ev.status === 'failed' ? '#ED2738' : ev.status === 'skipped' ? '#6366F1' : '#F59E0B' }}>
                          {ev.message}
                        </span>
                        {ev.status === 'failed' && ev.detail && !keyData && (
                          <div style={{ fontSize: 11, color: '#EF444480', marginTop: 2 }}>{ev.detail.slice(0, 120)}</div>
                        )}
                      </div>
                    </div>

                    {keyData?.s3_key && (
                      <div style={{ marginLeft: 48, background: '#161b22', border: '1px solid #F59E0B40', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                            S3 Credentials — {keyData.tenant} / {keyData.user}
                          </span>
                          <button
                            onClick={() => copyField(`S3_KEY=${keyData!.s3_key}\nS3_SECRET=${keyData!.s3_secret}`)}
                            style={{ fontSize: 10, padding: '3px 8px', background: '#F59E0B20', border: '1px solid #F59E0B40', borderRadius: 4, color: '#F59E0B', cursor: 'pointer', fontWeight: 600 }}>
                            Copy All
                          </button>
                        </div>
                        {[
                          { label: 'Access Key', value: keyData.s3_key! },
                          { label: 'Secret Key', value: keyData.s3_secret!, mask: true },
                        ].map(({ label, value, mask }) => (
                          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 10, color: '#8b949e', width: 80, flexShrink: 0 }}>{label}</span>
                            <code style={{ flex: 1, fontSize: 11, color: '#e6edf3', background: '#0d1117', padding: '3px 8px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontFamily: 'var(--font-mono)' }}>
                              {mask ? value.slice(0, 6) + '••••••••••••••••••••••••••••••••••' + value.slice(-4) : value}
                            </code>
                            <button
                              onClick={() => copyField(value)}
                              style={{ fontSize: 10, padding: '3px 8px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>
                              Copy
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
              {isDone && summary && (
                <div style={{ marginTop: 12, padding: '14px 18px', background: summary.includes('errors') && !summary.includes('0 errors') ? '#ED273815' : '#00C28015', border: `1px solid ${summary.includes('errors') && !summary.includes('0 errors') ? '#ED273840' : '#00C28040'}`, borderRadius: 10 }}>
                  <div style={{ fontWeight: 600, color: summary.includes('errors') && !summary.includes('0 errors') ? '#ED2738' : '#00C280', marginBottom: 10 }}>{summary}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => onNavigate?.('admin-tenants')}
                      style={{ padding: '8px 16px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 7, color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                      View Tenants
                    </button>
                    {fullProvision && (
                      <button onClick={() => onNavigate?.('config')}
                        style={{ padding: '8px 16px', background: '#10B981', border: 'none', borderRadius: 7, color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                        Go to S3 Configuration →
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ==================================================================== */}
      {/* VIEW MODE 2: ANSIBLE IAC AUTOMATION (New Feature on Top)             */}
      {/* ==================================================================== */}
      {viewMode === 'ansible' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Banner */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(13,148,136,0.1) 0%, rgba(237,39,56,0.06) 100%)',
            border: '1px solid rgba(13,148,136,0.3)', borderRadius: 14, padding: '18px 22px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Terminal size={22} color="white" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>
                  Ansible IaC Automation Bundle
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Production-grade Infrastructure-as-Code for NCP DevOps teams. Automates Control Plane (REST API) + Data Plane (SSH/redcli) in a single declarative run.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  downloadTextFile('vars_tenants.yml', generatedAnsibleVars)
                  downloadTextFile('infinia_bulk_provision.yml', ANSIBLE_PLAYBOOK_STATIC)
                  downloadTextFile('inventory.ini', ANSIBLE_INVENTORY_STATIC)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                  background: '#0D9488', border: 'none', borderRadius: 8,
                  color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}>
                <Download size={14} /> Download All Ansible Files
              </button>
            </div>
          </div>

          {/* Quick Command Card */}
          <div style={{ background: '#0d1117', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CLI Command:</span>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#38bdf8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                ansible-playbook -i inventory.ini infinia_bulk_provision.yml -e @vars/tenants.yml
              </code>
            </div>
            <button
              onClick={() => copyToClipboard('ansible-playbook -i inventory.ini infinia_bulk_provision.yml -e @vars/tenants.yml', 'Command')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 6, color: '#e6edf3', fontSize: 12, cursor: 'pointer', flexShrink: 0,
              }}>
              <Copy size={12} /> Copy
            </button>
          </div>

          {/* Subtabs for Ansible Files */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'vars', label: 'vars/tenants.yml (Dynamic)', icon: Layers, badge: content.trim() ? 'From Current Input' : 'Sample' },
                { id: 'playbook', label: 'infinia_bulk_provision.yml', icon: Code },
                { id: 'inventory', label: 'inventory.ini', icon: Terminal },
                { id: 'quickstart', label: 'Architecture & Instructions', icon: CheckCircle },
              ].map(t => {
                const IconComp = t.icon
                const isActive = ansibleTab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setAnsibleTab(t.id as any)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px',
                      background: isActive ? 'var(--surface-card)' : 'transparent',
                      border: '1px solid ' + (isActive ? 'var(--border-subtle)' : 'transparent'),
                      borderRadius: 8, color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontWeight: isActive ? 600 : 500, fontSize: 13, cursor: 'pointer',
                    }}>
                    <IconComp size={14} color={isActive ? '#0D9488' : 'currentColor'} />
                    {t.label}
                    {t.badge && (
                      <span style={{ fontSize: 10, background: '#0D948820', color: '#0D9488', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                        {t.badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {ansibleTab !== 'quickstart' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    const text = ansibleTab === 'vars' ? generatedAnsibleVars : ansibleTab === 'playbook' ? ANSIBLE_PLAYBOOK_STATIC : ANSIBLE_INVENTORY_STATIC
                    copyToClipboard(text, ansibleTab)
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 6, fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <Copy size={12} /> Copy Code
                </button>
                <button
                  onClick={() => {
                    const name = ansibleTab === 'vars' ? 'tenants.yml' : ansibleTab === 'playbook' ? 'infinia_bulk_provision.yml' : 'inventory.ini'
                    const text = ansibleTab === 'vars' ? generatedAnsibleVars : ansibleTab === 'playbook' ? ANSIBLE_PLAYBOOK_STATIC : ANSIBLE_INVENTORY_STATIC
                    downloadTextFile(name, text)
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', borderRadius: 6, fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <Download size={12} /> Download
                </button>
              </div>
            )}
          </div>

          {/* Tab Content Display */}
          {ansibleTab === 'vars' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                This file is <strong>dynamically updated</strong> from whatever CSV or YAML you have in the Web Direct editor. Paste or upload any file in Web mode to transform it into Ansible variables instantly.
              </div>
              <pre style={{
                background: '#0d1117', color: '#e6edf3', padding: 16, borderRadius: 10,
                border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12,
                lineHeight: 1.6, maxHeight: 420, overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap',
              }}>
                {generatedAnsibleVars}
              </pre>
            </div>
          )}

          {ansibleTab === 'playbook' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                Complete 3-phase Ansible playbook. Handles REST API login & tenant creation, SSH command chaining for S3 tenant user stores, access key generation, and service registration.
              </div>
              <pre style={{
                background: '#0d1117', color: '#e6edf3', padding: 16, borderRadius: 10,
                border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12,
                lineHeight: 1.6, maxHeight: 420, overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap',
              }}>
                {ANSIBLE_PLAYBOOK_STATIC}
              </pre>
            </div>
          )}

          {ansibleTab === 'inventory' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                Infinia host inventory and control plane connection parameters. Matches your active Infinia cluster at <code>192.168.147.129</code>.
              </div>
              <pre style={{
                background: '#0d1117', color: '#e6edf3', padding: 16, borderRadius: 10,
                border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12,
                lineHeight: 1.6, maxHeight: 420, overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap',
              }}>
                {ANSIBLE_INVENTORY_STATIC}
              </pre>
            </div>
          )}

          {ansibleTab === 'quickstart' && (
            <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                How NCPs Integrate Ansible Bulk Provisioning
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                <div style={{ padding: '14px', background: 'var(--surface-hover)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontWeight: 700, color: '#0D9488', fontSize: 13, marginBottom: 4 }}>1. GitOps & Declarative Storage</div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Tenants are stored in version control (Git) in <code>vars/tenants.yml</code>. Any pull request creates, modifies, or provisions new tenant quotas automatically.
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--surface-hover)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontWeight: 700, color: '#6366F1', fontSize: 13, marginBottom: 4 }}>2. CI/CD Pipeline Automation</div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Trigger <code>ansible-playbook</code> directly from Jenkins, GitLab CI, or GitHub Actions runners when onboarding enterprise customers.
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--surface-hover)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontWeight: 700, color: '#10B981', fontSize: 13, marginBottom: 4 }}>3. Live Reflection in Web UI</div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Tenants provisioned via Ansible immediately appear in Storage Explorer, Tenant Manager, and Tenant Isolation proofs in this web interface.
                  </p>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600 }}>Playbook Location in Repository</h4>
                <code style={{ display: 'block', background: '#0d1117', color: '#10B981', padding: '10px 14px', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  automation/ansible/infinia_bulk_provision.yml
                </code>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
