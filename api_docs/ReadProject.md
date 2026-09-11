# ReadProject API Specification

## 1. Overview
The `ReadProject` endpoint fetches full configuration, settings, permissions, and directory resource bindings for a single project by its unique identifier.

---

## 2. Protocol & Transport
- **Service Name**: `exa.language_server_pb.LanguageServerService`
- **Method Name**: `ReadProject`
- **Full Path**: `/exa.language_server_pb.LanguageServerService/ReadProject`
- **HTTP Method**: `POST`
- **Transport Framing**: gRPC-Web (5-byte prefix framing: `0x00` + 4-byte big-endian payload length)
- **Content-Type**: `application/grpc-web+json`
- **Required Headers**:
  - `x-codeium-csrf-token`: `<UUID>`
  - `x-grpc-web`: `1`

---

## 3. Request Definition

### Kotlin DTO
```kotlin
package com.example.gemini.data.model.project

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ReadProjectRequest(
    @SerialName("id")
    val id: String = ""
)
```

### Wire JSON Example
```json
{
  "id": "default-cli-project"
}
```

---

## 4. Response Definition

### Kotlin DTO
```kotlin
package com.example.gemini.data.model.project

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ReadProjectResponse(
    @SerialName("project")
    val project: ProjectProfile? = null
)
```

### Wire JSON Example
```json
{
  "project": {
    "id": "default-cli-project",
    "name": "CLI Project",
    "projectResources": {},
    "permissionGrants": {
      "permissionGrants": {
        "allow": [
          "read_url(example.com)"
        ]
      }
    },
    "settings": {
      "fileAccessPolicy": "AGENT_SETTING_POLICY_ASK",
      "sandboxMode": false,
      "autoExecutionPolicy": "CASCADE_COMMANDS_AUTO_EXECUTION_OFF"
    }
  }
}
```

---

## 5. Client Handling & Lifecycle Rules
1. **Fallback Configuration**: If the project does not specify explicit settings, fallback to global IDE configuration.
2. **Permission Grants**: `permissionGrants` controls which tools (such as specific domains for `read_url` or command prefixes) are pre-authorized without user confirmation prompts.
