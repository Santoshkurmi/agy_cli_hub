# GetServerConfiguration API Specification

## 1. Overview
The `GetServerConfiguration` endpoint queries language server host features, including active sidecars, application data directory path, and whether Antigravity Hub features are enabled.

---

## 2. Protocol & Transport
- **Service Name**: `exa.language_server_pb.LanguageServerService`
- **Method Name**: `GetServerConfiguration`
- **Full Path**: `/exa.language_server_pb.LanguageServerService/GetServerConfiguration`
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
package com.example.gemini.data.model.server

import kotlinx.serialization.Serializable

@Serializable
class GetServerConfigurationRequest
```

### Wire JSON Example
```json
{}
```

---

## 4. Response Definition

### Kotlin DTO
```kotlin
package com.example.gemini.data.model.server

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class GetServerConfigurationResponse(
    @SerialName("config")
    val config: ServerConfiguration? = null
)

@Serializable
data class ServerConfiguration(
    @SerialName("appDataDir")
    val appDataDir: String = "antigravity",
    @SerialName("antigravityHub")
    val antigravityHub: Boolean = true,
    @SerialName("sidecars")
    val sidecars: Map<String, String> = emptyMap()
)
```

### Wire JSON Example
```json
{
  "config": {
    "sidecars": {},
    "appDataDir": "antigravity",
    "antigravityHub": true
  }
}
```

---

## 5. Client Handling & Lifecycle Rules
1. **Initial Handshake**: Called on startup to determine environment parameters (e.g. app data folder name for finding configs or logs).
