# `SetUserInfo` (User Settings & Profile Mutation RPC)

## 1. Overview & Purpose
`SetUserInfo` updates user profile preferences, including telemetry opt-in/opt-out and UI configuration flags.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/SetUserInfo`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/SetUserInfo HTTP/1.1
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
  "userSettings": {
    "telemetryEnabled": true
  }
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class SetUserInfoRequestDto(
    val userSettings: UserSettingsDto = UserSettingsDto()
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
data class SetUserInfoResponseDto(
    val success: Boolean = true
)
```
