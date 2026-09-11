# `GetAvailableCascadePlugins` (Marketplace & Installable Plugins RPC)

## 1. Overview & Purpose
`GetAvailableCascadePlugins` queries the marketplace for discoverable, installable plugin bundles.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetAvailableCascadePlugins`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetAvailableCascadePlugins HTTP/1.1
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
class GetAvailableCascadePluginsRequestDto
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "plugins": [
    {
      "name": "android-cli-plugin",
      "displayName": "Android CLI Tools",
      "description": "Android SDK manager, ADB shell, screenshots, and device logs",
      "publisher": "Google Antigravity Team",
      "installed": true
    }
  ]
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetAvailableCascadePluginsResponseDto(
    val plugins: List<MarketplacePluginDto> = emptyList()
)

@Serializable
data class MarketplacePluginDto(
    val name: String = "",
    val displayName: String = "",
    val description: String = "",
    val publisher: String = "",
    val installed: Boolean = false
)
```
