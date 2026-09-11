# `GetAllRules` (Behavioral Rules & Style Guidelines RPC)

## 1. Overview & Purpose
`GetAllRules` retrieves all style guidelines, constraint files (`GEMINI.md`, `AGENTS.md`), and directory rules loaded across workspaces and global configurations.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetAllRules`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetAllRules HTTP/1.1
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
{
  "includeShadowed": true
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetAllRulesRequestDto(
    val includeShadowed: Boolean = true
)
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "rules": [
    {
      "path": "/home/cat/project/GEMINI.md",
      "content": "# Project Rules\n\n- Maintain clean code\n- Use Kotlin Serialization",
      "scope": "RULE_SCOPE_WORKSPACE"
    }
  ]
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetAllRulesResponseDto(
    val rules: List<RuleDefinitionDto> = emptyList()
)

@Serializable
data class RuleDefinitionDto(
    val path: String = "",
    val content: String = "",
    val scope: String = "RULE_SCOPE_WORKSPACE"
)
```
