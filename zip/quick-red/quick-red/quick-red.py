#!/usr/bin/env python3

import argparse
import os
import sys
import ipaddress
import subprocess
import json
import requests
import urllib.parse
import random
import getpass
import socket

# Suppress only the InsecureRequestWarning from urllib3 needed.
import warnings
from urllib3.exceptions import InsecureRequestWarning
warnings.simplefilter('ignore', InsecureRequestWarning)

def get_token_file_path(server_ip):
    config_dir = os.path.expanduser('~/.config/red')
    return os.path.join(config_dir, f"quick-red-token-{server_ip}")

def read_token_from_file(server_ip):
    token_file = get_token_file_path(server_ip)
    if os.path.exists(token_file):
        with open(token_file, 'r') as f:
            return f.read().strip()
    return None

def save_token_to_file(server_ip, token):
    config_dir = os.path.expanduser('~/.config/red')
    os.makedirs(config_dir, exist_ok=True)
    token_file = get_token_file_path(server_ip)
    with open(token_file, 'w') as f:
        f.write(token)

def validate_token(server_ip, token):
    url = f"https://{server_ip}/redapi/v1/accessible"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}"
    }
    
    try:
        response = requests.get(url, headers=headers, verify=False)
        data = response.json()
        print(f"Title: {data.get('title')}")
        return data.get('title') == "Accessible"
    except requests.RequestException:
        print(f"Title: {data.get('title')}")
        return False

def s3_summary(server_ip, token):
    print("S3 Access Summary:")
    print(f"{'User ID':<20} {'S3 Key':<40} {'S3 Secret':<50} {'Tenant':<20} {'Subtenant':<20} {'Expired':<10}")
    print("-" * 160)  # Increased by 10 to account for the wider S3 Secret column

    clusters = get_clusters(server_ip, token)
    for cluster_name in clusters:
        tenants = get_tenants(server_ip, token, cluster_name)
        for tenant in tenants:
            tenant_name = tenant.get('name', 'N/A')
            users = get_users(server_ip, token, cluster_name, tenant_name)
            for user in users:
                s3_access_url = f"https://{server_ip}/redapi/v1/s3/access"
                headers = {
                    "accept": "application/json",
                    "Authorization": f"Bearer {token}",
                    "User_id": user,
                    "Level": f"{cluster_name}/{tenant_name}"
                }

                try:
                    response = requests.get(s3_access_url, headers=headers, verify=False)
                    response.raise_for_status()
                    data = response.json()

                    items = data.get('data', {})
                    if isinstance(items, dict):
                        for s3_key, item in items.items():
                            if isinstance(item, dict):
                                user_id = item.get('user_id', 'N/A')
                                s3_secret = item.get('s3_secret', 'N/A')
                                tenant = item.get('tenant', 'N/A')
                                subtenant = item.get('subtenant', 'N/A')
                                expired = str(item.get('expired', 'N/A'))

                                print(f"{user_id:<20} {s3_key:<40} {s3_secret:<50} {tenant:<20} {subtenant:<20} {expired:<10}")
                            else:
                                print(f"Unexpected item format: {item}")
                    else:
                        print(f"Unexpected data format: {items}")

                except requests.RequestException as e:
                    print(f"Error fetching S3 access for user {user} in tenant {tenant_name}, cluster {cluster_name}: {e}", file=sys.stderr)


def network_summary(server_ip, token):
    url = f"https://{server_ip}/redapi/v1/inventory"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        data = response.json()

        nodes = data.get('data', {}).get('nodes', {})
        node_count = len(nodes)

        print(f"Results from {node_count} nodes")
        print(f"Title: {data.get('title', 'N/A')}")
        print("\nNetwork Summary:")
        
        # Define column widths
        col_widths = {
            "hostname": 20,
            "interface": 15,
            "nettype": 15,
            "ipv4_cidr": 20,
            "speed": 15
        }
        
        # Print header
        print(f"{'Hostname':<{col_widths['hostname']}} "
              f"{'Interface':<{col_widths['interface']}} "
              f"{'Network Type':<{col_widths['nettype']}} "
              f"{'IPv4 CIDR':<{col_widths['ipv4_cidr']}} "
              f"{'Speed (Mbps)':<{col_widths['speed']}}")
        print("-" * (sum(col_widths.values()) + 4))  # Separator line

        # Sort nodes by hostname
        sorted_nodes = sorted(data.get('data', {}).get('nodes', {}).items(), key=lambda x: x[1].get('hostname', ''))

        for _, node_data in sorted_nodes:
            hostname = node_data.get('hostname', 'N/A')
            interfaces = node_data.get('interfaces', {})
            
            # Sort interfaces by speed in descending order
            sorted_interfaces = sorted(interfaces.items(), key=lambda x: x[1].get('speed', 0), reverse=True)
            
            for i, (interface_key, interface_data) in enumerate(sorted_interfaces):
                if interface_key != 'lo':  # Exclude localhost
                    if i == 0:
                        # Print hostname only for the first interface
                        print(f"{hostname:<{col_widths['hostname']}} ", end="")
                    else:
                        print(" " * col_widths['hostname'] + " ", end="")  # Align subsequent interfaces
                    
                    print(f"{interface_key:<{col_widths['interface']}} "
                          f"{interface_data.get('nettype', 'N/A'):<{col_widths['nettype']}} "
                          f"{interface_data.get('ipv4_cidr', 'N/A'):<{col_widths['ipv4_cidr']}} "
                          f"{interface_data.get('speed', 'N/A'):<{col_widths['speed']}}")
            
            print()  # Add a blank line between nodes

    except requests.RequestException as e:
        print(f"Error fetching network summary: {e}", file=sys.stderr)


def nodes_summary(server_ip, token):
    url = f"https://{server_ip}/redapi/v1/inventory"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        data = response.json()

        nodes = data.get('data', {}).get('nodes', {})
        node_count = len(nodes)

        print(f"Results from {node_count} nodes")
        print(f"Title: {data.get('title', 'N/A')}")
        print("\nNodes:")
        
        # Print header
        print(f"{'Hostname':<30} {'Control Plane IP':<20}")
        print("-" * 50)  # Separator line

        # Sort nodes by hostname
        sorted_nodes = sorted(data.get('data', {}).get('nodes', {}).items(), key=lambda x: x[1].get('hostname', ''))

        for _, node_data in sorted_nodes:
            hostname = node_data.get('hostname', 'N/A')
            ctrl_plane_ip = node_data.get('ctrl_plane_ip', 'N/A')
            print(f"{hostname:<30} {ctrl_plane_ip:<20}")

    except requests.RequestException as e:
        print(f"Error fetching nodes summary: {e}", file=sys.stderr)

