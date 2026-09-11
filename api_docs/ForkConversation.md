# `ForkConversation` (Conversation Branching RPC)

## 1. Overview & Purpose
`ForkConversation` creates a new branched conversation session starting from an existing conversation trajectory up to a specified step index.

This allows the user to try an alternative approach or test a different AI model without mutating the original conversation history.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/ForkConversation`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/ForkConversation HTTP/1.1
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
  "sourceCascadeId": "f114692e-a724-47fd-b3bf-969760907bbf",
  "fromStepIndex": 24,
  "newCascadeId": "82a938fc-62d1-4cb5-827b-586b36ac59bb"
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class ForkConversationRequestDto(
    val sourceCascadeId: String = "",
    val fromStepIndex: Int = 0,
    val newCascadeId: String = ""
)
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "newCascadeId": "82a938fc-62d1-4cb5-827b-586b36ac59bb"
}
```

### Kotlin `@Serializable` Response Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class ForkConversationResponseDto(
    val newCascadeId: String = ""
)
```
