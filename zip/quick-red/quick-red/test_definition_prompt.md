# Test Defintion for quick-red application

## Overview

This is the test plan for quick-red application.
Read everything in this document and then follow the Test Creation Plan, below.


## Infinia users

user
    -> scope

Users can be defined at multiple levels:
- at the top is a realm administrator; there can be multiple realm administrator
- there is, by default, a realm_admin username that is defined at Infinia installation time
- you can create multiple realm administrators

User scope
- scope defines the extent and nature of the user's access capability
- user scope strings are separated by commas
- valid scopes are: realm, tenant, and subtenant; they are defined as follows: 
    - [realm] - (including the square braces); defines realm-level access
    - tenant - defines tenant level access
    - tenant/subtenant - defines subtenant-specific level access
    - tenant/subtenant/dataservice - defines dataservice-specific level access
- value capabilties are: admin(default), viewer, data-access, service-user

Examples of scopes
- [realm]:admin - realm administrator
- [realm]:viewer - realm viewer
- blue - tenant level adminstrator for blue tenant
- blue:admin - also a tenant level administrator for blue tenant
- blue:viewer - tenant level viewer for blue tenant
- blue/blue-sub:service-user - access to all data services for subtenant blue-sub
- blue/blue-sub/blue-obj:service-user - access to blue-obj data service
- [realm],blue/blue-sub/blue-obj:service-user - realm administrator also with access to blue-obj data service

## Infinia Datasets and Services

tenant
    -> subtenant
        -> dataset
            -> service

Datasets are owned exclusively by subtenants of tenants.
- datasets have a flavour: block, s3, or posix
- datasets have an optional quota (e.g. 100m)

Services make Datasets avaialble through a protocol.
- services have a type: file-and-object or block
- services have a protocol: csi, cinder (both for block datasets); file-and-object (for s3 datasets)

## Test Data

See test_config.yaml for details.

The test file is organized as follows:
```
server:
  ip: <server_ip_address>
  realm:
    username: <realm_admin_username>
    password: <realm_admin_password>

user_default_password: <default_password>    

<tenant_name>:
    admin: <admin_name>
    s3_dataset: <s3_dataset_name>
    s3_service: <s3_service_name>
    subtenants:
        <subtenant_name>:
            block_dataset: <block_dataset_name>
            block_service: <block_service_name>
            users:
                - <username>
```

## Test Plan for Users

### Commands 

Exercise the following commands

Authentication Commands:
auth-login - Authenticate and obtain a token

Tenant Management Commands:
tenant-list - Show tenants summary
tenant-create - Create a new tenant
tenant-update - Update tenant properties
subtenant-list - Show subtenants summary
subtenant-create - Create a new subtenant

User Management Commands:
user-list - List users summary
user-create - Create a new user
user-update - Update a user

S3 Management Commands:
s3-list - Show S3 access summary
s3-endpoint-list - List S3 endpoints

### Plan outline

Rules:
- we're going to issue commands as is we were running the application from the command line; this is in contrast to calling the supporting functions directly
- never try to the user named 'realm_admin'; this is the foundational realm administrator account and must be preserved
- use the user_default_password from the yaml file as the password for all new users we create

Plan:
- obtain the server IP from the yaml file and log in as the specified realm administrator using the password
- read the yaml file and create things in the order they are encountered
- run list commands corresponding with all of the services
- then read the file backwards and delete everything that was created