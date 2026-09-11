# ReadFile API Specification

## 1. Overview
The `ReadFile` endpoint reads the contents and language metadata of a local file by its absolute file URI (`file:///path/to/file`). Content is transmitted as a Base64-encoded UTF-8 string.

---

## 2. Protocol & Transport
- **Service Name**: `exa.language_server_pb.LanguageServerService`
- **Method Name**: `ReadFile`
- **Full Path**: `/exa.language_server_pb.LanguageServerService/ReadFile`
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
data class ReadFileRequest(
    @SerialName("uri")
    val uri: String = ""
)
```

### Wire JSON Example
```json
{
  "uri": "file:///home/cat/.gemini/config/mcp_config.json"
}
```

---

## 4. Response Definition

### Kotlin DTO
```kotlin
package com.example.gemini.data.model.fs

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

@Serializable
data class ReadFileResponse(
    @SerialName("content")
    val content: String = "",
    @SerialName("language")
    val language: String = ""
) {
    @OptIn(ExperimentalEncodingApi::class)
    fun decodeContent(): String {
        return try {
            String(Base64.decode(content), Charsets.UTF_8)
        } catch (e: Exception) {
            content
        }
    }
}
```

### Wire JSON Example
```json
{
  "content": "ewogICJtY3BTZXJ2ZXJzIjogewogICAgImR1bW15LW1jcCI6IHsKICAgICAgImFyZ3MiOiBbCiAgICAgICAgIi9ob21lL2NhdC8uZ2VtaW5pL21jcC1zZXJ2ZXJzL2R1bW15X21jcC5weSIKICAgICAgXSwKICAgICAgImNvbW1hbmQiOiAiL3Vzci9iaW4vcHl0aG9uMyIKICAgIH0KICB9Cn0=",
  "language": "LANGUAGE_JSON"
}
```

---

## 5. Client Handling & Lifecycle Rules
1. **Base64 Encoding**: The `content` field is Base64 encoded by the language server to safely transmit arbitrary binary or UTF-8 text files without character corruption.
2. **Language Metadata**: Returns recognized language identifier (e.g. `LANGUAGE_JSON`, `LANGUAGE_KOTLIN`, `LANGUAGE_PYTHON`).