def users_summary(server_ip, token):
    print("Generating summary of users...")
    
    # Get the cluster name from the API
    clusters = get_clusters(server_ip, token)
    if not clusters:
        print("Error: No clusters found", file=sys.stderr)
        return False
    
    cluster_name = clusters[0]  # Take the first (and only) cluster
    print(f"Auto selecting cluster: {cluster_name}", file=sys.stderr)

    # Define headers once at the beginning
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}"
    }

    # Get all tenants
    tenants = get_tenants(server_ip, token, cluster_name)
    if not tenants:
        print("No tenants found.")
        return True

    # Dictionary to store users by tenant and subtenant
    users_by_tenant = {}

    for tenant in tenants:
        tenant_name = tenant.get('name')
        print(f"Processing tenant: {tenant_name}", file=sys.stderr)
        
        # Get users directly in the tenant first
        tenant_users_url = f"https://{server_ip}/redapi/v1/clusters/{cluster_name}/users?tenants={tenant_name}"
        try:
            tenant_response = requests.get(tenant_users_url, headers=headers, verify=False)
            tenant_response.raise_for_status()
            tenant_data = tenant_response.json()
            print(f"Tenant users response for {tenant_name}:", file=sys.stderr)
            print(json.dumps(tenant_data, indent=2), file=sys.stderr)
            
            # Extract actual users from the response
            tenant_users = []
            users_data = tenant_data.get('data', {}).get('users', {})
            for user_key, user_info in users_data.items():
                if user_info.get('user'):  # Only add if there's a username
                    tenant_users.append(user_info.get('user'))
            
            print(f"Found {len(tenant_users)} users in tenant {tenant_name}", file=sys.stderr)
            # Always add the tenant to the dictionary, even if it has no users
            users_by_tenant[tenant_name] = {
                'subtenants': [],
                'users': tenant_users
            }
        except requests.RequestException as e:
            print(f"Error fetching users for tenant '{tenant_name}': {e}", file=sys.stderr)
            users_by_tenant[tenant_name] = {
                'subtenants': [],
                'users': []
            }

        # Get subtenants with users using recursive endpoint
        url = f"https://{server_ip}/redapi/v1/clusters/{cluster_name}/tenants/{tenant_name}/subtenants?recurse=true"
        
        try:
            response = requests.get(url, headers=headers, verify=False)
            response.raise_for_status()
            data = response.json()
            print(f"Subtenants response for {tenant_name}:", file=sys.stderr)
            print(json.dumps(data, indent=2), file=sys.stderr)
            
            subtenants = data.get('data', [])
            print(f"Found {len(subtenants)} subtenants in tenant {tenant_name}", file=sys.stderr)
            
            if subtenants:
                if tenant_name not in users_by_tenant:
                    users_by_tenant[tenant_name] = {
                        'subtenants': [],
                        'users': []
                    }
                users_by_tenant[tenant_name]['subtenants'] = subtenants
            
        except requests.RequestException as e:
            if hasattr(e.response, 'status_code') and e.response.status_code == 401:
                print(f"Tenant '{tenant_name}' exists but doesn't have subtenant access permissions", file=sys.stderr)
            else:
                print(f"Error fetching subtenants for tenant '{tenant_name}': {e}", file=sys.stderr)

    # Print the results
    if not users_by_tenant:
        print("No users found.")
        return True

    print("\nUsers Summary:")
    print(f"{'Tenant':<30} {'Subtenant':<30} {'Username':<30}")
    print("-" * 90)

    # First, print all tenant users
    for tenant, data in sorted(users_by_tenant.items()):
        if data['users']:
            for i, username in enumerate(data['users']):
                if i == 0:
                    print(f"{tenant:<30} {'(root)':<30} {username:<30}")
                else:
                    print(f"{'':<30} {'(root)':<30} {username:<30}")
            print()

    # Then, print all subtenant users
    for tenant, data in sorted(users_by_tenant.items()):
        for subtenant in data['subtenants']:
            subtenant_name = subtenant.get('name')
            subtenant_users = []
            users_data = subtenant.get('users', {})
            for user_key, user_info in users_data.items():
                if user_info.get('user'):  # Only add if there's a username
                    subtenant_users.append(user_info.get('user'))
            if subtenant_users:
                for i, username in enumerate(subtenant_users):
                    if i == 0:
                        print(f"{tenant:<30} {subtenant_name:<30} {username:<30}")
                    else:
                        print(f"{'':<30} {subtenant_name:<30} {username:<30}")
                print()

    return True

def drives_summary(server_ip, token):
    url = f"https://{server_ip}/redapi/v1/hmi/drives"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        data = response.json()

        print(f"Title: {data.get('title', 'N/A')}")
        print("\nDrives Summary:")

        for node_name, drives in data.get('data', {}).items():
            print(f"\nNode: {node_name}")
            print("-" * 100)  # Increased separator line length
            print(f"{'Name':<30} {'Size':<10} {'Type':<10} {'Status':<10} {'FW Version':<15} {'FW Update':<15} {'Model':<20}")
            print("-" * 100)  # Increased separator line length
            
            # Sort drives by name
            sorted_drives = sorted(drives, key=lambda x: x.get('name', ''))
            
            for drive in sorted_drives:
                print(f"{drive.get('name', 'N/A'):<30} "  # Increased width to 30
                      f"{drive.get('size', 'N/A'):<10} "
                      f"{drive.get('type', 'N/A'):<10} "
                      f"{drive.get('status', 'N/A'):<10} "
                      f"{drive.get('fw_version', 'N/A'):<15} "
                      f"{str(drive.get('fw_update_supported', 'N/A')):<15} "
                      f"{drive.get('model', 'N/A'):<20}")

    except requests.RequestException as e:
        print(f"Error fetching drives summary: {e}", file=sys.stderr)

def drive_summary(server_ip, token):
    url = f"https://{server_ip}/redapi/v1/hmi/drives"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        data = response.json()

        print(f"Title: {data.get('title', 'N/A')}")
        print("\nDrive Summary:")

        drives_by_model = {}
        drives_by_firmware = {}
        drives_by_status = {}
        exceptions = []

        for node_name, drives in data.get('data', {}).items():
            for drive in drives:
                model = drive.get('model', 'Unknown')
                firmware = drive.get('fw_version', 'Unknown')
                status = drive.get('status', 'Unknown')

                drives_by_model[model] = drives_by_model.get(model, 0) + 1
                drives_by_firmware[firmware] = drives_by_firmware.get(firmware, 0) + 1
                drives_by_status[status] = drives_by_status.get(status, 0) + 1

                if status != 1:
                    exceptions.append({
                        'node': node_name,
                        'name': drive.get('name', 'N/A'),
                        'size': drive.get('size', 'N/A'),
                        'type': drive.get('type', 'N/A'),
                        'status': status,
                        'fw_version': firmware,
                        'model': model
                    })

        print("\nDrives by Model:")
        for model, count in sorted(drives_by_model.items()):
            print(f"  {model}: {count}")

        print("\nDrives by Firmware Version:")
        for firmware, count in sorted(drives_by_firmware.items()):
            print(f"  {firmware}: {count}")

        print("\nDrives by Status:")
        for status, count in sorted(drives_by_status.items()):
            print(f"  {status}: {count}")

        if exceptions:
            print("\nExceptions (Drives with status != 1):")
            print(f"{'Node':<15} {'Name':<30} {'Size':<10} {'Type':<10} {'Status':<10} {'FW Version':<15} {'Model':<20}")
            print("-" * 110)  # Increased separator line length
            for drive in exceptions:
                print(f"{drive['node']:<15} {drive['name']:<30} {drive['size']:<10} {drive['type']:<10} "
                      f"{drive['status']:<10} {drive['fw_version']:<15} {drive['model']:<20}")

    except requests.RequestException as e:
        print(f"Error fetching drive summary: {e}", file=sys.stderr)

