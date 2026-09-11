# `RetrieveUserQuotaSummary` (User Quota Windows & Limit Tracking RPC)

## 1. Overview & Purpose
`RetrieveUserQuotaSummary` fetches the user's active token quota buckets (5-hour and weekly windows) across model families (`Gemini Models`, `Claude and GPT models`).

It provides:
- Remaining quota fractions (e.g. `0.9987` $\to$ `99.9%`).
- Precise ISO timestamps for when limits reset.
- Live countdown calculation metadata for UI quota badges.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary HTTP/1.1
Host: 127.0.0.1:8090
Content-Type: application/grpc-web+json
Accept: */*
x-grpc-web: 1
Connect-Protocol-Version: 1
x-codeium-csrf-token: <CSRF_TOKEN>
```

---

## 3. Concrete Request Schema

### Request Body (JSON)
```json
{}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
class RetrieveUserQuotaSummaryRequestDto
```

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "response": {
    "groups": [
      {
        "displayName": "Gemini Models",
        "description": "Models within this group: Gemini Flash, Gemini Pro",
        "buckets": [
          {
            "bucketId": "gemini-weekly",
            "displayName": "Weekly Limit Remaining",
            "description": "You have used some of your weekly limit, it will fully refresh in 6 days, 16 hours.",
            "window": "weekly",
            "remainingFraction": 0.9987024,
            "resetTime": "2026-09-18T05:50:46Z"
          },
          {
            "bucketId": "gemini-5h",
            "displayName": "Five Hour Limit Remaining",
            "description": "You have used some of your 5-hour limit, it will fully refresh in 4 hours, 48 minutes.",
            "window": "5h",
            "remainingFraction": 0.9922146,
            "resetTime": "2026-09-11T17:48:41Z"
          }
        ]
      },
      {
        "displayName": "Claude and GPT models",
        "description": "Models within this group: Claude Opus, Claude Sonnet, GPT-OSS",
        "buckets": [
          {
            "bucketId": "3p-weekly",
            "displayName": "Weekly Limit Remaining",
            "description": "You have used some of your weekly limit, it will fully refresh in 5 days, 22 hours.",
            "window": "weekly",
            "remainingFraction": 0.8856892,
            "resetTime": "2026-09-17T11:33:46Z"
          },
          {
            "bucketId": "3p-5h",
            "displayName": "Five Hour Limit Remaining",
            "window": "5h",
            "remainingFraction": 1.0,
            "resetTime": "2026-09-11T17:59:42Z"
          }
        ]
      }
    ],
    "description": "Within each group, models share a weekly limit and a 5-hour limit."
  }
}
```

### Kotlin `@Serializable` Response Models
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class WireQuotaSummaryResponseDto(
    val response: WireQuotaSummaryPayloadDto? = null,
    val groups: List<WireQuotaGroupDto> = emptyList()
)

@Serializable
data class WireQuotaSummaryPayloadDto(
    val groups: List<WireQuotaGroupDto> = emptyList(),
    val description: String = ""
)

@Serializable
data class WireQuotaGroupDto(
    val displayName: String = "",
    val description: String = "",
    val buckets: List<WireQuotaBucketDto> = emptyList()
)

@Serializable
data class WireQuotaBucketDto(
    val bucketId: String = "",
    val window: String = "",
    val displayName: String = "",
    val remainingFraction: Double = 1.0,
    val resetTime: String? = null,
    val description: String = ""
)
```
