# `GetCascadeTrajectorySteps` (Historical Steps Retrieval RPC)

## 1. Overview & Purpose
`GetCascadeTrajectorySteps` retrieves the complete, non-streaming historical array of trajectory steps for a conversation (`cascadeId`).

It is used for:
- One-shot conversation loading when switching chats or viewing previous chat turns.
- Getting the total raw step count for step pagination bounds and rewind calculations.
- Reconstructing the entire conversation timeline with user prompts, model thoughts, tool executions, and step outcomes.

---

## 2. Wire Protocol & Endpoint Specification

- **Service Path:** `/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps`
- **HTTP Method:** `POST`
- **Wire Format:** gRPC-Web framed JSON or Connect-RPC JSON
- **Default Port:** `8090` (or `8091` via proxy)

### HTTP Headers
```http
POST /exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps HTTP/1.1
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
{
  "cascadeId": "8931c764-d295-45c7-b362-c23fcea804cc",
  "trajectoryVerbosity": 2
}
```

### Kotlin `@Serializable` Request Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetCascadeTrajectoryStepsRequestDto(
    val cascadeId: String = "",
    val trajectoryVerbosity: Int = 2
)
```

### Verbosity Levels (`trajectoryVerbosity`)
| Level | Meaning | Output Content |
| :--- | :--- | :--- |
| `0` | Minimal | Only basic user prompts and raw responses. |
| `1` | Standard | User inputs, planner responses, and completed tool names. |
| `2` | **Full (Recommended)** | Complete trajectory including model thoughts, tool arguments, full outputs, hook decisions, and token usage metadata. |

---

## 4. Concrete Response Schema

### Response Body (JSON)
```json
{
  "steps": [
    {
      "type": "CORTEX_STEP_TYPE_USER_INPUT",
      "status": "CORTEX_STEP_STATUS_DONE",
      "metadata": {
        "createdAt": "2026-09-08T15:57:17.960583244Z",
        "source": "CORTEX_STEP_SOURCE_USER_EXPLICIT",
        "sourceTrajectoryStepInfo": {
          "cascadeId": "8931c764-d295-45c7-b362-c23fcea804cc",
          "stepIndex": 0
        }
      },
      "userInput": {
        "items": [
          {
            "text": "Say 1 only"
          }
        ],
        "userResponse": "Say 1 only"
      }
    },
    {
      "type": "CORTEX_STEP_TYPE_PLANNER_RESPONSE",
      "status": "CORTEX_STEP_STATUS_DONE",
      "metadata": {
        "createdAt": "2026-09-08T15:57:17.992265730Z",
        "source": "CORTEX_STEP_SOURCE_MODEL",
        "sourceTrajectoryStepInfo": {
          "cascadeId": "8931c764-d295-45c7-b362-c23fcea804cc",
          "stepIndex": 1
        }
      },
      "plannerResponse": {
        "response": "1",
        "modifiedResponse": "1",
        "stopReason": "STOP_REASON_STOP_PATTERN"
      }
    }
  ]
}
```

### Kotlin `@Serializable` Response Model
```kotlin
package com.example.gemini.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class GetCascadeTrajectoryStepsResponseDto(
    val steps: List<CortexStepDto> = emptyList()
)
```

*(Refer to [StreamAgentStateUpdates.md](file:///home/cat/agy_cli_hub/api_docs/StreamAgentStateUpdates.md) for the complete definition of `CortexStepDto`).*

---

## 5. Turn Construction & Block Mapping Algorithm

When parsing the `steps: List<CortexStepDto>` array into UI domain messages:

```kotlin
fun parseTrajectorySteps(steps: List<CortexStepDto>, conversationId: String): List<ChatMessage> {
    val messages = mutableListOf<ChatMessage>()
    val turnBlocks = mutableListOf<ChatBlock>()
    val turnTools = linkedMapOf<String, ToolCall>()
    var currentAssistantId: String? = null

    fun flushAssistantTurn() {
        if (turnBlocks.isNotEmpty() || turnTools.isNotEmpty()) {
            val content = turnBlocks.filterIsInstance<ChatBlock.MarkdownText>().joinToString("\n\n") { it.markdown }
            val thought = turnBlocks.filterIsInstance<ChatBlock.Thought>().joinToString("\n\n") { it.text }.takeIf { it.isNotBlank() }
            
            messages.add(
                ChatMessage(
                    id = currentAssistantId ?: UUID.randomUUID().toString(),
                    conversationId = conversationId,
                    role = MessageRole.ASSISTANT,
                    content = content,
                    thoughtText = thought,
                    toolCalls = turnTools.values.toList(),
                    blocks = turnBlocks.toList(),
                    isStreaming = false
                )
            )
            turnBlocks.clear()
            turnTools.clear()
            currentAssistantId = null
        }
    }

    for ((i, step) in steps.withIndex()) {
        val stepIndex = step.metadata?.sourceTrajectoryStepInfo?.stepIndex ?: i

        when (step.type) {
            "CORTEX_STEP_TYPE_USER_INPUT" -> {
                flushAssistantTurn()
                val text = step.userInput?.userResponse?.takeIf { it.isNotBlank() }
                    ?: step.userInput?.items?.firstOrNull()?.text ?: ""
                
                messages.add(
                    ChatMessage(
                        id = "user_${conversationId}_$stepIndex",
                        conversationId = conversationId,
                        role = MessageRole.USER,
                        content = text,
                        stepIndex = stepIndex
                    )
                )
            }
            "CORTEX_STEP_TYPE_PLANNER_RESPONSE" -> {
                if (currentAssistantId == null) currentAssistantId = "assistant_${conversationId}_$stepIndex"
                val th = step.plannerResponse?.thinking ?: ""
                val resp = step.plannerResponse?.response ?: ""
                if (th.isNotBlank()) turnBlocks.add(ChatBlock.Thought(th, stepIndex = stepIndex))
                if (resp.isNotBlank()) turnBlocks.add(ChatBlock.MarkdownText(resp, stepIndex = stepIndex))
            }
            "CORTEX_STEP_TYPE_GENERIC" -> {
                if (currentAssistantId == null) currentAssistantId = "assistant_${conversationId}_$stepIndex"
                val tool = extractToolCallFromStep(step, stepIndex, conversationId)
                if (tool != null) {
                    turnTools[tool.id] = tool
                    turnBlocks.add(ChatBlock.ToolExecution(tool, stepIndex = stepIndex))
                }
            }
        }
    }
    flushAssistantTurn()
    return messages
}
```

---

## 6. Real Traffic Example (from `8931c764-d295-45c7-b362-c23fcea804cc`)

```json
{
  "steps": [
    {
      "type": "CORTEX_STEP_TYPE_USER_INPUT",
      "status": "CORTEX_STEP_STATUS_DONE",
      "metadata": {
        "createdAt": "2026-09-08T15:57:17.960583244Z",
        "sourceTrajectoryStepInfo": {
          "stepIndex": 0
        }
      },
      "userInput": {
        "items": [{ "text": "Say 1 only" }]
      }
    },
    {
      "type": "CORTEX_STEP_TYPE_PLANNER_RESPONSE",
      "status": "CORTEX_STEP_STATUS_DONE",
      "metadata": {
        "sourceTrajectoryStepInfo": {
          "stepIndex": 1
        }
      },
      "plannerResponse": {
        "response": "1"
      }
    }
  ]
}
```
