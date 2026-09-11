# `StreamAudioTranscription` (Real-Time Voice-to-Text Streaming RPC)

## 1. Overview & Purpose
`StreamAudioTranscription` allows real-time streaming of audio PCM chunks from the client microphone to the daemon's transcription engine, streaming back real-time text transcription deltas.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/StreamAudioTranscription`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web bi-directional streaming
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/StreamAudioTranscription HTTP/1.1
Host: 127.0.0.1:8090
Content-Type: application/grpc-web+proto
Accept: application/grpc-web+proto
Connect-Protocol-Version: 1
x-conversation-id: <CASCADE_UUID>
```

---

## 3. Concrete Request Schema

### Initial Connection Payload (JSON)
```json
{
  "mimeType": "audio/pcm;rate=16000",
  "cascadeId": "f114692e-a724-47fd-b3bf-969760907bbf"
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class StreamAudioTranscriptionRequestDto(
    val mimeType: String = "audio/pcm;rate=16000",
    val cascadeId: String = "",
    val audioChunkBase64: String? = null
)
```

---

## 4. Concrete Response Stream Frame

### Response Frame (JSON)
```json
{
  "transcriptionDelta": "Analyze the codebase",
  "isFinal": false
}
```

### Kotlin `@Serializable` Response Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class StreamAudioTranscriptionResponseDto(
    val transcriptionDelta: String = "",
    val isFinal: Boolean = false
)
```
