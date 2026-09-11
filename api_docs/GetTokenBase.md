# GetTokenBase API Specification

## 1. Overview
The `GetTokenBase` endpoint calculates the base prompt token consumption incurred by system instructions, active skills, rules, workflows, and registered MCP tool definitions under the current cascade configuration and budget constraints.

---

## 2. Protocol & Transport
- **Service Name**: `exa.language_server_pb.LanguageServerService`
- **Method Name**: `GetTokenBase`
- **Full Path**: `/exa.language_server_pb.LanguageServerService/GetTokenBase`
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
package com.example.gemini.data.model.tokens

import com.example.gemini.data.model.cascade.CascadeConfig
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class GetTokenBaseRequest(
    @SerialName("cascadeConfig")
    val cascadeConfig: CascadeConfig? = null
)
```

### Wire JSON Example
```json
{
  "cascadeConfig": {
    "plannerConfig": {
      "toolConfig": {
        "runCommand": {
          "autoCommandConfig": {
            "autoExecutionPolicy": "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER"
          }
        },
        "notifyUser": {}
      },
      "requestedModel": {
        "model": "MODEL_PLACEHOLDER_M299"
      },
      "knowledgeConfig": {},
      "useAiCredits": false,
      "supportsLatexRendering": true
    },
    "conversationHistoryConfig": {}
  }
}
```

---

## 4. Response Definition

### Kotlin DTO
```kotlin
package com.example.gemini.data.model.tokens

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class GetTokenBaseResponse(
    @SerialName("customizationTokenBase")
    val customizationTokenBase: CustomizationTokenBase? = null,
    @SerialName("remainingBudget")
    val remainingBudget: Long = 0,
    @SerialName("customizationBudget")
    val customizationBudget: Long = 0
)

@Serializable
data class CustomizationTokenBase(
    @SerialName("groups")
    val groups: List<TokenBaseGroup> = emptyList(),
    @SerialName("totalTokens")
    val totalTokens: Long = 0
)

@Serializable
data class TokenBaseGroup(
    @SerialName("name")
    val name: String = "",
    @SerialName("type")
    val type: String = "", // e.g. TOKEN_TYPE_MCP_TOOLS, TOKEN_TYPE_SKILLS
    @SerialName("source")
    val source: String = "", // e.g. TOKEN_SOURCE_USER, TOKEN_SOURCE_WORKSPACE
    @SerialName("numTokens")
    val numTokens: Long = 0,
    @SerialName("children")
    val children: List<TokenBaseChild> = emptyList()
)

@Serializable
data class TokenBaseChild(
    @SerialName("name")
    val name: String = "",
    @SerialName("numTokens")
    val numTokens: Long = 0,
    @SerialName("children")
    val children: List<TokenBaseChild> = emptyList()
)
```

### Wire JSON Example
```json
{
  "customizationTokenBase": {
    "groups": [
      {
        "name": "Mcp Tools",
        "type": "TOKEN_TYPE_MCP_TOOLS",
        "source": "TOKEN_SOURCE_USER",
        "numTokens": 13,
        "children": [
          {
            "name": "dummy-mcp",
            "children": [
              {
                "name": "dummy_greeting",
                "numTokens": 6
              },
              {
                "name": "dummy_add_numbers",
                "numTokens": 7
              }
            ],
            "numTokens": 13
          }
        ]
      }
    ],
    "totalTokens": 13
  },
  "remainingBudget": 19987,
  "customizationBudget": 20000
}
```

---

## 5. Client Handling & Lifecycle Rules
1. **Context Window Optimization**: Clients can display token usage breakdown in UI settings to warn users if MCP tool schemas or workspace rules consume too much of the prompt context window.
