# `RevertToCascadeStep` (Conversation Step Rewind RPC)

## 1. Overview & Purpose
`RevertToCascadeStep` rewinds the active conversation trajectory to a previous step index. All steps downstream of `stepIndex` are pruned, and the workspace code state can optionally be rewound.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/RevertToCascadeStep`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/RevertToCascadeStep HTTP/1.1
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
  "stepIndex": 14,
  "model": "MODEL_PLACEHOLDER_M299",
  "autoExecutionPolicy": "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER"
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class RevertToCascadeStepRequestDto(
    val cascadeId: String = "",
    val stepIndex: Int = 0,
    val model: String = "",
    val autoExecutionPolicy: String = "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER"
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
data class RevertToCascadeStepResponseDto(
    val success: Boolean = true
)
```
