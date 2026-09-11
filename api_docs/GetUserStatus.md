# `GetUserStatus` (User Account Status & Permissions RPC)

## 1. Overview & Purpose
`GetUserStatus` returns account status information, active role, enterprise tier, and subscription state.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetUserStatus`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetUserStatus HTTP/1.1
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
class GetUserStatusRequestDto
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "userStatus": {
    "isActive": true,
    "userTier": "TIER_PRO"
  }
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetUserStatusResponseDto(
    val userStatus: UserStatusDto = UserStatusDto()
)

@Serializable
data class UserStatusDto(
    val isActive: Boolean = true,
    val userTier: String = ""
)
```
