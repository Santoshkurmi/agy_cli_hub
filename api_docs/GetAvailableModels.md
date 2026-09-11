# `GetAvailableModels` (Model Discovery & Capabilities RPC)

## 1. Overview & Purpose
`GetAvailableModels` queries the AGY Hub daemon for all supported AI models, thinking capability flags, token context window limits, and model family classifications (Gemini, Claude, GPT-OSS).

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetAvailableModels`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetAvailableModels HTTP/1.1
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
  "forceRefresh": true
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetAvailableModelsRequestDto(
    val forceRefresh: Boolean = false
)
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "response": {
    "models": {
      "gemini-2.5-flash": {
        "displayName": "Gemini 2.5 Flash",
        "model": "MODEL_PLACEHOLDER_M299",
        "supportsThinking": true,
        "disabled": false,
        "quotaInfo": {
          "remainingFraction": 0.99,
          "resetTime": "2026-09-11T17:48:41Z"
        }
      },
      "gemini-2.5-pro": {
        "displayName": "Gemini 2.5 Pro (Thinking)",
        "model": "MODEL_PLACEHOLDER_M319",
        "supportsThinking": true,
        "disabled": false,
        "quotaInfo": {
          "remainingFraction": 0.99,
          "resetTime": "2026-09-11T17:48:41Z"
        }
      },
      "claude-3-7-sonnet": {
        "displayName": "Claude 3.7 Sonnet (Thinking)",
        "model": "MODEL_PLACEHOLDER_M190",
        "supportsThinking": true,
        "disabled": false,
        "quotaInfo": {
          "remainingFraction": 0.88,
          "resetTime": "2026-09-17T11:33:46Z"
        }
      }
    }
  }
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetAvailableModelsResponseDto(
    val response: AvailableModelsPayloadDto? = null
)

@Serializable
data class AvailableModelsPayloadDto(
    val models: Map<String, ModelDetailsDto> = emptyMap()
)

@Serializable
data class ModelDetailsDto(
    val displayName: String = "",
    val model: String = "",
    val supportsThinking: Boolean = false,
    val disabled: Boolean = false,
    val quotaInfo: ModelQuotaInfoDto? = null
)

@Serializable
data class ModelQuotaInfoDto(
    val remainingFraction: Double = 1.0,
    val resetTime: String? = null
)
```