def drive_summary_test(server_ip, token):
    url = f"https://{server_ip}/redapi/v1/hmi/drives"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        data = response.json()

        print(f"Title: {data.get('title', 'N/A')} (Test Mode)")
        print("\nDrive Summary (Test Mode - Randomized Statuses):")

        drives_by_model = {}
        drives_by_firmware = {}
        drives_by_status = {}
        exceptions = []

        for node_name, drives in data.get('data', {}).items():
            for drive in drives:
                model = drive.get('model', 'Unknown')
                firmware = drive.get('fw_version', 'Unknown')
                
                # Randomize status: 80% chance of status 1, 20% chance of other statuses
                status = 1 if random.random() < 0.8 else random.choice([0, 2, 3, 4, 5])
                
                drives_by_model[model] = drives_by_model.get(model, 0) + 1
                drives_by_firmware[firmware] = drives_by_firmware.get(firmware, 0) + 1
                drives_by_status[status] = drives_by_status.get(status, 0) + 1

                if status != 1:
                    exceptions.append({
                        'node': node_name,
                        'name': drive.get('name', 'N/A'),
                        'size': drive.get('size', 'N/A'),
                        'type': drive.get('type', 'N/A'),
                        'status': status,
                        'fw_version': firmware,
                        'model': model
                    })

        print("\nDrives by Model:")
        for model, count in sorted(drives_by_model.items()):
            print(f"  {model}: {count}")

        print("\nDrives by Firmware Version:")
        for firmware, count in sorted(drives_by_firmware.items()):
            print(f"  {firmware}: {count}")

        print("\nDrives by Status:")
        for status, count in sorted(drives_by_status.items()):
            print(f"  {status}: {count}")

        if exceptions:
            print("\nExceptions (Drives with status != 1):")
            print(f"{'Node':<15} {'Name':<30} {'Size':<10} {'Type':<10} {'Status':<10} {'FW Version':<15} {'Model':<20}")
            print("-" * 110)  # Increased separator line length
            for drive in exceptions:
                print(f"{drive['node']:<15} {drive['name']:<30} {drive['size']:<10} {drive['type']:<10} "
                      f"{drive['status']:<10} {drive['fw_version']:<15} {drive['model']:<20}")

    except requests.RequestException as e:
        print(f"Error fetching drive summary: {e}", file=sys.stderr)

def show_token(token):
    print(f"{token}")

def get_external_ips():
    try:
        # Get all network interfaces
        interfaces = socket.getaddrinfo(host=socket.gethostname(), port=None, family=socket.AF_INET)
        # Extract unique IP addresses, excluding localhost
        ip_addresses = list(set(interface[4][0] for interface in interfaces if interface[4][0] != '127.0.0.1'))
        return ip_addresses
    except socket.gaierror:
        return []
    

def show_swagger_url(server_ip, token):
    base_url = f"https://{server_ip}/redapi/v1/ui/"
    
    # URL-encode the token
    encoded_token = urllib.parse.quote(token)
    
    print(f"Swagger UI URL:")
    print("You can copy and paste it into your browser to access the Swagger UI.")
    
    if server_ip.lower() == 'localhost' or server_ip == '127.0.0.1':
        external_ips = get_external_ips()
        if external_ips:
            print("Since you're using localhost, here are possible Swagger UI URLs:")
            for ip in external_ips:
                print(f"https://{ip}/redapi/v1/ui/")
        else:
            print("Unable to determine external IP addresses. Using localhost:")
            print(base_url)
    else:
        print(base_url)
    
    print("\nTo authorize the Swagger UI, click on the 'Authorize' button and enter 'Bearer' as the type and the token as the value.")
    print("\nToken:")
    print(encoded_token)

def validate_ip_or_fqdn(value):
    try:
        ipaddress.ip_address(value)
        return value
    except ValueError:
        # If it's not a valid IP, assume it's an FQDN
        return value

def acquire_access_token(server_ip, username, password, tenant=None, subtenant=None):
    url = f'https://{server_ip}/redapi/v1/auth_user'
    headers = {
        'User_id': username,
        'Password': password
    }
    
    # Add level header if tenant is specified
    if tenant:
        headers['level'] = f"cluster1/{tenant}"
        if subtenant:
            headers['level'] = f"cluster1/{tenant}/{subtenant}"
    
    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()  # Raise an exception for bad status codes
        data = response.json()
        token = data.get('data', {}).get('token')
        if token:
            return token
        else:
            print("Error: Unable to extract token from response.", file=sys.stderr)
            print(f"Response: {data}", file=sys.stderr)
            return None
    except requests.RequestException as e:
        print(f"Error during authentication: {str(e)}", file=sys.stderr)
        if hasattr(e.response, 'text'):
            print(f"Response: {e.response.text}", file=sys.stderr)
        return None
    except json.JSONDecodeError:
        print("Error: Invalid JSON response from server.", file=sys.stderr)
        return None

def grants(server_ip, username, token):
    if not username:
        username = "realm_admin"
    
    url = f"https://{server_ip}/redapi/v1/user/grant"
    headers = {
        "accept": "*/*",
        "user_id": username,
        "Authorization": f"Bearer {token}"
    }

    for caps in ["red", "red/red"]:
        headers["caps"] = caps
        response = requests.put(url, headers=headers, verify=False)
        
        if response.status_code == 200:
            print(f"Successfully granted '{caps}' capabilities to user '{username}'")
        else:
            print(f"Failed to grant '{caps}' capabilities. Status code: {response.status_code}")
            print(f"Response: {response.text}")
            break  # Stop if the first request fails

def print_fox():
    fox_ascii = r"""
         /\   /\
        //\\_//\\     ____
        \_     _/    /   /
         / * * \    /^^^]
         \_\O/_/    [   ]
          /   \_    [   /
         /  \  \    /  /
        /    \  \  /  /
        |[]  |   \/  /
        |[]  |    \/
    jgs |[]  |     \
         \__/       )
          ||       /
          ||      /
          ||     /
          ||    /
          ||   /
          ()  /
          ||  \
          ||   \
         /_\    \
    """
    print(fox_ascii)
    print("ASCII art by Joan G. Stark (jgs)")

def realm_summary(server_ip, token):
    url = f"https://{server_ip}/redapi/v1/info?detailed=true"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()  # Raise an exception for bad status codes
        data = response.json()

        print("Realm Summary:")
        print(f"Title: {data.get('title', 'N/A')}")
        print(f"  Build Date: {data.get('data', {}).get('build_date', 'N/A')}")
        print(f"  Build Type: {data.get('data', {}).get('build_type', 'N/A')}")
        print(f"  Cluster: {data.get('data', {}).get('cluster', 'N/A')}")
        print(f"  Cluster State: {data.get('data', {}).get('cluster_state', 'N/A')}")
        print(f"  Version: {data.get('data', {}).get('version', 'N/A')}")

    except requests.RequestException as e:
        print(f"Error fetching realm summary: {e}", file=sys.stderr)

