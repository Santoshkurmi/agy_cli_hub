# `GetAuthStatus` (OAuth & Authentication Status RPC)

## 1. Overview & Purpose
`GetAuthStatus` checks whether the AGY Hub daemon has a valid Google OAuth or enterprise token, returning the list of granted OAuth scopes.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetAuthStatus`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetAuthStatus HTTP/1.1
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
class GetAuthStatusRequestDto
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "authResult": {
    "hasValidAuth": true,
    "grantedScopes": [
      "email",
      "profile",
      "https://www.googleapis.com/auth/aicode",
      "https://www.googleapis.com/auth/cclog",
      "https://www.googleapis.com/auth/cloud-platform",
      "openid"
    ]
  }
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetAuthStatusResponseDto(
    val authResult: AuthResultDto = AuthResultDto()
)

@Serializable
data class AuthResultDto(
    val hasValidAuth: Boolean = false,
    val grantedScopes: List<String> = emptyList()
)
```
