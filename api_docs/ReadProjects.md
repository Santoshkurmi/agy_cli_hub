# ReadProjects API Specification

## 1. Overview
The `ReadProjects` endpoint batches retrieval of multiple project profiles by their unique IDs. It provides project metadata, root directory URIs, workspace-only flags, permission grants, and agent settings for each workspace registered in Antigravity.

---

## 2. Protocol & Transport
- **Service Name**: `exa.language_server_pb.LanguageServerService`
- **Method Name**: `ReadProjects`
- **Full Path**: `/exa.language_server_pb.LanguageServerService/ReadProjects`
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
data class ReadProjectsRequest(
    @SerialName("ids")
    val ids: List<String> = emptyList()
)
```

### Wire JSON Example
```json
{
  "ids": [
    "237898b7-7b1c-4cf1-a2c9-83c7eda23526",
    "56dcc7be-305d-4fa9-a8bc-6abd1653b588",
    "default-cli-project",
    "outside-of-project"
  ]
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
data class ReadProjectsResponse(
    @SerialName("projects")
    val projects: List<ProjectProfile> = emptyList()
)

@Serializable
data class ProjectProfile(
    @SerialName("id")
    val id: String = "",
    @SerialName("name")
    val name: String = "",
    @SerialName("projectResources")
    val projectResources: ProjectResources? = null,
    @SerialName("settings")
    val settings: ProjectSettings? = null,
    @SerialName("permissionGrants")
    val permissionGrants: ProjectPermissionGrantsWrapper? = null,
    @SerialName("isWorkspaceOnly")
    val isWorkspaceOnly: Boolean = false
)

@Serializable
data class ProjectResources(
    @SerialName("resources")
    val resources: List<ProjectResourceEntry> = emptyList()
)

@Serializable
data class ProjectResourceEntry(
    @SerialName("folderUri")
    val folderUri: String? = null,
    @SerialName("gitFolder")
    val gitFolder: GitFolderInfo? = null
)

@Serializable
data class GitFolderInfo(
    @SerialName("folderUri")
    val folderUri: String = ""
)

@Serializable
data class ProjectSettings(
    @SerialName("fileAccessPolicy")
    val fileAccessPolicy: String = "",
    @SerialName("sandboxMode")
    val sandboxMode: Boolean = false,
    @SerialName("autoExecutionPolicy")
    val autoExecutionPolicy: String = ""
)

@Serializable
data class ProjectPermissionGrantsWrapper(
    @SerialName("permissionGrants")
    val permissionGrants: ProjectPermissionGrantsList? = null
)

@Serializable
data class ProjectPermissionGrantsList(
    @SerialName("allow")
    val allow: List<String> = emptyList(),
    @SerialName("deny")
    val deny: List<String> = emptyList()
)
```

### Wire JSON Example
```json
{
  "projects": [
    {
      "id": "237898b7-7b1c-4cf1-a2c9-83c7eda23526",
      "name": "tr4mpass",
      "projectResources": {
        "resources": [
          {
            "folderUri": "file:///home/cat/tr4mpass"
          }
        ]
      },
      "settings": {},
      "isWorkspaceOnly": false
    },
    {
      "id": "default-cli-project",
      "name": "CLI Project",
      "projectResources": {}
    },
    {
      "id": "outside-of-project",
      "name": "Outside of Project"
    }
  ]
}
```

---

## 5. Client Handling & Lifecycle Rules
1. **Empty / Default Workspace**: If `outside-of-project` or `default-cli-project` is requested, `projectResources` can be empty or omitted.
2. **Path Resolution**: Use `folderUri` or `gitFolder.folderUri` to resolve local project roots for context inclusion in cascade messages.
