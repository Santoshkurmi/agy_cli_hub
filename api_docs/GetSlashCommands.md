# `GetSlashCommands` (Interactive Slash Commands Discovery RPC)

## 1. Overview & Purpose
`GetSlashCommands` returns the active registry of slash commands (system commands `/goal`, `/schedule`, `/browser`, `/grill-me`, `/learn`, and user-defined skills `/my-skill`).

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetSlashCommands`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetSlashCommands HTTP/1.1
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
  "cascadeConfig": {
    "plannerConfig": {
      "requestedModel": {
        "model": "MODEL_PLACEHOLDER_M319"
      }
    }
  }
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetSlashCommandsRequestDto(
    val cascadeId: String = "",
    val cascadeConfig: CascadeConfigDto? = null,
    val customAgentSpec: CustomAgentSpecDto? = null
)
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "commands": [
    {
      "title": "goal",
      "description": "Run until the specified goal is completely finished.",
      "info": {
        "name": "goal",
        "modelFacingText": "The user has marked this task with /goal...",
        "type": "SLASH_COMMAND_TYPE_SYSTEM",
        "icon": "timer"
      }
    },
    {
      "title": "schedule",
      "description": "Run an instruction on a recurring schedule or as a one-time timer.",
      "info": {
        "name": "schedule",
        "modelFacingText": "Please use the schedule tool...",
        "type": "SLASH_COMMAND_TYPE_SYSTEM",
        "icon": "schedule"
      }
    }
  ]
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetSlashCommandsResponseDto(
    val commands: List<SlashCommandEntryDto> = emptyList()
)

@Serializable
data class SlashCommandEntryDto(
    val title: String = "",
    val description: String = "",
    val info: SlashCommandInfoDto = SlashCommandInfoDto()
)

@Serializable
data class SlashCommandInfoDto(
    val name: String = "",
    val modelFacingText: String = "",
    val type: String = "SLASH_COMMAND_TYPE_SYSTEM",
    val icon: String = ""
)
```
