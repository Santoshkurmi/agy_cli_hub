# `GetAllSkills` (Skills Catalog & Instructions RPC)

## 1. Overview & Purpose
`GetAllSkills` discovers and loads all built-in, global (`~/.gemini/config/skills/`), and workspace (`.agents/skills/`) skills and their YAML frontmatter metadata.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetAllSkills`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetAllSkills HTTP/1.1
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
  "includeShadowed": true
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetAllSkillsRequestDto(
    val includeShadowed: Boolean = true
)
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "skills": [
    {
      "path": "/home/cat/.gemini/antigravity/builtin/skills/agy-customizations/SKILL.md",
      "name": "agy-customizations",
      "description": "Comprehensive guide and reference for the Antigravity Customization System.",
      "content": "# Antigravity Customization System Guide\n...",
      "isBuiltin": true,
      "discoveryCategory": "DISCOVERY_CATEGORY_BUILTIN"
    }
  ]
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetAllSkillsResponseDto(
    val skills: List<SkillDefinitionDto> = emptyList()
)

@Serializable
data class SkillDefinitionDto(
    val path: String = "",
    val name: String = "",
    val description: String = "",
    val content: String = "",
    val isBuiltin: Boolean = false,
    val discoveryCategory: String = "DISCOVERY_CATEGORY_GLOBAL"
)
```
