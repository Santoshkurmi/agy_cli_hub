# `SendUserCascadeMessage` (User Prompt & Attachment Dispatch RPC)

## 1. Overview & Purpose
`SendUserCascadeMessage` sends a user prompt, multimodal attachments (images, audio voice notes), and execution configurations (selected AI model, thinking budget, tool execution policies, custom agent specifications) into an active cascade conversation.

Upon receiving the request, AGY Hub:
1. Appends a new `CORTEX_STEP_TYPE_USER_INPUT` step to the conversation trajectory.
2. Wakes up the Planner Loop and starts streaming `CORTEX_STEP_TYPE_PLANNER_RESPONSE` and tool execution steps over `StreamAgentStateUpdates`.
3. Returns an immediate status acknowledgment (`grpc-status: 0`).

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or standard Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/SendUserCascadeMessage HTTP/1.1
Host: 127.0.0.1:8090
Content-Type: application/grpc-web+json
Accept: */*
Connect-Protocol-Version: 1
x-conversation-id: <CASCADE_UUID>
x-cascade-id: <CASCADE_UUID>
x-codeium-csrf-token: <CSRF_TOKEN>
```

---

## 3. Concrete Request Schema

### Request Body (JSON)
```json
{
  "cascadeId": "f114692e-a724-47fd-b3bf-969760907bbf",
  "items": [
    {
      "text": "Analyze the codebase architecture"
    }
  ],
  "media": [
    {
      "mimeType": "image/png",
      "inlineData": "<BASE64_ENCODED_DATA>",
      "description": "Screenshot",
      "durationSeconds": 0
    }
  ],
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
      "supportsThinking": true,
      "thinkingBudget": 8192,
      "knowledgeConfig": {},
      "useAiCredits": false,
      "supportsLatexRendering": true
    },
    "executorConfig": {
      "useCoreDirect": true
    },
    "conversationHistoryConfig": {}
  },
  "customAgentSpec": {
    "builtinAgent": {
      "defaultAgent": {
        "isGoogle": false,
        "isInteractive": true
      }
    }
  },
  "deliveryStrategy": "MESSAGE_DELIVERY_STRATEGY_WHEN_IDLE"
}
```

---

## 4. Kotlin `@Serializable` Request & Response Models

```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class SendUserPromptPayloadDto(
    val cascadeId: String = "",
    val items: List<CascadeMessageItemDto> = emptyList(),
    val media: List<MediaAttachmentDto> = emptyList(),
    val cascadeConfig: CascadeConfigDto? = null,
    val customAgentSpec: CustomAgentSpecDto? = null,
    val deliveryStrategy: String = "MESSAGE_DELIVERY_STRATEGY_WHEN_IDLE",
    val userResponse: String? = null
)

@Serializable
data class CascadeMessageItemDto(
    val text: String = ""
)

@Serializable
data class MediaAttachmentDto(
    val mimeType: String = "",
    val inlineData: String = "",
    val description: String = "Voice note",
    val durationSeconds: Int = 0
)

@Serializable
data class CascadeConfigDto(
    val plannerConfig: PlannerConfigDto? = null,
    val executorConfig: ExecutorConfigDto? = null,
    val conversationHistoryConfig: JsonObject = JsonObject(emptyMap())
)

@Serializable
data class PlannerConfigDto(
    val toolConfig: PlannerToolConfigDto? = null,
    val requestedModel: RequestedModelDto? = null,
    val supportsThinking: Boolean = false,
    val thinkingBudget: Int = 0,
    val knowledgeConfig: JsonObject = JsonObject(emptyMap()),
    val useAiCredits: Boolean = false,
    val supportsLatexRendering: Boolean = true
)

@Serializable
data class PlannerToolConfigDto(
    val runCommand: RunCommandToolConfigDto? = null,
    val notifyUser: JsonObject = JsonObject(emptyMap())
)

@Serializable
data class RunCommandToolConfigDto(
    val autoCommandConfig: AutoCommandConfigDto? = null
)

@Serializable
data class AutoCommandConfigDto(
    val autoExecutionPolicy: String = "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER"
)

@Serializable
data class RequestedModelDto(
    val model: String = ""
)

@Serializable
data class ExecutorConfigDto(
    val useCoreDirect: Boolean = true
)

@Serializable
data class CustomAgentSpecDto(
    val builtinAgent: BuiltinAgentSpecDto? = null
)

@Serializable
data class BuiltinAgentSpecDto(
    val defaultAgent: DefaultAgentSpecDto? = null
)

@Serializable
data class DefaultAgentSpecDto(
    val isGoogle: Boolean = false,
    val isInteractive: Boolean = true
)

@Serializable
data class SendUserCascadeMessageResponseDto(
    val success: Boolean = true
)
```

---

## 5. Configuration Fields & Policy Enums

### 1. Delivery Strategies (`deliveryStrategy`)
| Strategy Value | Description |
| :--- | :--- |
| `MESSAGE_DELIVERY_STRATEGY_WHEN_IDLE` | Default. Wait until the current agent task completes before processing this message. |
| `MESSAGE_DELIVERY_STRATEGY_IMMEDIATE` | Queue immediately and interrupt current generation if necessary. |

### 2. Auto Command Execution Policies (`autoExecutionPolicy`)
| Policy Value | Behavior |
| :--- | :--- |
| `CASCADE_COMMANDS_AUTO_EXECUTION_EAGER` | Auto-run safe/read-only commands; prompt only for modifying shell commands. |
| `CASCADE_COMMANDS_AUTO_EXECUTION_PROMPT` | Always prompt user before running shell commands. |
| `CASCADE_COMMANDS_AUTO_EXECUTION_OFF` | Disallow automatic terminal execution. |

### 3. Model IDs (`requestedModel.model`)
- AGY Hub internal placeholder / wire enum IDs:
  - `MODEL_PLACEHOLDER_M299` $\to$ Gemini 2.5 Flash / Standard
  - `MODEL_PLACEHOLDER_M319` $\to$ Gemini 2.5 Pro / Thinking
  - `MODEL_PLACEHOLDER_M190` $\to$ Claude 3.7 Sonnet (Thinking)

---

## 6. Concrete Response & Trailer

### Response Frame #1 (DATA)
```json
{}
```

### Response Frame #2 (TRAILER)
```http
grpc-status: 0
```

---

## 7. Client Handling & Error Matrix

1. **Success (`grpc-status: 0`)**: Message is successfully queued in the daemon. UI should optimistically display the user bubble and activate the typing indicator if not already streaming.
2. **Conversation Not Found (`grpc-status: 5` / `NOT_FOUND`)**: The `cascadeId` is unknown to the daemon. The client should invoke `StartCascade` to create a new session.
3. **Invalid Model (`grpc-status: 3` / `INVALID_ARGUMENT`)**: The specified model enum is not supported or out of quota.
