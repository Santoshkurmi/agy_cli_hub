# `RequestAgentStatePageUpdate` (Agent State Pagination & View Bounds RPC)

## 1. Overview & Purpose
`RequestAgentStatePageUpdate` informs the AGY Hub daemon about the client's currently visible step viewport/bounds (`stepPageBounds`), allowing the daemon to optimize memory and stream deltas specifically for the active viewport.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/RequestAgentStatePageUpdate`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/RequestAgentStatePageUpdate HTTP/1.1
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
  "conversationId": "8931c764-d295-45c7-b362-c23fcea804cc",
  "subscriberId": "fc1e24a3-1ef9-4b1e-8016-1b9d595e13ad",
  "stepPageBounds": {
    "startIndex": 0,
    "endIndex": 50
  }
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class RequestAgentStatePageUpdateRequestDto(
    val conversationId: String = "",
    val subscriberId: String = "",
    val stepPageBounds: StepPageBoundsDto = StepPageBoundsDto()
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
data class RequestAgentStatePageUpdateResponseDto(
    val success: Boolean = true
)
```
