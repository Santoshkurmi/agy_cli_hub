# `ListCustomizationPathsByFile` (File-Scoped Customization Resolution RPC)

## 1. Overview & Purpose
`ListCustomizationPathsByFile` queries the specific skills, rules, and hooks applicable to an active file path in the workspace by walking up the directory hierarchy.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/ListCustomizationPathsByFile`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/ListCustomizationPathsByFile HTTP/1.1
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
  "filePath": "file:///home/cat/project/app/src/main/MainActivity.kt"
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class ListCustomizationPathsByFileRequestDto(
    val filePath: String = ""
)
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "customizationPaths": [
    "/home/cat/project/GEMINI.md",
    "/home/cat/.gemini/config/skills/android-cli/SKILL.md"
  ]
}
```

### Kotlin `@Serializable` Response Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class ListCustomizationPathsByFileResponseDto(
    val customizationPaths: List<String> = emptyList()
)
```
