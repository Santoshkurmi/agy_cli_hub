# `GetAllPlugins` (Installed Plugins Catalog RPC)

## 1. Overview & Purpose
`GetAllPlugins` returns all installed plugin packages (bundles of skills, agents, rules, and MCP configurations) from global and workspace directories.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetAllPlugins`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetAllPlugins HTTP/1.1
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
class GetAllPluginsRequestDto
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "plugins": [
    {
      "name": "android-cli-plugin",
      "path": "/home/cat/.gemini/config/plugins/android-cli-plugin",
      "version": "1.0.0",
      "description": "Android development CLI tools and ADB interaction",
      "skills": [
        "android-cli"
      ]
    }
  ]
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetAllPluginsResponseDto(
    val plugins: List<PluginDefinitionDto> = emptyList()
)

@Serializable
data class PluginDefinitionDto(
    val name: String = "",
    val path: String = "",
    val version: String = "",
    val description: String = "",
    val skills: List<String> = emptyList()
)
```