def control_ips_summary(server_ip, token):
    url = f"https://{server_ip}/redapi/v1/inventory"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        data = response.json()

        nodes = data.get('data', {}).get('nodes', {})
        node_count = len(nodes)

        print(f"Results from {node_count} nodes")

        # Extract and sort control plane IPs
        ctrl_plane_ips = sorted([
            node_data.get('ctrl_plane_ip', '')
            for node_data in nodes.values()
            if node_data.get('ctrl_plane_ip')
        ])

        # Print comma-separated list without spaces
        print(','.join(ctrl_plane_ips))

    except requests.RequestException as e:
        print(f"Error fetching control IPs summary: {e}", file=sys.stderr)

def hsn_ips_summary(server_ip, token):
    url = f"https://{server_ip}/redapi/v1/inventory"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        data = response.json()

        nodes = data.get('data', {}).get('nodes', {})
        node_count = len(nodes)

        print(f"Results from {node_count} nodes")

        hsn_ips = set()  # Use a set to automatically remove duplicates

        for node_data in nodes.values():
            interfaces = node_data.get('interfaces', {})
            
            for interface_data in interfaces.values():
                if interface_data.get('speed', 0) >= 50000:
                    ip_cidr = interface_data.get('ipv4_cidr', '')
                    if ip_cidr:
                        # Strip the subnet length from the address
                        ip = ip_cidr.split('/')[0]
                        hsn_ips.add(ip)

        # Sort the IPs and print as a comma-separated list
        print(','.join(sorted(hsn_ips)))

    except requests.RequestException as e:
        print(f"Error fetching HSN IPs summary: {e}", file=sys.stderr)

def get_clusters(server_ip, token):
    url = f"https://{server_ip}/redapi/v1/clusters"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        data = response.json()
        return list(data.get('data', {}).keys())
    except requests.RequestException as e:
        print(f"Error fetching clusters: {e}", file=sys.stderr)
        return []

def get_tenants(server_ip, token, cluster_name):
    tenant_url = f"https://{server_ip}/redapi/v1/clusters/{cluster_name}/tenants"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}"
    }

    try:
        tenant_response = requests.get(tenant_url, headers=headers, verify=False)
        tenant_response.raise_for_status()
        tenant_data = tenant_response.json()
        return tenant_data.get('data', [])
    except requests.RequestException as e:
        print(f"Error fetching tenants for cluster {cluster_name}: {e}", file=sys.stderr)
        return []

def clusters_summary(server_ip, token):
    clusters = get_clusters(server_ip, token)
    print(f"Results from {len(clusters)} clusters")

    print("\nClusters:")
    for cluster_name in sorted(clusters):
        print(f"  {cluster_name}")

def drives_by_node(server_ip, token):
    url = f"https://{server_ip}/redapi/v1/hmi/drives"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        data = response.json()

        print(f"Title: {data.get('title', 'N/A')}")
        print("\nDrives by Node:")

        # Collect all unique drive models
        all_models = set()
        nodes_data = {}

        for node_name, drives in data.get('data', {}).items():
            nodes_data[node_name] = {}
            for drive in drives:
                model = drive.get('model', 'Unknown')
                all_models.add(model)
                nodes_data[node_name][model] = nodes_data[node_name].get(model, 0) + 1

        # Sort models alphabetically
        sorted_models = sorted(all_models)

        # Print header
        header = "Node".ljust(20)
        for model in sorted_models:
            header += model.ljust(15)
        print(header)
        print("-" * (20 + 15 * len(sorted_models)))

        # Print data for each node
        for node_name in sorted(nodes_data.keys()):
            row = node_name.ljust(20)
            for model in sorted_models:
                count = nodes_data[node_name].get(model, 0)
                row += str(count).ljust(15)
            print(row)

    except requests.RequestException as e:
        print(f"Error fetching drives by node: {e}", file=sys.stderr)

def get_users(server_ip, token, cluster_name, tenant_name):
    url = f"https://{server_ip}/redapi/v1/clusters/{cluster_name}/users?tenants={tenant_name}"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        data = response.json()
        
        users = data.get('data', {}).get('users', {})
        
        if isinstance(users, dict):
            return [user_data.get('user') for user_data in users.values() if isinstance(user_data, dict)]
        else:
            print(f"Unexpected data structure for users in tenant {tenant_name}, cluster {cluster_name}")
            return []
    except requests.RequestException as e:
        print(f"Error fetching users for tenant {tenant_name} in cluster {cluster_name}: {e}", file=sys.stderr)
        return []
    except Exception as e:
        print(f"Unexpected error for users in tenant {tenant_name}, cluster {cluster_name}: {e}", file=sys.stderr)
        return []

def tenants_summary(server_ip, token):
    clusters = get_clusters(server_ip, token)
    print(f"Results from {len(clusters)} clusters")

    print("\nTenants Summary:")
    print(f"{'Cluster':<20} {'Tenant':<30} {'Primary Admin':<30} {'Users'}")
    print("-" * 100)

    for cluster_name in sorted(clusters):
        tenants = get_tenants(server_ip, token, cluster_name)
        
        if not tenants:
            print(f"{cluster_name:<20} {'No tenants found':<30} {'':<30}")
        else:
            for i, tenant in enumerate(tenants):
                name = tenant.get('name', 'N/A')
                primary_admin = tenant.get('xattrs', {}).get('RED_INTERNAL', {}).get('primary-admin', 'N/A')
                users = get_users(server_ip, token, cluster_name, name)
                
                if i == 0:
                    print(f"{cluster_name:<20} {name:<30} {primary_admin:<30} {', '.join(users)}")
                else:
                    print(f"{'':<20} {name:<30} {primary_admin:<30} {', '.join(users)}")

def network_groups(server_ip, token):
    url = f"https://{server_ip}/redapi/v1/inventory"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        data = response.json()

        nodes = data.get('data', {}).get('nodes', {})
        node_count = len(nodes)

        print(f"Results from {node_count} nodes")

        # Dictionary to store groups
        groups = {}

        for node_id, node_data in nodes.items():
            hostname = node_data.get('hostname', 'Unknown')
            interfaces = node_data.get('interfaces', {})
            for interface, interface_data in interfaces.items():
                if interface != 'lo':  # Exclude localhost
                    nettype = interface_data.get('nettype', 'N/A')
                    speed = interface_data.get('speed', 'N/A')
                    group_key = (interface, nettype, speed)
                    
                    if group_key not in groups:
                        groups[group_key] = []
                    groups[group_key].append(hostname)

        print("\nNetwork Groups:")
        for i, (group, hostnames) in enumerate(sorted(groups.items()), 1):
            interface, nettype, speed = group
            print(f"\nGroup {i}:")
            print(f"  Interface: {interface}")
            print(f"  Network Type: {nettype}")
            print(f"  Speed: {speed}")
            print(f"  Hostnames: {','.join(sorted(hostnames))}")

    except requests.RequestException as e:
        print(f"Error fetching network groups: {e}", file=sys.stderr)

def show_endpoints(server_ip, token):
    url = f"https://{server_ip}/redapi/v1/s3/config"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        data = response.json()

        endpoints = data.get('data', {}).get('endpoints', [])

        if endpoints:
            print("Endpoints:")
            for endpoint in endpoints:
                print(f'"{endpoint}",')
        else:
            print("No endpoints found.")

    except requests.RequestException as e:
        print(f"Error fetching endpoints: {e}", file=sys.stderr)

