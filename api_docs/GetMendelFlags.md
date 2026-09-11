# GetMendelFlags API Specification

## 1. Overview
The `GetMendelFlags` endpoint retrieves server-side experiment toggles, feature flags, and rollout configurations (Mendel flags) from the language server and Google experiments backend.

---

## 2. Protocol & Transport
- **Service Name**: `exa.language_server_pb.LanguageServerService`
- **Method Name**: `GetMendelFlags`
- **Full Path**: `/exa.language_server_pb.LanguageServerService/GetMendelFlags`
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
package com.example.gemini.data.model.experiments

import kotlinx.serialization.Serializable

@Serializable
class GetMendelFlagsRequest
```

### Wire JSON Example
```json
{}
```

---

## 4. Response Definition

### Kotlin DTO
```kotlin
package com.example.gemini.data.model.experiments

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class GetMendelFlagsResponse(
    @SerialName("experimentConfig")
    val experimentConfig: ExperimentConfigWrapper? = null
)

@Serializable
data class ExperimentConfigWrapper(
    @SerialName("experiments")
    val experiments: List<ExperimentEntry> = emptyList()
)

@Serializable
data class ExperimentEntry(
    @SerialName("keyString")
    val keyString: String = "",
    @SerialName("string")
    val stringVal: String? = null,
    @SerialName("json")
    val jsonVal: String? = null,
    @SerialName("disabled")
    val disabled: Boolean = false,
    @SerialName("source")
    val source: String = "" // e.g. EXPERIMENT_SOURCE_LANGUAGE_SERVER
)
```

### Wire JSON Example
```json
{
  "experimentConfig": {
    "experiments": [
      {
        "keyString": "policy-guardian-config",
        "string": "",
        "source": "EXPERIMENT_SOURCE_LANGUAGE_SERVER"
      },
      {
        "keyString": "agy-plugin-marketplaces",
        "json": "null",
        "source": "EXPERIMENT_SOURCE_LANGUAGE_SERVER"
      },
      {
        "keyString": "DuetAiLocalRag__enable_local_rag_completion_snippets",
        "disabled": true,
        "source": "EXPERIMENT_SOURCE_LANGUAGE_SERVER"
      }
    ]
  }
}
```

---

## 5. Client Handling & Lifecycle Rules
1. **Periodic Refresh**: Experiment flags are refreshed periodically (e.g. every 2-5 minutes) to apply new UI features or backend rollout flags without restarting the IDE.
