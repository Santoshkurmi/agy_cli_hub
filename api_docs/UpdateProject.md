# UpdateProject API Specification

## 1. Overview
The `UpdateProject` endpoint modifies project metadata, resource roots, execution policies (e.g. sandbox mode, auto-execution mode, file access policies), and security permission grants for a project.

---

## 2. Protocol & Transport
- **Service Name**: `exa.language_server_pb.LanguageServerService`
- **Method Name**: `UpdateProject`
- **Full Path**: `/exa.language_server_pb.LanguageServerService/UpdateProject`
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
data class UpdateProjectRequest(
    @SerialName("project")
    val project: ProjectProfile
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

## 4. Response Definition

### Kotlin DTO
```kotlin
package com.example.gemini.data.model.project

import kotlinx.serialization.Serializable

@Serializable
class UpdateProjectResponse
```

### Wire JSON Example
```json
{}
```

---

## 5. Client Handling & Lifecycle Rules
1. **Empty Response Body**: An empty JSON object `{}` indicates successful persistence of the project configuration.
2. **Auto Execution Policy Options**:
   - `CASCADE_COMMANDS_AUTO_EXECUTION_OFF`: Always ask user before running shell commands.
   - `CASCADE_COMMANDS_AUTO_EXECUTION_EAGER` / `ALLOW_AUTO_EXECUTION`: Execute commands automatically according to safety guardrails.
