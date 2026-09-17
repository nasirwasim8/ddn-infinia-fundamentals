#!/usr/bin/env python3

import asyncio
import json
import yaml
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional, Union
import re
import logging

from mcp.server.models import InitializationOptions
from mcp.server import NotificationOptions, Server
from mcp.types import (
    Resource,
    Tool,
    TextContent,
    ImageContent,
    EmbeddedResource,
    LoggingLevel
)
import mcp.types as types

class InfiniaAPITool:
    def __init__(self):
        self.spec: Optional[Dict[str, Any]] = None
        self.spec_path: Optional[str] = None

    def load_swagger_spec(self, file_path: str) -> str:
        """Load a Swagger/OpenAPI specification file."""
        try:
            path = Path(file_path)
            if not path.exists():
                raise FileNotFoundError(f"File not found: {file_path}")
            
            content = path.read_text(encoding='utf-8')
            
            if path.suffix.lower() == '.json':
                self.spec = json.loads(content)
            elif path.suffix.lower() in ['.yaml', '.yml']:
                self.spec = yaml.safe_load(content)
            else:
                raise ValueError("Unsupported file format. Please use .json, .yaml, or .yml")
            
            self.spec_path = file_path
            title = self.spec.get('info', {}).get('title', 'Unknown API')
            version = self.spec.get('info', {}).get('version', 'Unknown')
            
            return f"Successfully loaded Swagger spec: {title} v{version}"
            
        except Exception as e:
            raise Exception(f"Failed to load Swagger spec: {str(e)}")

    def get_api_info(self) -> str:
        """Get basic information about the loaded API specification."""
        if not self.spec:
            return "No API specification loaded"
        
        info = self.spec.get('info', {})
        servers = self.spec.get('servers', [])
        
        api_info = {
            'title': info.get('title', 'Unknown'),
            'version': info.get('version', 'Unknown'),
            'description': info.get('description', ''),
            'servers': [{'url': s.get('url'), 'description': s.get('description')} for s in servers],
            'total_endpoints': len(self.spec.get('paths', {}))
        }
        
        return json.dumps(api_info, indent=2)

    def list_endpoints(self) -> str:
        """List all available API endpoints."""
        if not self.spec:
            return "No API specification loaded"
        
        endpoints = []
        paths = self.spec.get('paths', {})
        
        for path, methods in paths.items():
            for method, operation in methods.items():
                if isinstance(operation, dict):
                    endpoints.append({
                        'path': path,
                        'method': method.upper(),
                        'summary': operation.get('summary'),
                        'operationId': operation.get('operationId'),
                        'tags': operation.get('tags', [])
                    })
        
        return json.dumps(endpoints, indent=2)

    def get_endpoint_details(self, path: str, method: str) -> str:
        """Get detailed information about a specific API endpoint."""
        if not self.spec:
            return "No API specification loaded"
        
        paths = self.spec.get('paths', {})
        operation = paths.get(path, {}).get(method.lower())
        
        if not operation:
            return f"Endpoint {method.upper()} {path} not found"
        
        return json.dumps(operation, indent=2)

    def generate_client_code(self, path: str, method: str, language: str = 'python') -> str:
        """Generate client code for a specific API endpoint."""
        if not self.spec:
            return "No API specification loaded"
        
        paths = self.spec.get('paths', {})
        operation = paths.get(path, {}).get(method.lower())
        
        if not operation:
            return f"Endpoint {method.upper()} {path} not found"
        
        method_upper = method.upper()
        servers = self.spec.get('servers', [])
        base_url = servers[0]['url'] if servers else 'https://your-infinia-server.com'
        
        if language == 'python':
            return self._generate_python_client(path, method_upper, operation, base_url)
        elif language == 'typescript':
            return self._generate_typescript_client(path, method_upper, operation, base_url)
        elif language == 'javascript':
            return self._generate_javascript_client(path, method_upper, operation, base_url)
        elif language == 'curl':
            return self._generate_curl_command(path, method_upper, operation, base_url)
        else:
            return f"Unsupported language: {language}"

    def _generate_python_client(self, path: str, method: str, operation: Dict[str, Any], base_url: str) -> str:
        """Generate Python client code."""
        operation_id = operation.get('operationId', f"{method.lower()}_{re.sub(r'[^a-zA-Z0-9]', '_', path)}")
        function_name = re.sub(r'[^a-zA-Z0-9_]', '_', operation_id)
        parameters = operation.get('parameters', [])
        request_body = operation.get('requestBody')
        
        # Generate function parameters
        path_params = [p for p in parameters if p.get('in') == 'path']
        query_params = [p for p in parameters if p.get('in') == 'query']
        
        param_list = []
        if path_params:
            for param in path_params:
                param_type = self._get_python_type(param.get('schema', {}))
                param_list.append(f"{param['name']}: {param_type}")
        
        if query_params:
            param_list.append("query_params: Optional[Dict[str, Any]] = None")
        
        if request_body:
            param_list.append("data: Optional[Dict[str, Any]] = None")
        
        params_str = ", ".join(param_list)
        if params_str:
            params_str = ", " + params_str
        
        # Generate URL construction
        url_construction = f'url = f"{base_url}{path}"'
        if path_params:
            for param in path_params:
                url_construction += f'\n    url = url.replace("{{{param["name"]}}}", str({param["name"]}))'
        
        # Generate query parameters handling
        query_handling = ""
        if query_params:
            query_handling = """
    params = {}
    if query_params:
        params.update(query_params)"""
        
        # Generate request body handling
        body_handling = ""
        if request_body:
            body_handling = """
    json_data = data if data else None"""
        
        return f'''
"""
Generated Python client for {method} {path}
{operation.get('summary', '')}
"""

import requests
from typing import Optional, Dict, Any, Union

def {function_name}(
    base_url: str = "{base_url}",
    api_key: Optional[str] = None{params_str}
) -> Dict[str, Any]:
    """
    {operation.get('summary', f'{method} {path}')}
    
    Args:
        base_url: Base URL for the API
        api_key: API authentication key{self._generate_param_docs(parameters, request_body)}
    
    Returns:
        Dict containing the API response
        
    Raises:
        requests.HTTPError: If the API request fails
    """
    {url_construction}
    
    headers = {{
        'Content-Type': 'application/json',
    }}
    
    if api_key:
        headers['Authorization'] = f'Bearer {{api_key}}'
    {query_handling}{body_handling}
    
    response = requests.{method.lower()}(
        url,
        headers=headers,{f"""
        params=params,""" if query_params else ""}{f"""
        json=json_data,""" if request_body else ""}
        timeout=30
    )
    
    response.raise_for_status()
    return response.json()


# Example usage:
if __name__ == "__main__":
    try:
        result = {function_name}(
            api_key="your-api-key-here"{"," if param_list else ""}
            {self._generate_example_params(parameters, request_body)}
        )
        print(json.dumps(result, indent=2))
    except requests.RequestException as e:
        print(f"API request failed: {{e}}")
'''.strip()

    def _generate_typescript_client(self, path: str, method: str, operation: Dict[str, Any], base_url: str) -> str:
        """Generate TypeScript client code."""
        function_name = operation.get('operationId', f"{method.lower()}{re.sub(r'[^a-zA-Z0-9]', '', path)}")
        parameters = operation.get('parameters', [])
        request_body = operation.get('requestBody')
        
        # Generate interface for parameters
        param_interface = ""
        if parameters or request_body:
            param_props = []
            
            for param in parameters:
                param_type = self._get_typescript_type(param.get('schema', {}))
                required = param.get('required', False)
                param_props.append(f"  {param['name']}{'?' if not required else ''}: {param_type};")
            
            if request_body:
                param_props.append("  data?: any;")
            
            if param_props:
                param_interface = f"""
interface {function_name.capitalize()}Params {{
{chr(10).join(param_props)}
}}
"""
        
        return f'''
{param_interface}
// Generated TypeScript client for {method} {path}
interface InfiniaApiClient {{
  baseUrl: string;
  apiKey?: string;
}}

async function {function_name}(
  client: InfiniaApiClient{f", params: {function_name.capitalize()}Params" if param_interface else ""}
): Promise<any> {{
  let url = `${{client.baseUrl}}{path}`;
  
  {self._generate_ts_path_replacement(parameters)}
  
  const urlObj = new URL(url);
  
  {self._generate_ts_query_params(parameters)}

  const headers: Record<string, string> = {{
    'Content-Type': 'application/json',
  }};
  
  if (client.apiKey) {{
    headers['Authorization'] = `Bearer ${{client.apiKey}}`;
  }}

  const response = await fetch(urlObj.toString(), {{
    method: '{method}',
    headers,{f"""
    body: JSON.stringify(params.data),""" if request_body else ""}
  }});

  if (!response.ok) {{
    throw new Error(`API request failed: ${{response.status}} ${{response.statusText}}`);
  }}

  return response.json();
}}

// Usage example:
const client: InfiniaApiClient = {{
  baseUrl: '{base_url}',
  apiKey: 'your-api-key-here'
}};

// {function_name}(client{f", {{ /* parameters */ }}" if param_interface else ""}).then(result => console.log(result));
'''.strip()

    def _generate_javascript_client(self, path: str, method: str, operation: Dict[str, Any], base_url: str) -> str:
        """Generate JavaScript client code."""
        function_name = operation.get('operationId', f"{method.lower()}{re.sub(r'[^a-zA-Z0-9]', '', path)}")
        parameters = operation.get('parameters', [])
        request_body = operation.get('requestBody')
        
        path_params = [p for p in parameters if p.get('in') == 'path']
        query_params = [p for p in parameters if p.get('in') == 'query']
        
        return f'''
// Generated JavaScript client for {method} {path}
async function {function_name}(client, params = {{}}) {{
  let url = `${{client.baseUrl}}{path}`;
  
  // Replace path parameters
  {chr(10).join([f"  if (params.{p['name']}) url = url.replace('{{{p['name']}}}', params.{p['name']});" for p in path_params])}
  
  const urlObj = new URL(url);
  
  // Add query parameters
  {chr(10).join([f"  if (params.{p['name']}) urlObj.searchParams.append('{p['name']}', params.{p['name']});" for p in query_params])}

  const headers = {{
    'Content-Type': 'application/json',
  }};
  
  if (client.apiKey) {{
    headers['Authorization'] = `Bearer ${{client.apiKey}}`;
  }}

  const response = await fetch(urlObj.toString(), {{
    method: '{method}',
    headers,{f"""
    body: JSON.stringify(params.data),""" if request_body else ""}
  }});

  if (!response.ok) {{
    throw new Error(`API request failed: ${{response.status}} ${{response.statusText}}`);
  }}

  return response.json();
}}

// Usage example:
const client = {{
  baseUrl: '{base_url}',
  apiKey: 'your-api-key-here'
}};

// {function_name}(client, {{ /* parameters */ }}).then(result => console.log(result));
'''.strip()

    def _generate_curl_command(self, path: str, method: str, operation: Dict[str, Any], base_url: str) -> str:
        """Generate a curl command example for the endpoint."""
        curl_lines = [
            f'curl -X {method.upper()} \\',
            f'  "{base_url}{path}" \\',
            '  -H "Content-Type: application/json" \\',
        ]
        auth_line = '  -H "Authorization: Bearer YOUR_API_KEY"'
        if operation.get('requestBody'):
            auth_line += ' \\'
            curl_lines.append(auth_line)
            curl_lines.append("  -d '{\"key\": \"value\"}'")
        else:
            curl_lines.append(auth_line)
        curl_lines.append("")
        curl_lines.append("# Example with parameters:")
        curl_lines.append("# Replace {param} placeholders with actual values")
        curl_lines.append("# Add query parameters with ?param=value&param2=value2")
        return "\n".join(curl_lines).strip()

    def _get_python_type(self, schema: Dict[str, Any]) -> str:
        """Convert OpenAPI schema type to Python type hint."""
        schema_type = schema.get('type', 'Any')
        if schema_type == 'string':
            return 'str'
        elif schema_type == 'integer':
            return 'int'
        elif schema_type == 'number':
            return 'float'
        elif schema_type == 'boolean':
            return 'bool'
        elif schema_type == 'array':
            return 'List[Any]'
        elif schema_type == 'object':
            return 'Dict[str, Any]'
        else:
            return 'Any'

    def _get_typescript_type(self, schema: Dict[str, Any]) -> str:
        """Convert OpenAPI schema type to TypeScript type."""
        schema_type = schema.get('type', 'any')
        if schema_type == 'string':
            return 'string'
        elif schema_type == 'integer' or schema_type == 'number':
            return 'number'
        elif schema_type == 'boolean':
            return 'boolean'
        elif schema_type == 'array':
            return 'any[]'
        elif schema_type == 'object':
            return 'any'
        else:
            return 'any'

    def _generate_param_docs(self, parameters: List[Dict[str, Any]], request_body: Optional[Dict[str, Any]]) -> str:
        """Generate parameter documentation for Python docstring."""
        docs = []
        for param in parameters:
            param_type = self._get_python_type(param.get('schema', {}))
            docs.append(f"        {param['name']}: {param.get('description', f'{param_type} parameter')}")
        
        if request_body:
            docs.append("        data: Request body data")
        
        return "\n" + "\n".join(docs) if docs else ""

    def _generate_example_params(self, parameters: List[Dict[str, Any]], request_body: Optional[Dict[str, Any]]) -> str:
        """Generate example parameters for function call."""
        examples = []
        
        path_params = [p for p in parameters if p.get('in') == 'path']
        for param in path_params:
            if param.get('schema', {}).get('type') == 'integer':
                examples.append(f"# {param['name']}=123")
            else:
                examples.append(f"# {param['name']}=\"example_value\"")
        
        query_params = [p for p in parameters if p.get('in') == 'query']
        if query_params:
            query_examples = [f"'{p['name']}': 'value'" for p in query_params[:2]]
            examples.append(f"# query_params={{{', '.join(query_examples)}}}")
        
        if request_body:
            examples.append("# data={'key': 'value'}")
        
        return "\n            ".join(examples)

    def _generate_ts_path_replacement(self, parameters: List[Dict[str, Any]]) -> str:
        """Generate TypeScript path parameter replacement code."""
        path_params = [p for p in parameters if p.get('in') == 'path']
        if not path_params:
            return ""
        
        replacements = []
        for param in path_params:
            replacements.append(f"  url = url.replace('{{{param['name']}}}', String(params.{param['name']}));")
        
        return "\n".join(replacements)

    def _generate_ts_query_params(self, parameters: List[Dict[str, Any]]) -> str:
        """Generate TypeScript query parameter handling code."""
        query_params = [p for p in parameters if p.get('in') == 'query']
        if not query_params:
            return ""
        
        param_checks = []
        for param in query_params:
            param_checks.append(f"  if (params.{param['name']}) urlObj.searchParams.append('{param['name']}', String(params.{param['name']}));")
        
        return "\n".join(param_checks)

    def get_schemas(self) -> str:
        """Get all data schemas/models defined in the API specification."""
        if not self.spec:
            return "No API specification loaded"
        
        components = self.spec.get('components', {})
        schemas = components.get('schemas', {})
        
        if not schemas:
            return "No schemas found in the API specification"
        
        return json.dumps(schemas, indent=2)

    def search_endpoints(self, query: str) -> str:
        """Search for API endpoints by keyword."""
        if not self.spec:
            return "No API specification loaded"
        
        results = []
        query_lower = query.lower()
        paths = self.spec.get('paths', {})
        
        for path, methods in paths.items():
            for method, operation in methods.items():
                if isinstance(operation, dict):
                    searchable_text = " ".join([
                        path,
                        method,
                        operation.get('summary', ''),
                        operation.get('description', ''),
                        operation.get('operationId', ''),
                        " ".join(operation.get('tags', []))
                    ]).lower()
                    
                    if query_lower in searchable_text:
                        results.append({
                            'path': path,
                            'method': method.upper(),
                            'summary': operation.get('summary'),
                            'description': operation.get('description'),
                            'operationId': operation.get('operationId'),
                            'tags': operation.get('tags', [])
                        })
        
        return json.dumps(results, indent=2)