def login(server_ip, username, password, tenant=None, subtenant=None):
    # Keep the original username, don't combine with tenant
    token = acquire_access_token(server_ip, username, password, tenant, subtenant)
    
    if token:
        save_token_to_file(server_ip, token)
        print("Login successful. Token acquired and saved.")
        return True
    else:
        print("Login failed. Unable to acquire token.")
        return False

def version_summary(server_ip, token):
    url = f"https://{server_ip}/redapi/v1/version"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        data = response.json()

        versions = {}
        for node, components in data.get('data', {}).items():
            for component, info in components.items():
                version = info.get('version')
                hostname = info.get('hostname')
                if version and version != "-":
                    if version not in versions:
                        versions[version] = set()
                    versions[version].add(hostname)

        if len(versions) == 1:
            common_version = next(iter(versions.keys()))
            print(f"All components are running version: {common_version}")
        else:
            print("Different versions detected:")
            for version, hostnames in versions.items():
                print(f"\nVersion: {version}")
                print("Hostnames:")
                for hostname in sorted(hostnames):
                    print(f"  - {hostname}")

    except requests.RequestException as e:
        print(f"Error fetching version information: {e}", file=sys.stderr)

def check_tenant_exists(server_ip, token, cluster_name, tenant_name):
    url = f"https://{server_ip}/redapi/v1/clusters/{cluster_name}/tenants"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}"
    }

    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        tenants = response.json().get('data', [])
        return any(tenant.get('name') == tenant_name for tenant in tenants)
    except requests.RequestException as e:
        print(f"Error checking tenant existence: {e}", file=sys.stderr)
        return False

def create_tenant(server_ip, token, tenant_name, primary_admin):
    # Get the cluster name from the API
    clusters = get_clusters(server_ip, token)
    if not clusters:
        print("Error: No clusters found", file=sys.stderr)
        return False
    
    cluster_name = clusters[0]  # Take the first (and only) cluster
    print(f"Auto selecting cluster: {cluster_name}", file=sys.stderr)
    
    # Check if tenant already exists
    if check_tenant_exists(server_ip, token, cluster_name, tenant_name):
        print(f"Error: Tenant '{tenant_name}' already exists in cluster '{cluster_name}'", file=sys.stderr)
        return False

    url = f"https://{server_ip}/redapi/v1/clusters/{cluster_name}/tenants"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}"
    }
    
    # Prepare the tenant data
    tenant_data = {
        "name": tenant_name,
        "xattrs": {
            "RED_INTERNAL": {
                "primary-admin": primary_admin
            }
        }
    }

    try:
        response = requests.post(url, headers=headers, json=tenant_data, verify=False)
        response.raise_for_status()
        print(f"Successfully created tenant '{tenant_name}' in cluster '{cluster_name}'")
        print(f"Primary admin: {primary_admin}")
        return True
    except requests.RequestException as e:
        print(f"Error creating tenant: {e}", file=sys.stderr)
        if hasattr(e.response, 'text'):
            print(f"Response: {e.response.text}", file=sys.stderr)
        return False

def create_user(server_ip, token, username, tenant_name):
    # Get the cluster name from the API
    clusters = get_clusters(server_ip, token)
    if not clusters:
        print("Error: No clusters found", file=sys.stderr)
        return False
    
    cluster_name = clusters[0]  # Take the first (and only) cluster
    print(f"Auto selecting cluster: {cluster_name}", file=sys.stderr)

    # Check if tenant exists
    if not check_tenant_exists(server_ip, token, cluster_name, tenant_name):
        print(f"Error: Tenant '{tenant_name}' does not exist in cluster '{cluster_name}'", file=sys.stderr)
        return False

    # Check if user already exists
    url = f"https://{server_ip}/redapi/v1/clusters/{cluster_name}/users?tenants={tenant_name}"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}"
    }
    
    try:
        response = requests.get(url, headers=headers, verify=False)
        response.raise_for_status()
        users = response.json().get('data', {}).get('users', {})
        if any(user_data.get('user') == username for user_data in users.values()):
            print(f"Error: User '{username}' already exists in tenant '{tenant_name}'", file=sys.stderr)
            return False
    except requests.RequestException as e:
        print(f"Error checking existing users: {e}", file=sys.stderr)
        return False

    # Create the user
    url = f"https://{server_ip}/redapi/v1/clusters/{cluster_name}/users"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}"
    }
    
    # Prepare the user data
    user_data = {
        "user": username,
        "tenants": [tenant_name]
    }

    try:
        response = requests.post(url, headers=headers, json=user_data, verify=False)
        response.raise_for_status()
        print(f"Successfully created user '{username}' in tenant '{tenant_name}'")
        return True
    except requests.RequestException as e:
        print(f"Error creating user: {e}", file=sys.stderr)
        if hasattr(e.response, 'text'):
            print(f"Response: {e.response.text}", file=sys.stderr)
        return False

def subtenants_summary(server_ip, token, tenant_name=None):
    # Get the cluster name from the API
    clusters = get_clusters(server_ip, token)
    if not clusters:
        print("Error: No clusters found", file=sys.stderr)
        return False
    
    cluster_name = clusters[0]  # Take the first (and only) cluster
    print(f"Auto selecting cluster: {cluster_name}", file=sys.stderr)

    # If tenant_name is provided, verify it exists
    if tenant_name:
        if not check_tenant_exists(server_ip, token, cluster_name, tenant_name):
            print(f"Error: Tenant '{tenant_name}' does not exist in cluster '{cluster_name}'", file=sys.stderr)
            return False
        tenants_to_check = [tenant_name]
    else:
        # Get all tenants
        tenants_to_check = [tenant.get('name') for tenant in get_tenants(server_ip, token, cluster_name)]

    # Dictionary to store subtenants by tenant
    subtenants_by_tenant = {}

    for tenant in tenants_to_check:
        url = f"https://{server_ip}/redapi/v1/clusters/{cluster_name}/tenants/{tenant}/subtenants"
        headers = {
            "accept": "application/json",
            "Authorization": f"Bearer {token}"
        }
        
        try:
            response = requests.get(url, headers=headers, verify=False)
            response.raise_for_status()
            data = response.json()
            
            subtenants = data.get('data', [])
            if subtenants:
                subtenants_by_tenant[tenant] = subtenants
            
        except requests.RequestException as e:
            if hasattr(e.response, 'status_code') and e.response.status_code == 401:
                # Tenant exists but doesn't have subtenant access permissions
                subtenants_by_tenant[tenant] = []
            else:
                print(f"Error fetching subtenants for tenant '{tenant}': {e}", file=sys.stderr)
            continue

    # Print the results
    if not subtenants_by_tenant:
        print("No tenants found.")
        return True

    print("\nSubtenants Summary:")
    print(f"{'Tenant':<30} {'Subtenant':<30} {'Admins':<30} {'Viewers':<30}")
    print("-" * 120)

    for tenant, subtenants in sorted(subtenants_by_tenant.items()):
        if not subtenants:
            print(f"{tenant:<30} {'No subtenants':<30} {'':<30} {'':<30}")
        else:
            for i, subtenant in enumerate(subtenants):
                name = subtenant.get('name', 'N/A')
                admins = ', '.join(subtenant.get('admins', []))
                viewers = ', '.join(subtenant.get('viewers', []))
                
                if i == 0:
                    print(f"{tenant:<30} {name:<30} {admins:<30} {viewers:<30}")
                else:
                    print(f"{'':<30} {name:<30} {admins:<30} {viewers:<30}")
        print()  # Add a blank line between tenants

    return True

