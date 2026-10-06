# DDN Infinia Multi-Tenant Bulk Provisioning with Ansible

Enterprise-ready Infrastructure-as-Code (IaC) automation for Cloud Builders and NVIDIA Cloud Partner (NCP) environments running **DDN Infinia 2.4.0+**.

---

## 🎯 What This Playbook Automates

Infinia S3 tenant onboarding requires orchestrating both the **Management Control Plane** (REST API) and the **Storage Data Plane** (SSH CLI). This playbook automates the entire multi-tenant lifecycle in a single execution:

```mermaid
flowchart TD
    A[vars/tenants.yml] --> B[infinia_bulk_provision.yml]
    B --> C[Phase 1: REST API]
    C -->|POST /clusters/{c}/tenants| D[Create Tenants & Subtenants]
    B --> E[Phase 2: SSH + redcli]
    E -->|redcli user add -t| F[Register S3 Tenant Users]
    E -->|redcli s3 access add| G[Generate S3 Keys]
    E -->|redcli service create| H[Create vHost S3 Services]
    B --> I[Phase 3: Client Output]
    I --> J[s3_credentials_output.json]
    I --> K[vHost DNS / /etc/hosts]
```

---

## 📁 Directory Structure

```text
automation/ansible/
├── inventory.ini.example          # Template for cluster IP & credentials
├── inventory.ini                  # Active cluster inventory (gitignored)
├── infinia_bulk_provision.yml     # Complete 3-phase Ansible playbook
├── README.md                      # This documentation
└── vars/
    └── tenants.yml                # Declarative tenant definitions
```

---

## 🚀 Quickstart

### 1. Prerequisites
- Python 3.9+ and Ansible 2.14+ (`pip install ansible-core`)
- Network connectivity to Infinia Management IP (Port 443 & Port 22)
- Target S3 Port (Port 8111)

### 2. Configure Inventory
Copy the example file and update with your cluster details:
```bash
cp inventory.ini.example inventory.ini
```

Edit `inventory.ini`:
```ini
[infinia_nodes]
infinia-01 ansible_host=192.168.1.100

[infinia_nodes:vars]
ansible_user=YOUR_SSH_USER
ansible_password=YOUR_SSH_PASSWORD
mgmt_server=192.168.1.100
mgmt_user=realm_admin
mgmt_password=YOUR_MGMT_PASSWORD
s3_port=8111
```

### 3. Define Your Tenants in `vars/tenants.yml`
```yaml
tenants:
  - name: "devops"
    admin: "devops-admin"
    admin_password: "DDN@Infinia2024!"
    s3_expiry: "1y"
    subtenants:
      - name: "ci-cd"
        users:
          - username: "jenkins-bot"
            scope: "service-user"
  - name: "research"
    admin: "research-admin"
    admin_password: "DDN@Infinia2024!"
    s3_expiry: "1y"
    subtenants:
      - name: "ml-training"
        users:
          - username: "pytorch-runner"
            scope: "service-user"
```

### 4. Run the Playbook
```bash
ansible-playbook -i inventory.ini infinia_bulk_provision.yml -e @vars/tenants.yml
```

---

## 📋 Outputs & Artifacts

After completion, the playbook outputs `s3_credentials_output.json`:
```json
[
  {
    "tenant": "devops",
    "admin_user": "devops-admin",
    "s3_key": "EXAMPLEKEY12345",
    "s3_secret": "EXAMPLESECRET67890",
    "vhost": "s3.devops.infinia.io",
    "service_name": "devopsobj",
    "endpoint": "https://s3.devops.infinia.io:8111"
  }
]
```

### Client Workstation DNS
Add the generated entries to `/etc/hosts` on client machines accessing the S3 service:
```text
192.168.147.129  s3.devops.infinia.io
192.168.147.129  s3.research.infinia.io
```

---

## 🔄 Integration with Infinia Web UI

Tenants provisioned via this Ansible playbook are **immediately reflected live** in the Infinia Object Store Validator Web UI:
- **Tenant Manager:** Shows newly created tenants, quotas, and subtenants.
- **Storage Explorer:** Lets you select the new tenant namespace and browse S3 buckets.
- **Tenant Isolation Proof:** Ready to verify cross-tenant data separation live.
