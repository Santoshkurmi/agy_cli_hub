# RecordAnalyticsEvent API Specification

## 1. Overview
The `RecordAnalyticsEvent` endpoint collects client-side analytics and telemetry events (e.g. latency metrics, UI interaction tracking, conversation loading durations).

---

## 2. Protocol & Transport
- **Service Name**: `exa.language_server_pb.LanguageServerService`
- **Method Name**: `RecordAnalyticsEvent`
- **Full Path**: `/exa.language_server_pb.LanguageServerService/RecordAnalyticsEvent`
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
package com.example.gemini.data.model.telemetry

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class RecordAnalyticsEventRequest(
    @SerialName("metadata")
    val metadata: AnalyticsMetadata = AnalyticsMetadata(),
    @SerialName("events")
    val events: List<AnalyticsEvent> = emptyList()
)

@Serializable
data class AnalyticsMetadata(
    @SerialName("ideName")
    val ideName: String = "antigravity",
    @SerialName("extensionVersion")
    val extensionVersion: String? = null
)

@Serializable
data class AnalyticsEvent(
    @SerialName("eventName")
    val eventName: String = "",
    @SerialName("extra")
    val extra: Map<String, String> = emptyMap(),
    @SerialName("clientTimestampMs")
    val clientTimestampMs: String = ""
)
```

### Wire JSON Example
```json
{
  "metadata": {
    "ideName": "antigravity"
  },
  "events": [
    {
      "eventName": "sidebar_conversations",
      "extra": {
        "conversationCount": "0",
        "browserSessionId": "8260362f-68e9-43d4-b2c1-612a0a76e0f2"
      },
      "clientTimestampMs": "1789130908168"
    }
  ]
}
```

---

## 4. Response Definition

### Kotlin DTO
```kotlin
package com.example.gemini.data.model.telemetry

import kotlinx.serialization.Serializable

@Serializable
class RecordAnalyticsEventResponse
```

### Wire JSON Example
```json
{}
```

---

## 5. Client Handling & Lifecycle Rules
1. **Fire-and-Forget**: Telemetry requests are non-critical and can be queued/dispatched in background coroutines.
2. **Timestamps**: `clientTimestampMs` is passed as a string representation of unix epoch milliseconds.
