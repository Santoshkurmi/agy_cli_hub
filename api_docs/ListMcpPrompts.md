# `ListMcpPrompts` (MCP Prompts & Template Catalog RPC)

## 1. Overview & Purpose
`ListMcpPrompts` queries connected MCP servers for registered prompt templates and shortcuts.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/ListMcpPrompts`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/ListMcpPrompts HTTP/1.1
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
class ListMcpPromptsRequestDto
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "prompts": [
    {
      "name": "code_review",
      "description": "Reviews source code files using MCP server analysis rules.",
      "arguments": [
        {
          "name": "filePath",
          "description": "Path to file to review",
          "required": true
        }
      ]
    }
  ]
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class ListMcpPromptsResponseDto(
    val prompts: List<McpPromptDto> = emptyList()
)

@Serializable
data class McpPromptDto(
    val name: String = "",
    val description: String = "",
    val arguments: List<McpPromptArgumentDto> = emptyList()
)

@Serializable
data class McpPromptArgumentDto(
    val name: String = "",
    val description: String = "",
    val required: Boolean = false
)
```
