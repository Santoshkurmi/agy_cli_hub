# StatUri API Specification

## 1. Overview
The `StatUri` endpoint inspects file or directory metadata at a specified URI, returning file type, modification timestamp, normalized URI, and byte size.

---

## 2. Protocol & Transport
- **Service Name**: `exa.language_server_pb.LanguageServerService`
- **Method Name**: `StatUri`
- **Full Path**: `/exa.language_server_pb.LanguageServerService/StatUri`
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
data class StatUriRequest(
    @SerialName("uri")
    val uri: String = ""
)
```

### Wire JSON Example
```json
{
  "uri": "file:///home/cat/bypass"
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
data class StatUriResponse(
    @SerialName("fileType")
    val fileType: String = "", // e.g. FILE_TYPE_DIRECTORY, FILE_TYPE_FILE, FILE_TYPE_NON_EXISTENT
    @SerialName("modTime")
    val modTime: String = "", // ISO-8601 timestamp e.g. 2026-09-02T13:12:50.533741438Z
    @SerialName("normalizedUri")
    val normalizedUri: String = "",
    @SerialName("size")
    val size: String = "0"
)
```

### Wire JSON Example
```json
{
  "fileType": "FILE_TYPE_DIRECTORY",
  "modTime": "2026-09-02T13:12:50.533741438Z",
  "normalizedUri": "file:///home/cat/bypass",
  "size": "126"
}
```

---

## 5. Client Handling & Lifecycle Rules
1. **Size as String**: gRPC-Web serializes 64-bit integers (`int64` / `uint64`) as JSON strings (e.g. `"126"`) to avoid JavaScript precision loss.
2. **File Types**: Common values include `FILE_TYPE_DIRECTORY`, `FILE_TYPE_FILE`, and `FILE_TYPE_NON_EXISTENT`.
