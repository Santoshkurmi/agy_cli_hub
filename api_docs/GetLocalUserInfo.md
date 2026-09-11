# `GetLocalUserInfo` (Local System User & Home Directory RPC)

## 1. Overview & Purpose
`GetLocalUserInfo` retrieves the local operating system username and user home directory URI.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetLocalUserInfo`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetLocalUserInfo HTTP/1.1
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
class GetLocalUserInfoRequestDto
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "username": "cat",
  "homeDirUri": "file:///home/cat"
}
```

### Kotlin `@Serializable` Response Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetLocalUserInfoResponseDto(
    val username: String = "",
    val homeDirUri: String = ""
)
```
