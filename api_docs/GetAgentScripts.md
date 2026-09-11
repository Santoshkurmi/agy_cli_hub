# `GetAgentScripts` (Custom Agent Executable Scripts RPC)

## 1. Overview & Purpose
`GetAgentScripts` returns executable helper scripts located in skill `scripts/` directories.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetAgentScripts`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetAgentScripts HTTP/1.1
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
class GetAgentScriptsRequestDto
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "scripts": [
    {
      "name": "generate_docs.py",
      "path": "/home/cat/.gemini/config/skills/api-docs/scripts/generate_docs.py",
      "interpreter": "python3"
    }
  ]
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetAgentScriptsResponseDto(
    val scripts: List<AgentScriptDto> = emptyList()
)

@Serializable
data class AgentScriptDto(
    val name: String = "",
    val path: String = "",
    val interpreter: String = ""
)
```
