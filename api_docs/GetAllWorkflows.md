# `GetAllWorkflows` (Legacy Workflows Registry RPC)

## 1. Overview & Purpose
`GetAllWorkflows` discovers legacy workflows from `.agents/workflows/` (which are progressively migrated to modern skills via the `migrate-workflows` skill).

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetAllWorkflows`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetAllWorkflows HTTP/1.1
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
class GetAllWorkflowsRequestDto
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "workflows": [
    {
      "name": "build_and_deploy",
      "path": "/home/cat/project/.agents/workflows/build_and_deploy.md",
      "description": "Standard build and deploy pipeline"
    }
  ]
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetAllWorkflowsResponseDto(
    val workflows: List<WorkflowDefinitionDto> = emptyList()
)

@Serializable
data class WorkflowDefinitionDto(
    val name: String = "",
    val path: String = "",
    val description: String = ""
)
```
