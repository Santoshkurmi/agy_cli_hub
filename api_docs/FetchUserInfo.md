# `FetchUserInfo` (User Account Profile & Settings RPC)

## 1. Overview & Purpose
`FetchUserInfo` retrieves the user's remote profile settings (telemetry flags, enterprise policies, subscription tier).

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/FetchUserInfo`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/FetchUserInfo HTTP/1.1
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
class FetchUserInfoRequestDto
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "userSettings": {
    "telemetryEnabled": true
  }
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class FetchUserInfoResponseDto(
    val userSettings: UserSettingsDto = UserSettingsDto()
)

@Serializable
data class UserSettingsDto(
    val telemetryEnabled: Boolean = true
)
```