# MCP Server Implementation
app = Server("infinia-api-tool")
tool_instance = InfiniaAPITool()

@app.list_tools()
async def handle_list_tools() -> List[Tool]:
    """List available tools."""
    logger = logging.getLogger(__name__)
    logger.debug("Listing available tools...")
    
    tools = [
        Tool(
            name="load_swagger_spec",
            description="Load a Swagger/OpenAPI specification file for the Infinia storage system",
            inputSchema={
                "type": "object",
                "properties": {
                    "filePath": {
                        "type": "string",
                        "description": "Path to the Swagger/OpenAPI specification file (.json, .yaml, or .yml)",
                    },
                },
                "required": ["filePath"],
            },
        ),
        Tool(
            name="get_api_info",
            description="Get basic information about the loaded API specification",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="list_endpoints",
            description="List all available API endpoints",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="get_endpoint_details",
            description="Get detailed information about a specific API endpoint",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The API endpoint path (e.g., /api/v1/storage)",
                    },
                    "method": {
                        "type": "string",
                        "description": "HTTP method (GET, POST, PUT, DELETE, etc.)",
                    },
                },
                "required": ["path", "method"],
            },
        ),
        Tool(
            name="generate_client_code",
            description="Generate client code for a specific API endpoint",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "The API endpoint path",
                    },
                    "method": {
                        "type": "string",
                        "description": "HTTP method",
                    },
                    "language": {
                        "type": "string",
                        "enum": ["python", "typescript", "javascript", "curl"],
                        "description": "Programming language for the generated code",
                        "default": "python",
                    },
                },
                "required": ["path", "method"],
            },
        ),
        Tool(
            name="get_schemas",
            description="Get all data schemas/models defined in the API specification",
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="search_endpoints",
            description="Search for API endpoints by keyword",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query to find endpoints",
                    },
                },
                "required": ["query"],
            },
        ),
    ]
    
    logger.debug(f"Registered {len(tools)} tools")
    return tools