def create_subtenant(server_ip, token, tenant_name, subtenant_name, admins=None, viewers=None):
    # Get the cluster name from the API
    clusters = get_clusters(server_ip, token)
    if not clusters:
        print("Error: No clusters found", file=sys.stderr)
        return False
    
    cluster_name = clusters[0]  # Take the first (and only) cluster
    print(f"Auto selecting cluster: {cluster_name}", file=sys.stderr)

    # Verify tenant exists
    if not check_tenant_exists(server_ip, token, cluster_name, tenant_name):
        print(f"Error: Tenant '{tenant_name}' does not exist in cluster '{cluster_name}'", file=sys.stderr)
        return False

    url = f"https://{server_ip}/redapi/v1/clusters/{cluster_name}/tenants/{tenant_name}/subtenants"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}"
    }

    # Prepare the subtenant data
    subtenant_data = {
        "name": subtenant_name,
        "xattrs": {}  # Required field according to schema
    }

    # Add optional fields if provided
    if admins:
        subtenant_data["admins"] = admins
    if viewers:
        subtenant_data["viewers"] = viewers

    try:
        response = requests.post(url, headers=headers, json=subtenant_data, verify=False)
        response.raise_for_status()
        print(f"Successfully created subtenant '{subtenant_name}' in tenant '{tenant_name}'")
        return True
    except requests.RequestException as e:
        if hasattr(e.response, 'status_code'):
            if e.response.status_code == 401:
                print(f"Error: You don't have permission to create subtenants in tenant '{tenant_name}'. Please ensure you have the necessary permissions.", file=sys.stderr)
            else:
                print(f"Error creating subtenant: {e}", file=sys.stderr)
        else:
            print(f"Error creating subtenant: {e}", file=sys.stderr)
        return False

def update_user(server_ip: str, token: str, user_spec: str = None, tenant: str = None, subtenant: str = None, username: str = None, 
                name: str = None, email: str = None, password: str = None, caps: str = None, identity: str = None, groups: str = None):
    """Update a user's properties.
    
    Args:
        server_ip: The server IP address
        token: Authentication token
        user_spec: Full user specification in format 'tenant/subtenant/username'
        tenant: Tenant name (if not using user_spec)
        subtenant: Subtenant name (if not using user_spec)
        username: Username (if not using user_spec)
        name: User's full name
        email: User's email address
        password: User's password
        caps: User's capabilities
        identity: User's identity
        groups: User's groups
    """
    # Get cluster name
    cluster_name = get_clusters(server_ip, token)
    if not cluster_name:
        print("No clusters found")
        return

    # Parse user specification
    if user_spec:
        parts = user_spec.split('/')
        if len(parts) == 3:  # tenant/subtenant/username
            tenant = parts[0]
            subtenant = parts[1]
            username = parts[2]
        else:
            print("Invalid user specification format. Use 'tenant/subtenant/username'")
            print("Note: To update tenant admin passwords, use 'redcli tenant update' command")
            return

    if not tenant or not username:
        print("Missing required tenant or username")
        return

    # Check if tenant exists
    if not check_tenant_exists(server_ip, token, cluster_name[0], tenant):
        print(f"Tenant '{tenant}' does not exist")
        return

    # Use the /user endpoint for updates
    url = f"https://{server_ip}/redapi/v1/user"

    # Prepare update data
    update_data = {}
    if name is not None:
        update_data['name'] = name
    if email is not None:
        update_data['email'] = email
    if password is not None:
        update_data['password'] = password
    if caps is not None:
        update_data['caps'] = caps
    if identity is not None:
        update_data['identity'] = identity
    if groups is not None:
        update_data['groups'] = groups

    if not update_data:
        print("No update parameters provided. Available options:")
        print("  -name: User's full name")
        print("  -email: User's email address")
        print("  -new-password: User's new password")
        print("  -caps: User's capabilities")
        print("  -identity: User's identity")
        print("  -groups: User's groups")
        return

    # Make the API call
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'User_id': username,  # Use just the username
        'level': f"{cluster_name[0]}/{tenant}"  # Use level header for tenant context
    }
    
    if subtenant:
        headers['level'] = f"{cluster_name[0]}/{tenant}/{subtenant}"
    
    try:
        response = requests.put(url, headers=headers, json=update_data, verify=False)
        if response.status_code == 200:
            print(f"Successfully updated user {username}")
        else:
            print(f"Failed to update user: {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"Error updating user: {str(e)}")

def update_tenant(server_ip: str, token: str, tenant: str, admin_user: str = None, admin_password: str = None, io_priority: int = None):
    """Update tenant properties including admin password.
    
    Args:
        server_ip: The server IP address
        token: Authentication token
        tenant: Tenant name
        admin_user: Primary admin username
        admin_password: Primary admin password
        io_priority: IO Priority value (1-63)
    """
    # Get cluster name
    cluster_name = get_clusters(server_ip, token)
    if not cluster_name:
        print("No clusters found")
        return

    # Check if tenant exists
    if not check_tenant_exists(server_ip, token, cluster_name[0], tenant):
        print(f"Tenant '{tenant}' does not exist")
        return

    # Use the tenant update endpoint
    url = f"https://{server_ip}/redapi/v1/clusters/{cluster_name[0]}/tenants/{tenant}"

    # Prepare update data
    update_data = {
        "name": tenant,
        "xattrs": {
            "RED_INTERNAL": {}
        }
    }

    # Add admin user if provided
    if admin_user:
        update_data["xattrs"]["RED_INTERNAL"]["primary-admin"] = admin_user

    # Add admin password if provided
    if admin_password:
        update_data["xattrs"]["RED_INTERNAL"]["primary-password"] = admin_password

    # Add IO priority if provided
    if io_priority is not None:
        if not 1 <= io_priority <= 63:
            print("IO priority must be between 1 and 63")
            return
        update_data["weight"] = io_priority

    # Make the API call
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.put(url, headers=headers, json=update_data, verify=False)
        if response.status_code == 200:
            print(f"Successfully updated tenant {tenant}")
            if admin_password:
                print("Admin password has been updated")
            if io_priority:
                print(f"IO priority has been set to {io_priority}")
        else:
            print(f"Failed to update tenant: {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"Error updating tenant: {str(e)}")

def delete_user(server_ip, token, username, tenant_name):
    """Delete a user from a tenant."""
    # Get the cluster name from the API
    clusters = get_clusters(server_ip, token)
    if not clusters:
        print("No clusters found")
        return False
    
    cluster_name = clusters[0]  # Use the first cluster
    
    # Check if tenant exists
    if not check_tenant_exists(server_ip, token, cluster_name, tenant_name):
        print(f"Tenant {tenant_name} does not exist")
        return False
    
    url = f"https://{server_ip}/redapi/v1/user"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}",
        "Level": f"{cluster_name}/{tenant_name}"
    }
    params = {
        "username": username
    }
    
    try:
        response = requests.delete(url, headers=headers, params=params, verify=False)
        response.raise_for_status()
        print(f"Successfully deleted user {username} from tenant {tenant_name}")
        return True
    except requests.RequestException as e:
        print(f"Error deleting user: {e}", file=sys.stderr)
        return False

