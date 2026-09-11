# `GetMcpServerStates` (MCP Server Discovery & Tool Registry RPC)

## 1. Overview & Purpose
`GetMcpServerStates` discovers all configured Model Context Protocol (MCP) servers (stdio subprocesses, SSE/HTTP servers), their health status (`MCP_SERVER_STATUS_READY`, `MCP_SERVER_STATUS_ERROR`, `MCP_SERVER_STATUS_CONNECTING`), and their registered tool specifications.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetMcpServerStates`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetMcpServerStates HTTP/1.1
Host: 127.0.0.1:8090
Content-Type: application/grpc-web+json
Accept: */*
x-grpc-web: 1
Connect-Protocol-Version: 1
x-codeium-csrf-token: <CSRF_TOKEN>
```

---

## 3. Concrete Request Schema

### Request Body (JSON)
```json
{}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
class GetMcpServerStatesRequestDto
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "states": [
    {
      "spec": {
        "serverName": "dummy-mcp",
        "command": "/usr/bin/python3",
        "args": [
          "/home/cat/.gemini/mcp-servers/dummy_mcp.py"
        ]
      },
      "status": "MCP_SERVER_STATUS_READY",
      "tools": [
        {
          "name": "dummy_greeting",
          "description": "Returns a friendly greeting with current timestamp from the dummy MCP server.",
          "jsonSchemaString": "{\"properties\":{\"name\":{\"description\":\"The name of the person to greet\",\"type\":\"string\"}},\"required\":[\"name\"],\"type\":\"object\"}",
          "serverName": "dummy-mcp"
        }
      ],
      "serverInfo": {
        "name": "dummy-mcp",
        "version": "1.0.0"
      }
    }
  ]
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetMcpServerStatesResponseDto(
    val states: List<McpServerStateDto> = emptyList()
)

@Serializable
data class McpServerStateDto(
    val spec: McpServerSpecDto? = null,
    val status: String = "MCP_SERVER_STATUS_DISCONNECTED",
    val tools: List<McpToolDefinitionDto> = emptyList(),
    val toolErrors: List<String> = emptyList(),
    val serverInfo: McpServerInfoDto? = null,
    val error: String? = null
)

@Serializable
data class McpServerSpecDto(
    val serverName: String = "",
    val command: String = "",
    val args: List<String> = emptyList(),
    val env: Map<String, String> = emptyMap(),
    val serverUrl: String = "",
    val authProviderType: String = ""
)

@Serializable
data class McpToolDefinitionDto(
    val name: String = "",
    val description: String = "",
    val jsonSchemaString: String = "",
    val serverName: String = ""
)

@Serializable
data class McpServerInfoDto(
    val name: String = "",
    val version: String = ""
)
```