@app.call_tool()
async def handle_call_tool(name: str, arguments: dict) -> List[types.TextContent]:
    """Handle tool calls."""
    logger = logging.getLogger(__name__)
    logger.debug(f"Handling tool call: {name} with arguments: {arguments}")
    
    try:
        if name == "load_swagger_spec":
            result = tool_instance.load_swagger_spec(arguments["filePath"])
        elif name == "get_api_info":
            result = tool_instance.get_api_info()
        elif name == "list_endpoints":
            result = tool_instance.list_endpoints()
        elif name == "get_endpoint_details":
            result = tool_instance.get_endpoint_details(arguments["path"], arguments["method"])
        elif name == "generate_client_code":
            result = tool_instance.generate_client_code(
                arguments["path"], 
                arguments["method"], 
                arguments.get("language", "python")
            )
        elif name == "get_schemas":
            result = tool_instance.get_schemas()
        elif name == "search_endpoints":
            result = tool_instance.search_endpoints(arguments["query"])
        else:
            result = f"Unknown tool: {name}"
            
        logger.debug(f"Tool call result: {result[:100]}...")  # Log first 100 chars of result
        return [types.TextContent(type="text", text=result)]
        
    except Exception as e:
        error_msg = f"Error executing {name}: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return [types.TextContent(type="text", text=error_msg)]

def main():
    """Run the MCP server."""
    import mcp.server.stdio
    
    # Set up logging
    logging.basicConfig(level=logging.DEBUG)
    logger = logging.getLogger(__name__)
    
    logger.debug("Starting MCP server...")
    logger.debug(f"App instance: {app}")
    
    try:
        mcp.server.stdio.stdio_server(app)
    except Exception as e:
        logger.error(f"Error running MCP server: {str(e)}", exc_info=True)
        raise

if __name__ == "__main__":
    main()