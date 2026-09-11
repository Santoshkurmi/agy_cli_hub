# GetLoadCodeAssist API Specification

## 1. Overview
The `GetLoadCodeAssist` endpoint fetches the user's current Google Gemini Code Assist subscription tiers, Google One AI Pro status, GCP project associations, and privacy notices.

---

## 2. Protocol & Transport
- **Service Name**: `exa.language_server_pb.LanguageServerService`
- **Method Name**: `GetLoadCodeAssist`
- **Full Path**: `/exa.language_server_pb.LanguageServerService/GetLoadCodeAssist`
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
package com.example.gemini.data.model.auth

import kotlinx.serialization.Serializable

@Serializable
class GetLoadCodeAssistRequest
```

### Wire JSON Example
```json
{}
```

---

## 4. Response Definition

### Kotlin DTO
```kotlin
package com.example.gemini.data.model.auth

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class GetLoadCodeAssistResponse(
    @SerialName("response")
    val response: CodeAssistInfo? = null
)

@Serializable
data class CodeAssistInfo(
    @SerialName("currentTier")
    val currentTier: SubscriptionTier? = null,
    @SerialName("allowedTiers")
    val allowedTiers: List<SubscriptionTier> = emptyList(),
    @SerialName("cloudaicompanionProject")
    val cloudaicompanionProject: String = "",
    @SerialName("gcpManaged")
    val gcpManaged: Boolean = false,
    @SerialName("upgradeSubscriptionUri")
    val upgradeSubscriptionUri: String = "",
    @SerialName("paidTier")
    val paidTier: SubscriptionTier? = null
)

@Serializable
data class SubscriptionTier(
    @SerialName("id")
    val id: String = "",
    @SerialName("name")
    val name: String = "",
    @SerialName("description")
    val description: String = "",
    @SerialName("privacyNotice")
    val privacyNotice: PrivacyNoticeInfo? = null,
    @SerialName("upgradeSubscriptionUri")
    val upgradeSubscriptionUri: String? = null,
    @SerialName("upgradeSubscriptionText")
    val upgradeSubscriptionText: String? = null,
    @SerialName("upgradeSubscriptionType")
    val upgradeSubscriptionType: String? = null,
    @SerialName("isDefault")
    val isDefault: Boolean = false,
    @SerialName("availableCredits")
    val availableCredits: List<CreditQuotaInfo> = emptyList()
)

@Serializable
data class PrivacyNoticeInfo(
    @SerialName("showNotice")
    val showNotice: Boolean = false,
    @SerialName("noticeText")
    val noticeText: String = ""
)

@Serializable
data class CreditQuotaInfo(
    @SerialName("creditType")
    val creditType: String = "",
    @SerialName("minimumCreditAmountForUsage")
    val minimumCreditAmountForUsage: String = ""
)
```

### Wire JSON Example
```json
{
  "response": {
    "currentTier": {
      "id": "free-tier",
      "name": "Antigravity",
      "description": "Gemini-powered code suggestions and chat in multiple IDEs",
      "privacyNotice": {
        "showNotice": true,
        "noticeText": "This notice and our Privacy Policy - https://policies.google.com/privacy - describe how Gemini Code Assist for individuals handles your data."
      },
      "upgradeSubscriptionUri": "https://accounts.google.com/AccountChooser?Email=user%40example.com&continue=https%3A%2F%2Fone.google.com%2Fai",
      "upgradeSubscriptionText": "Upgrade to get 1,500 model requests per day with Gemini CLI and Gemini Code Assist's agent mode with Google AI Pro.",
      "upgradeSubscriptionType": "GOOGLE_ONE"
    },
    "allowedTiers": [
      {
        "id": "free-tier",
        "name": "Antigravity",
        "isDefault": true
      }
    ],
    "cloudaicompanionProject": "aicode-consumers",
    "gcpManaged": false,
    "upgradeSubscriptionUri": "https://codeassist.google.com/upgrade"
  }
}
```

---

## 5. Client Handling & Lifecycle Rules
1. **Tier Management**: Used in UI account / profile settings to display upgrade banners, current limits, and privacy notices.
