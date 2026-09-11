# `GetCascadeNuxes` (New User Experience Tips & Onboarding RPC)

## 1. Overview & Purpose
`GetCascadeNuxes` retrieves onboarding prompts, shortcut tips, and feature callouts shown to users on their first interactions with AGY.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetCascadeNuxes`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetCascadeNuxes HTTP/1.1
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
{}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
class GetCascadeNuxesRequestDto
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "nuxes": [
    {
      "id": "intro_model_selector",
      "title": "Switch Models",
      "description": "Click the model chip to switch between Gemini and Claude models.",
      "dismissed": false
    }
  ]
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetCascadeNuxesResponseDto(
    val nuxes: List<CascadeNuxDto> = emptyList()
)

@Serializable
data class CascadeNuxDto(
    val id: String = "",
    val title: String = "",
    val description: String = "",
    val dismissed: Boolean = false
)
```
