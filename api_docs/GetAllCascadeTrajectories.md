# `GetAllCascadeTrajectories` (Conversation History Directory RPC)

## 1. Overview & Purpose
`GetAllCascadeTrajectories` queries the AGY Hub daemon for the complete dictionary of saved and active conversation trajectories across workspaces.

It is used by the client for:
- Populating the conversation history sidebar / drawer.
- Showing conversation titles, step counts, last modified timestamps, and workspace bindings.
- Discovering existing conversations upon application startup.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories HTTP/1.1
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
  "excludeSubtrajectories": true
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetAllCascadeTrajectoriesRequestDto(
    val excludeSubtrajectories: Boolean = true
)
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "trajectorySummaries": {
    "f114692e-a724-47fd-b3bf-969760907bbf": {
      "cascadeId": "f114692e-a724-47fd-b3bf-969760907bbf",
      "summary": "AI Model & Tool Execution Test",
      "lastModifiedTime": "2026-09-11T12:57:40.392Z",
      "stepCount": 65,
      "status": "CASCADE_RUN_STATUS_IDLE",
      "workspaceUri": "file:///home/cat/project",
      "model": "MODEL_PLACEHOLDER_M299"
    },
    "8931c764-d295-45c7-b362-c23fcea804cc": {
      "cascadeId": "8931c764-d295-45c7-b362-c23fcea804cc",
      "summary": "Counting verification",
      "lastModifiedTime": "2026-09-08T15:57:24.593Z",
      "stepCount": 4,
      "status": "CASCADE_RUN_STATUS_IDLE",
      "workspaceUri": "file:///home/cat/project",
      "model": "MODEL_PLACEHOLDER_M319"
    }
  }
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetAllCascadeTrajectoriesResponseDto(
    val trajectorySummaries: Map<String, CascadeTrajectorySummaryDto> = emptyMap()
)

@Serializable
data class CascadeTrajectorySummaryDto(
    val cascadeId: String = "",
    val summary: String = "",
    val lastModifiedTime: String = "",
    val stepCount: Int = 0,
    val status: String = "CASCADE_RUN_STATUS_IDLE",
    val workspaceUri: String = "",
    val model: String = ""
)
```

---

## 5. Client Processing & Filtering Logic

To display a clean list of chats in the UI without empty "ghost" sessions:

```kotlin
fun mapToDomainConversations(response: GetAllCascadeTrajectoriesResponseDto): List<Conversation> {
    return response.trajectorySummaries.values
        // 1. Filter out empty sessions with 0 steps or blank titles
        .filter { summary ->
            summary.lastModifiedTime.isNotBlank() && 
            (summary.summary.isNotBlank() || summary.stepCount > 0)
        }
        // 2. Map to UI Domain model
        .map { summary ->
            Conversation(
                id = summary.cascadeId,
                title = summary.summary.ifBlank { "Untitled Conversation" },
                lastModified = parseIsoDate(summary.lastModifiedTime),
                stepCount = summary.stepCount,
                model = summary.model,
                workspaceDir = summary.workspaceUri.removePrefix("file://")
            )
        }
        // 3. Sort chronologically (most recently modified at top)
        .sortedByDescending { it.lastModified }
}
```

---

## 6. Error Handling & Edge Cases

| Error / Response | Condition | Resolution |
| :--- | :--- | :--- |
| `trajectorySummaries: {}` (Empty) | No previous chats found on daemon | Display "No conversations yet" empty state |
| `grpc-status: 14` (`UNAVAILABLE`) | Daemon port `8090` is offline | Display offline badge / retry connection |
| Malformed timestamps | Corrupted timestamp string in daemon database | Fall back to `System.currentTimeMillis()` |
