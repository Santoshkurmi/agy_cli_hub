# `ResolveOutstandingSteps` (Pending Step Resolution RPC)

## 1. Overview & Purpose
`ResolveOutstandingSteps` explicitly marks outstanding, unresolved, or pending steps as resolved in the daemon. It is typically called when resuming a conversation or clearing dangling interactive questionnaires from previous app sessions.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/ResolveOutstandingSteps`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/ResolveOutstandingSteps HTTP/1.1
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
  "cascadeId": "f114692e-a724-47fd-b3bf-969760907bbf",
  "resolvedStepIndices": [
    7,
    12
  ]
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class ResolveOutstandingStepsRequestDto(
    val cascadeId: String = "",
    val resolvedStepIndices: List<Int> = emptyList()
)
```

---

## 4. Concrete Response Schema

### Response Frame #1 (DATA)
```json
{}
```

### Response Frame #2 (TRAILER)
```http
grpc-status: 0
```

### Kotlin `@Serializable` Response Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class ResolveOutstandingStepsResponseDto(
    val success: Boolean = true
)
```
