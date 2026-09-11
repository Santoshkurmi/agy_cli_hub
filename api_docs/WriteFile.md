# WriteFile API Specification

## 1. Overview
The `WriteFile` endpoint writes Base64-encoded UTF-8 content directly to a file on the local filesystem specified by a file URI (`file:///path/to/file`).

---

## 2. Protocol & Transport
- **Service Name**: `exa.language_server_pb.LanguageServerService`
- **Method Name**: `WriteFile`
- **Full Path**: `/exa.language_server_pb.LanguageServerService/WriteFile`
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
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

@Serializable
data class WriteFileRequest(
    @SerialName("uri")
    val uri: String = "",
    @SerialName("content")
    val content: String = ""
) {
    companion object {
        @OptIn(ExperimentalEncodingApi::class)
        fun fromPlainText(uri: String, plainText: String): WriteFileRequest {
            val encoded = Base64.encode(plainText.toByteArray(Charsets.UTF_8))
            return WriteFileRequest(uri = uri, content = encoded)
        }
    }
}
```

### Wire JSON Example
```json
{
  "uri": "file:///home/cat/.gemini/config/mcp_config.json",
  "content": "ewogICJtY3BTZXJ2ZXJzIjogewogICAgImR1bW15LW1jcCI6IHsKICAgICAgImFyZ3MiOiBbCiAgICAgICAgIi9ob21lL2NhdC8uZ2VtaW5pL21jcC1zZXJ2ZXJzL2R1bW15X21jcC5weSIKICAgICAgXSwKICAgICAgImNvbW1hbmQiOiAiL3Vzci9iaW4vcHl0aG9uMyIKICAgIH0KICB9Cn0="
}
```

---

## 4. Response Definition

### Kotlin DTO
```kotlin
package com.example.gemini.data.model.fs

import kotlinx.serialization.Serializable

@Serializable
class WriteFileResponse
```

### Wire JSON Example
```json
{}
```

---

## 5. Client Handling & Lifecycle Rules
1. **Encoding**: Clients must Base64-encode the string content before sending.
2. **Directory Creation**: Parent directories are created automatically by the language server if they do not exist.
3. **Empty Response**: Success is confirmed by receiving an empty JSON object `{}`.
