# `CancelCascadeInvocation` (Execution Interruption & Cancellation RPC)

## 1. Overview & Purpose
`CancelCascadeInvocation` interrupts an active cascade execution loop. It immediately:
- Halts ongoing model generation.
- Cancels active shell processes and background subagents (if `killBackgroundTasks` is `true`).
- Transitions active running steps to `CORTEX_STEP_STATUS_CANCELLED`.
- Emits a stream update over `StreamAgentStateUpdates` with `CASCADE_RUN_STATUS_IDLE`.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/CancelCascadeInvocation`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/CancelCascadeInvocation HTTP/1.1
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
  "killBackgroundTasks": true
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class CancelCascadeInvocationRequestDto(
    val cascadeId: String = "",
    val killBackgroundTasks: Boolean = true
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
data class CancelCascadeInvocationResponseDto(
    val success: Boolean = true
)
```

---

## 5. State Machine Impact
```
Active Run: CASCADE_RUN_STATUS_RUNNING
Active Steps: CORTEX_STEP_STATUS_RUNNING
               │
               ▼ [User presses Stop / Cancel]
               │
POST /CancelCascadeInvocation (killBackgroundTasks=true)
               │
               ▼
Stream Updates:
- Step.status -> CORTEX_STEP_STATUS_CANCELLED
- Cascade.status -> CASCADE_RUN_STATUS_IDLE
- Execution loop terminates cleanly
```
