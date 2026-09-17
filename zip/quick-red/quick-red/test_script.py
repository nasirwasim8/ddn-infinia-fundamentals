#!/usr/bin/env python3

import yaml
import subprocess
import sys
import time
import os
from typing import List, Dict, Any, Optional

def run_command(command: List[str]) -> bool:
    """Run a command and return True if successful."""
    try:
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error running command: {' '.join(command)}")
            print(f"Error: {result.stderr}")
            return False
        print(f"Success: {' '.join(command)}")
        return True
    except Exception as e:
        print(f"Exception running command: {' '.join(command)}")
        print(f"Error: {str(e)}")
        return False

def get_auth_token(server_ip: str, username: str, password: str) -> Optional[str]:
    """Get authentication token using realm admin credentials."""
    cmd = [
        'python3', 'quick-red.py',
        '-server-ip', server_ip,
        'auth-login',
        '-username', username,
        '-password', password
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error getting auth token: {result.stderr}")
            return None
        
        # Read token from file
        config_dir = os.path.expanduser('~/.config/red')
        token_file = os.path.join(config_dir, f"quick-red-token-{server_ip}")
        if os.path.exists(token_file):
            with open(token_file, 'r') as f:
                token = f.read().strip()
                if token:
                    print("Successfully obtained authentication token")
                    return token
        
        print("No token found in token file")
        return None
    except Exception as e:
        print(f"Exception getting auth token: {str(e)}")
        return None

def run_list_commands(server_ip: str, token: str):
    """Run all list commands to show current state."""
    list_commands = [
        ['python3', 'quick-red.py', '-server-ip', server_ip, '-token', token, 'tenant-list'],
        ['python3', 'quick-red.py', '-server-ip', server_ip, '-token', token, 'subtenant-list', '-tenant', 'all'],
        ['python3', 'quick-red.py', '-server-ip', server_ip, '-token', token, 'user-list'],
        ['python3', 'quick-red.py', '-server-ip', server_ip, '-token', token, 's3-list'],
        ['python3', 'quick-red.py', '-server-ip', server_ip, '-token', token, 's3-endpoint-list']
    ]
    
    print("\nRunning list commands to show current state:")
    for cmd in list_commands:
        run_command(cmd)
        time.sleep(1)  # Small delay between commands

def create_resources(config: Dict[str, Any], server_ip: str, token: str, default_password: str) -> List[str]:
    """Create resources in order and return list of created resources for cleanup."""
    created_resources = []
    
    # Create tenants and their resources
    for tenant_name, tenant_data in config['tenants'].items():
        # Create tenant
        cmd = [
            'python3', 'quick-red.py',
            '-server-ip', server_ip,
            '-token', token,
            'tenant-create',
            '-tenant', tenant_name,
            '-admin-user', tenant_data['admin']
        ]
        if run_command(cmd):
            created_resources.append(f"tenant:{tenant_name}")
        
        # Create subtenants and their resources
        for subtenant_name, subtenant_data in tenant_data['subtenants'].items():
            # Create subtenant
            cmd = [
                'python3', 'quick-red.py',
                '-server-ip', server_ip,
                '-token', token,
                'subtenant-create',
                '-tenant', tenant_name,
                '-subtenant', subtenant_name
            ]
            if run_command(cmd):
                created_resources.append(f"subtenant:{tenant_name}:{subtenant_name}")
            
            # Create users (skipping realm_admin)
            for username in subtenant_data['users']:
                if username != 'realm_admin':  # Skip realm_admin user
                    cmd = [
                        'python3', 'quick-red.py',
                        '-server-ip', server_ip,
                        '-token', token,
                        'user-create',
                        '-username', username,
                        '-tenant', tenant_name
                    ]
                    if run_command(cmd):
                        created_resources.append(f"user:{tenant_name}:{subtenant_name}:{username}")
    
    return created_resources

def delete_resources(config: Dict[str, Any], server_ip: str, token: str) -> None:
    """Delete resources in reverse order of creation."""
    # Process tenants in reverse order
    for tenant_name, tenant_data in reversed(list(config['tenants'].items())):
        # Process subtenants in reverse order
        for subtenant_name, subtenant_data in reversed(list(tenant_data['subtenants'].items())):
            # Delete users first (skipping realm_admin)
            for username in reversed(subtenant_data['users']):
                if username != 'realm_admin':  # Skip realm_admin user
                    cmd = [
                        'python3', 'quick-red.py',
                        '-server-ip', server_ip,
                        '-token', token,
                        'user-delete',
                        '-username', username,
                        '-tenant', tenant_name
                    ]
                    run_command(cmd)
                    time.sleep(1)  # Small delay between commands
            
            # Delete subtenant
            cmd = [
                'python3', 'quick-red.py',
                '-server-ip', server_ip,
                '-token', token,
                'subtenant-delete',
                '-tenant', tenant_name,
                '-subtenant', subtenant_name
            ]
            run_command(cmd)
            time.sleep(1)  # Small delay between commands
        
        # Delete tenant
        cmd = [
            'python3', 'quick-red.py',
            '-server-ip', server_ip,
            '-token', token,
            'tenant-delete',
            '-tenant', tenant_name
        ]
        run_command(cmd)
        time.sleep(1)  # Small delay between commands

def main():
    # Read the YAML configuration
    try:
        with open('test_config.yaml', 'r') as f:
            config = yaml.safe_load(f)
    except Exception as e:
        print(f"Error reading test_config.yaml: {str(e)}")
        sys.exit(1)
    
    # Get server IP and credentials
    server_ip = config['server']['ip']
    username = config['server']['realm']['username']
    password = config['server']['realm']['password']
    
    # Get authentication token
    token = get_auth_token(server_ip, username, password)
    if not token:
        print("Failed to get authentication token. Exiting.")
        sys.exit(1)
    
    # Run list commands to show initial state
    print("\nInitial state before deletion:")
    run_list_commands(server_ip, token)
    
    # Delete resources
    print("\nDeleting resources...")
    delete_resources(config, server_ip, token)
    
    # Run list commands to show final state
    print("\nFinal state after deletion:")
    run_list_commands(server_ip, token)
    
    print("\nDeletion test completed!")

if __name__ == '__main__':
    main() 