def delete_subtenant(server_ip, token, tenant_name, subtenant_name):
    """Delete a subtenant from a tenant."""
    # Get the cluster name from the API
    clusters = get_clusters(server_ip, token)
    if not clusters:
        print("No clusters found")
        return False
    
    cluster_name = clusters[0]  # Use the first cluster
    
    # Check if tenant exists
    if not check_tenant_exists(server_ip, token, cluster_name, tenant_name):
        print(f"Tenant {tenant_name} does not exist")
        return False
    
    url = f"https://{server_ip}/redapi/v1/subtenant"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}",
        "Level": f"{cluster_name}/{tenant_name}"
    }
    params = {
        "subtenant": subtenant_name
    }
    
    try:
        response = requests.delete(url, headers=headers, params=params, verify=False)
        response.raise_for_status()
        print(f"Successfully deleted subtenant {subtenant_name} from tenant {tenant_name}")
        return True
    except requests.RequestException as e:
        print(f"Error deleting subtenant: {e}", file=sys.stderr)
        return False

def delete_tenant(server_ip, token, tenant_name):
    """Delete a tenant."""
    # Get the cluster name from the API
    clusters = get_clusters(server_ip, token)
    if not clusters:
        print("No clusters found")
        return False
    
    cluster_name = clusters[0]  # Use the first cluster
    
    # Check if tenant exists
    if not check_tenant_exists(server_ip, token, cluster_name, tenant_name):
        print(f"Tenant {tenant_name} does not exist")
        return False
    
    url = f"https://{server_ip}/redapi/v1/tenant"
    headers = {
        "accept": "*/*",
        "Authorization": f"Bearer {token}",
        "Level": cluster_name
    }
    params = {
        "tenant": tenant_name
    }
    
    try:
        response = requests.delete(url, headers=headers, params=params, verify=False)
        response.raise_for_status()
        print(f"Successfully deleted tenant {tenant_name}")
        return True
    except requests.RequestException as e:
        print(f"Error deleting tenant: {e}", file=sys.stderr)
        return False

