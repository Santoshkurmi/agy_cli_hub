# `GetBuildWithGooglePlugins` (Google Official Plugins Discovery RPC)

## 1. Overview & Purpose
`GetBuildWithGooglePlugins` discovers official Google plugins (Vertex AI, Cloud Run, Firebase, Android CLI) curated for the workspace.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetBuildWithGooglePlugins`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetBuildWithGooglePlugins HTTP/1.1
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
class GetBuildWithGooglePluginsRequestDto
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "plugins": [
    {
      "id": "google-cloud-tools",
      "name": "Google Cloud Suite",
      "description": "Deploy, manage, and monitor Cloud Run and Vertex AI resources directly from AGY."
    }
  ]
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetBuildWithGooglePluginsResponseDto(
    val plugins: List<GooglePluginDto> = emptyList()
)

@Serializable
data class GooglePluginDto(
    val id: String = "",
    val name: String = "",
    val description: String = ""
)
```
