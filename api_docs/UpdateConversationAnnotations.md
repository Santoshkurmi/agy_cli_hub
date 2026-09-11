# `UpdateConversationAnnotations` (Conversation View Timestamps & Annotations RPC)

## 1. Overview & Purpose
`UpdateConversationAnnotations` records client view timestamps (`lastUserViewTime`), unread badges, and custom annotations across one or more conversation IDs.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/UpdateConversationAnnotations`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/UpdateConversationAnnotations HTTP/1.1
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
  "cascadeIds": [
    "8931c764-d295-45c7-b362-c23fcea804cc",
    "f114692e-a724-47fd-b3bf-969760907bbf"
  ],
  "annotations": {
    "lastUserViewTime": "2026-09-11T13:04:02.397Z"
  },
  "mergeAnnotations": true
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class UpdateConversationAnnotationsRequestDto(
    val cascadeIds: List<String> = emptyList(),
    val annotations: Map<String, String> = emptyMap(),
    val mergeAnnotations: Boolean = true
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
data class UpdateConversationAnnotationsResponseDto(
    val success: Boolean = true
)
```