def main():
    # Define command groups
    auth_commands = {
        'auth-login': 'Authenticate and obtain a token',
        'auth-token': 'Display the current token',
        'auth-grant': 'Grant RED capabilities to a user'
    }

    tenant_commands = {
        'tenant-list': 'Show tenants summary',
        'tenant-create': 'Create a new tenant',
        'tenant-update': 'Update tenant properties',
        'tenant-delete': 'Delete a tenant',
        'subtenant-list': 'Show subtenants summary',
        'subtenant-create': 'Create a new subtenant',
        'subtenant-delete': 'Delete a subtenant'
    }

    user_commands = {
        'user-list': 'List users summary',
        'user-create': 'Create a new user',
        'user-update': 'Update a user',
        'user-delete': 'Delete a user'
    }

    system_commands = {
        'cluster-list': 'Display clusters summary',
        'node-list': 'Display nodes summary',
        'drive-list': 'Show drives summary',
        'drive-list-by-node': 'Show drives grouped by node',
        'drive-summary': 'Display detailed drive summary',
        'network-list': 'Show network summary',
        'network-group-list': 'Display network groups',
        'control-ip-list': 'Display control IPs summary',
        'hsn-ip-list': 'Show HSN IPs summary'
    }

    s3_commands = {
        's3-list': 'Show S3 access summary',
        's3-endpoint-list': 'List S3 endpoints'
    }

    realm_commands = {
        'realm-list': 'Show realm summary'
    }

    misc_commands = {
        'swagger-show': 'Show Swagger UI URL',
        'version-show': 'Display version information',
        'fox-show': 'Display ASCII art fox'
    }

    # Create the parser with custom help formatter
    class CustomHelpFormatter(argparse.HelpFormatter):
        def _format_action(self, action):
            if isinstance(action, argparse._SubParsersAction):
                # Get all commands
                all_commands = {**auth_commands, **tenant_commands, **user_commands,
                              **system_commands, **s3_commands, **realm_commands,
                              **misc_commands}
                
                # Format the help text
                help_text = "\nCommands:\n"
                
                # Authentication Commands
                help_text += "\nAuthentication Commands:\n"
                for cmd, desc in auth_commands.items():
                    help_text += f"  {cmd:<20} {desc}\n"
                
                # Tenant Management Commands
                help_text += "\nTenant Management Commands:\n"
                for cmd, desc in tenant_commands.items():
                    help_text += f"  {cmd:<20} {desc}\n"
                
                # User Management Commands
                help_text += "\nUser Management Commands:\n"
                for cmd, desc in user_commands.items():
                    help_text += f"  {cmd:<20} {desc}\n"
                
                # System Information Commands
                help_text += "\nSystem Information Commands:\n"
                for cmd, desc in system_commands.items():
                    help_text += f"  {cmd:<20} {desc}\n"
                
                # S3 Management Commands
                help_text += "\nS3 Management Commands:\n"
                for cmd, desc in s3_commands.items():
                    help_text += f"  {cmd:<20} {desc}\n"
                
                # Realm Management Commands
                help_text += "\nRealm Management Commands:\n"
                for cmd, desc in realm_commands.items():
                    help_text += f"  {cmd:<20} {desc}\n"
                
                # Miscellaneous Commands
                help_text += "\nMiscellaneous Commands:\n"
                for cmd, desc in misc_commands.items():
                    help_text += f"  {cmd:<20} {desc}\n"
                
                return help_text
            return super()._format_action(action)

    parser = argparse.ArgumentParser(
        description="Quick-Red: A command-line tool for system management",
        formatter_class=CustomHelpFormatter
    )

    # Add general options
    parser.add_argument('-server-ip', help='Server IP address or FQDN', type=validate_ip_or_fqdn)
    parser.add_argument('-token', help='Authentication token')

    # Create subparsers for commands
    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # Add commands and their specific options
    for cmd, help_text in {**auth_commands, **tenant_commands, **user_commands, 
                          **system_commands, **s3_commands, **realm_commands, 
                          **misc_commands}.items():
        cmd_parser = subparsers.add_parser(cmd, help=help_text)
        
        # Add command-specific options
        if cmd == 'auth-login':
            cmd_parser.add_argument('-username', help='Username for authentication')
            cmd_parser.add_argument('-user', help='Username for authentication (alternative to -username)')
            cmd_parser.add_argument('-password', help='Password for authentication')
            cmd_parser.add_argument('-tenant', help='Tenant name for tenant admin login')
            cmd_parser.add_argument('-subtenant', help='Subtenant name for subtenant user login')
        
        elif cmd in ['tenant-create', 'tenant-update', 'tenant-delete']:
            cmd_parser.add_argument('-tenant', required=True, help='Tenant name')
            if cmd in ['tenant-create', 'tenant-update']:
                cmd_parser.add_argument('-admin-user', help='Primary admin username')
                cmd_parser.add_argument('-admin-pass', help='Primary admin password')
                if cmd == 'tenant-update':
                    cmd_parser.add_argument('-io-priority', type=int, help='IO Priority value (1-63)')
        
        elif cmd in ['subtenant-create', 'subtenant-list', 'subtenant-delete']:
            cmd_parser.add_argument('-tenant', required=True, help='Tenant name')
            if cmd in ['subtenant-create', 'subtenant-delete']:
                cmd_parser.add_argument('-subtenant', required=True, help='Subtenant name')
                if cmd == 'subtenant-create':
                    cmd_parser.add_argument('-admins', help='Comma-separated list of admin usernames')
                    cmd_parser.add_argument('-viewers', help='Comma-separated list of viewer usernames')
        
        elif cmd in ['user-create', 'user-update', 'user-delete']:
            cmd_parser.add_argument('-username', required=True, help='Username')
            cmd_parser.add_argument('-tenant', required=True, help='Tenant name')
            cmd_parser.add_argument('-subtenant', help='Subtenant name')
            if cmd == 'user-update':
                cmd_parser.add_argument('-name', help='User\'s full name')
                cmd_parser.add_argument('-email', help='User\'s email address')
                cmd_parser.add_argument('-new-password', help='New password')
                cmd_parser.add_argument('-caps', help='User\'s capabilities')
                cmd_parser.add_argument('-identity', help='User\'s identity')
                cmd_parser.add_argument('-groups', help='User\'s groups')
        
        elif cmd == 'auth-grant':
            cmd_parser.add_argument('-username', required=True, help='Username to grant RED capabilities to')
            cmd_parser.add_argument('-tenant', help='Tenant name')
            cmd_parser.add_argument('-subtenant', help='Subtenant name')

    args = parser.parse_args()

    # Handle server IP
    server_ip = args.server_ip or os.environ.get('RED_SERVER_IP') or 'localhost'

    # Handle authentication
    if args.command == 'auth-login':
        username = args.username or args.user or os.environ.get('RED_USER') or input("Username: ")
        password = args.password or os.environ.get('RED_PASSWORD') or getpass.getpass("Password: ")
        
        # If tenant is specified, use it for login
        if args.tenant:
            print(f"Logging in as tenant admin for tenant: {args.tenant}")
            if args.subtenant:
                print(f"With subtenant context: {args.subtenant}")
        else:
            print("Logging in as realm administrator")
            
        login(server_ip, username, password, args.tenant, args.subtenant)
    elif args.command != 'fox-show':
        token = args.token or read_token_from_file(server_ip)
        
        if token and validate_token(server_ip, token):
            print("Using existing token.", file=sys.stderr)
        else:
            print("Existing token is invalid or not found. Initiating login procedure.", file=sys.stderr)
            username = args.username or args.user or os.environ.get('RED_USER') or input("Username: ")
            password = args.password or os.environ.get('RED_PASSWORD') or getpass.getpass("Password: ")
            
            # If tenant is specified, use it for login
            if args.tenant:
                print(f"Logging in as tenant admin for tenant: {args.tenant}")
                if args.subtenant:
                    print(f"With subtenant context: {args.subtenant}")
            else:
                print("Logging in as realm administrator")
                
            if login(server_ip, username, password, args.tenant, args.subtenant):
                token = read_token_from_file(server_ip)
            else:
                print("Error: Failed to acquire token. Exiting.", file=sys.stderr)
                sys.exit(1)
        
        print(f"Using server IP: {server_ip}", file=sys.stderr)

        # Execute the appropriate command
        if args.command == 'cluster-list':
            clusters_summary(server_ip, token)
        elif args.command == 'control-ip-list':
            control_ips_summary(server_ip, token)
        elif args.command == 'tenant-create':
            if not args.admin_user:
                print("Error: -admin-user is required for tenant creation", file=sys.stderr)
                sys.exit(1)
            create_tenant(server_ip, token, args.tenant, args.admin_user)
        elif args.command == 'user-create':
            if not all([args.username, args.tenant]):
                print("Error: -username and -tenant arguments are required for user-create command", file=sys.stderr)
                sys.exit(1)
            create_user(server_ip, token, args.username, args.tenant)
        elif args.command == 'subtenant-list':
            subtenants_summary(server_ip, token, args.tenant)
        elif args.command == 'subtenant-create':
            if not all([args.tenant, args.subtenant]):
                print("Error: Tenant name and subtenant name are required", file=sys.stderr)
                return
            
            # Parse optional admin and viewer lists
            admins = args.admins.split(',') if args.admins else None
            viewers = args.viewers.split(',') if args.viewers else None
            
            create_subtenant(server_ip, token, args.tenant, args.subtenant, admins, viewers)
        elif args.command == 'user-update':
            if args.user:
                update_user(server_ip=server_ip, token=token, user_spec=args.user, 
                           name=args.name, email=args.email, password=args.new_password,
                           caps=args.caps, identity=args.identity, groups=args.groups)
            elif args.tenant and args.username:
                update_user(server_ip=server_ip, token=token, tenant=args.tenant, subtenant=args.subtenant,
                           username=args.username, name=args.name, email=args.email,
                           password=args.new_password, caps=args.caps, identity=args.identity,
                           groups=args.groups)
            else:
                print("Error: Either -user or both -tenant and -username arguments are required for user-update")
                return
        elif args.command == 'tenant-update':
            update_tenant(server_ip, token, args.tenant, args.admin_user, args.admin_pass, args.io_priority)
        elif args.command == 'drive-summary':
            drive_summary(server_ip, token)
        elif args.command == 'drive-summary-test':
            drive_summary_test(server_ip, token)
        elif args.command == 'drive-list':
            drives_summary(server_ip, token)
        elif args.command == 'drive-list-by-node':
            drives_by_node(server_ip, token)
        elif args.command == 's3-endpoint-list':
            show_endpoints(server_ip, token)
        elif args.command == 'fox-show':
            print_fox()
        elif args.command == 'auth-grant':
            grants(server_ip, args.username, token)
        elif args.command == 'hsn-ip-list':
            hsn_ips_summary(server_ip, token)
        elif args.command == 'network-list':
            network_summary(server_ip, token)
        elif args.command == 'network-group-list':
            network_groups(server_ip, token)
        elif args.command == 'node-list':
            nodes_summary(server_ip, token)
        elif args.command == 'realm-list':
            realm_summary(server_ip, token)
        elif args.command == 's3-list':
            s3_summary(server_ip, token)
        elif args.command == 'swagger-show':
            show_swagger_url(server_ip, token)
        elif args.command == 'tenant-list':
            tenants_summary(server_ip, token)
        elif args.command == 'auth-token':
            show_token(token)
        elif args.command == 'user-list':
            users_summary(server_ip, token)
        elif args.command == 'version-show':
            version_summary(server_ip, token)
        elif args.command == 'user-delete':
            if not all([args.username, args.tenant]):
                print("Error: -username and -tenant arguments are required for user-delete command", file=sys.stderr)
                sys.exit(1)
            delete_user(server_ip, token, args.username, args.tenant)
        elif args.command == 'subtenant-delete':
            if not all([args.tenant, args.subtenant]):
                print("Error: -tenant and -subtenant arguments are required for subtenant-delete command", file=sys.stderr)
                sys.exit(1)
            delete_subtenant(server_ip, token, args.tenant, args.subtenant)
        elif args.command == 'tenant-delete':
            if not args.tenant:
                print("Error: -tenant argument is required for tenant-delete command", file=sys.stderr)
                sys.exit(1)
            delete_tenant(server_ip, token, args.tenant)

if __name__ == "__main__":
    main()
