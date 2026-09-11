# `GetTurnDiff` (Turn File Changes & Diffs RPC)

## 1. Overview & Purpose
`GetTurnDiff` calculates and returns all workspace file modifications, line additions/deletions, and updated source code created or edited during a specific conversation turn (`stepIndex`).

It is used by the IDE to:
- Render the file diff chips / diff inspector at the bottom of an assistant message turn.
- Show before/after diff views for all files touched during the turn.
- Identify artifact vs workspace file changes.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetTurnDiff`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetTurnDiff HTTP/1.1
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
  "conversationId": "f114692e-a724-47fd-b3bf-969760907bbf",
  "stepIndex": 54
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetTurnDiffRequestDto(
    val conversationId: String = "",
    val stepIndex: Int = 0
)
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "fileDiffs": {
    "file:///home/cat/project/data_processor.py": {
      "additions": 27,
      "deletions": 0,
      "modifiedContents": "class DataTransformer:\n    pass\n",
      "isArtifactFile": false
    }
  },
  "totalAdditions": 27,
  "totalDeletions": 0,
  "turnStartIndex": 40,
  "turnEndIndexExclusive": 55
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetTurnDiffResponseDto(
    val fileDiffs: Map<String, FileDiffEntryDto> = emptyMap(),
    val totalAdditions: Int = 0,
    val totalDeletions: Int = 0,
    val turnStartIndex: Int = 0,
    val turnEndIndexExclusive: Int = 0,
    val userInput: CortexUserInputDto? = null
)

@Serializable
data class FileDiffEntryDto(
    val additions: Int = 0,
    val deletions: Int = 0,
    val modifiedContents: String = "",
    val isArtifactFile: Boolean = false
)
```
