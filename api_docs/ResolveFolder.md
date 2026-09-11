# ResolveFolder API Specification

## 1. Overview
The `ResolveFolder` endpoint checks a directory URI to determine whether it is a normal directory, a version control repository (e.g. Git repository), or non-existent, and identifies the VCS provider.

---

## 2. Protocol & Transport
- **Service Name**: `exa.language_server_pb.LanguageServerService`
- **Method Name**: `ResolveFolder`
- **Full Path**: `/exa.language_server_pb.LanguageServerService/ResolveFolder`
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
package com.example.gemini.data.model.fs

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ResolveFolderRequest(
    @SerialName("folderUri")
    val folderUri: String = ""
)
```

### Wire JSON Example
```json
{
  "folderUri": "file:///home/cat/Templates"
}
```

---

## 4. Response Definition

### Kotlin DTO
```kotlin
package com.example.gemini.data.model.fs

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ResolveFolderResponse(
    @SerialName("resourceType")
    val resourceType: String = "", // FOLDER_TYPE_NORMAL_FOLDER, FOLDER_TYPE_GIT_FOLDER, FOLDER_TYPE_NON_EXISTENT
    @SerialName("vcsType")
    val vcsType: String? = null // VCS_TYPE_GIT, VCS_TYPE_UNSPECIFIED
)
```

### Wire JSON Example
```json
{
  "resourceType": "FOLDER_TYPE_GIT_FOLDER",
  "vcsType": "VCS_TYPE_GIT"
}
```

---

## 5. Client Handling & Lifecycle Rules
1. **Resource Classification**:
   - `FOLDER_TYPE_GIT_FOLDER`: Workspace is recognized as a Git repository, allowing git-based workspace diffing and branch tracking.
   - `FOLDER_TYPE_NORMAL_FOLDER`: Regular local directory.
   - `FOLDER_TYPE_NON_EXISTENT`: Path does not exist on disk.
