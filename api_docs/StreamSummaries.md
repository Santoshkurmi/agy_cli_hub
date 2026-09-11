# `StreamSummaries` / `JetboxSubscribe` (Live Conversation Sidebar Sync RPC)

## 1. Overview & Purpose
`StreamSummaries` establishes a persistent server-streaming subscription to Jetbox metadata updates. Whenever a conversation title is generated, modified time is updated, or new steps are added anywhere across the daemon, a summary frame is pushed immediately to the client to update the sidebar.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/StreamSummaries` (or `JetboxSubscribe`)
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/StreamSummaries HTTP/1.1
Host: 127.0.0.1:8090
Content-Type: application/grpc-web+proto
Accept: application/grpc-web+proto
Connect-Protocol-Version: 1
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
class StreamSummariesRequestDto
```

---

## 4. Concrete Response Stream Frame

### Response Frame (JSON)
```json
{
  "summaryUpdate": {
    "cascadeId": "f114692e-a724-47fd-b3bf-969760907bbf",
    "summary": "AI Model & Tool Execution Test",
    "lastModifiedTime": "2026-09-11T12:57:40.392Z",
    "stepCount": 65,
    "status": "CASCADE_RUN_STATUS_IDLE"
  }
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class StreamSummariesFrameDto(
    val summaryUpdate: CascadeTrajectorySummaryDto? = null,
    val trajectorySummaries: Map<String, CascadeTrajectorySummaryDto>? = null
)
```
