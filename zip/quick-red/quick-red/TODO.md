# Quick-Red Implementation TODO List

## Authentication
- [x] auth-login - Authenticate and obtain a token
- [x] auth-token - Display the current token
- [x] auth-grant - Grant RED capabilities to a user

## Tenant Management
- [x] tenant-list - Show tenants summary
- [x] tenant-create - Create a new tenant
- [x] tenant-update - Update tenant properties
- [ ] tenant-delete - Delete a tenant
- [x] subtenant-list - Show subtenants summary
- [x] subtenant-create - Create a new subtenant
- [ ] subtenant-delete - Delete a subtenant

## User Management
- [x] user-list - List users summary
- [x] user-create - Create a new user
- [x] user-update - Update a user
- [ ] user-delete - Delete a user

## Dataset Management
- [ ] dataset-create - Create a new dataset
  - Required parameters:
    - `-tenant` - Tenant name
    - `-subtenant` - Subtenant name
    - `-name` - Dataset name
    - `-type` - Dataset type (block, s3, or posix)
    - `-quota` - Optional quota (e.g. 100m)
  - Example: `dataset-create -tenant marvel -subtenant avengers -name avengers-block -type block -quota 100m`

## Dataservice Management
- [ ] dataservice-create - Create a new dataservice
  - Required parameters:
    - `-tenant` - Tenant name
    - `-subtenant` - Subtenant name
    - `-dataset` - Dataset name
    - `-name` - Service name
    - `-type` - Service type (file-and-object or block)
    - `-protocol` - Protocol type (csi, cinder for block; file-and-object for s3)
  - Example: `dataservice-create -tenant marvel -subtenant avengers -dataset avengers-block -name avengers-block-service -type block -protocol csi`

## S3 Management
- [x] s3-list - Show S3 access summary
- [x] s3-endpoint-list - List S3 endpoints

## System Information
- [x] cluster-list - Display clusters summary
- [x] node-list - Display nodes summary
- [x] drive-list - Show drives summary
- [x] drive-list-by-node - Show drives grouped by node
- [x] drive-summary - Display detailed drive summary
- [x] network-list - Show network summary
- [x] network-group-list - Display network groups
- [x] control-ip-list - Display control IPs summary
- [x] hsn-ip-list - Show HSN IPs summary

## Realm Management
- [x] realm-list - Show realm summary

## Miscellaneous
- [x] swagger-show - Show Swagger UI URL
- [x] version-show - Display version information
- [x] fox-show - Display ASCII art fox

## Implementation Notes

### Dataset Types
- block: For block storage
- s3: For object storage
- posix: For file system storage

### Service Types
- file-and-object: For S3 datasets
- block: For block datasets

### Service Protocols
- csi: For block datasets
- cinder: For block datasets
- file-and-object: For S3 datasets

### User Scopes
- [realm]:admin - Realm administrator
- [realm]:viewer - Realm viewer
- tenant:admin - Tenant level administrator
- tenant:viewer - Tenant level viewer
- tenant/subtenant:service-user - Access to all data services for subtenant
- tenant/subtenant/dataservice:service-user - Access to specific data service 