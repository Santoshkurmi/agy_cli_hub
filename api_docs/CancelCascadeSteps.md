# `CancelCascadeSteps` (Selective Step Cancellation RPC)

## 1. Overview & Purpose
`CancelCascadeSteps` allows selective cancellation of specific step indices (e.g. aborting an individual long-running shell command, killing a background subagent task, or cancelling a pending questionnaire) without aborting the entire conversation session.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/CancelCascadeSteps`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/CancelCascadeSteps HTTP/1.1
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
  "stepIndices": [
    4,
    7
  ]
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class CancelCascadeStepsRequestDto(
    val cascadeId: String = "",
    val stepIndices: List<Int> = emptyList()
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
data class CancelCascadeStepsResponseDto(
    val success: Boolean = true
)
```
