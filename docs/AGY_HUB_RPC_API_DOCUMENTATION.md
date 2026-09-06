# Antigravity Hub gRPC-Web RPC API Reference & Integration Guide

This document provides a comprehensive technical specification for the **Google Antigravity Hub Language Server (`agy --hub`) RPC protocol**. It is designed for developers building custom UI wrappers, web applications, or desktop clients over the `agy` daemon.

---

## Table of Contents
1. [Architecture & Transport Protocol](#1-architecture--transport-protocol)
   - [Daemon Initialization](#daemon-initialization)
   - [HTTP & Header Requirements](#http--header-requirements)
   - [gRPC-Web Wire Framing](#grpc-web-wire-framing)
2. [Complete RPC API Reference](#2-complete-rpc-api-reference)
   - [Model & Quota Management](#model--quota-management)
   - [Session / Cascade Lifecycle](#session--cascade-lifecycle)
   - [Messaging & Execution Control](#messaging--execution-control)
   - [Streaming & State Subscriptions](#streaming--state-subscriptions)
   - [History & Trajectory Inspection](#history--trajectory-inspection)
   - [System, Auth & Workspace Context](#system-auth--workspace-context)
3. [Fine-Grained Feature Control](#3-fine-grained-feature-control)
   - [Model Switching](#model-switching)
   - [Reasoning & Thinking Budget](#reasoning--thinking-budget)
   - [Tool Auto-Execution Policies](#tool-auto-execution-policies)
4. [Complete Reference Client Implementation](#4-complete-reference-client-implementation)

---

## 1. Architecture & Transport Protocol

### Daemon Initialization
The `agy` backend daemon exposes a local HTTP server that accepts gRPC-Web JSON calls:

```bash
agy --hub --hub-port=8090 --app_data_dir=antigravity --add-dir=/path/to/workspace
```

**Required Environment Variables**:
- `AGY_ENABLE_HUB=1`: Enables hub RPC mode.
- `ANTIGRAVITY_VSCODE_HOST=1`: Identifies the client host.
- `ANTIGRAVITY_AUTH_SUCCESS_APP=vscode`: Auth token handler target.

---

### HTTP & Header Requirements
All RPC requests are `POST` requests to `http://127.0.0.1:<PORT>/exa.language_server_pb.LanguageServerService/<MethodName>`.

| Header | Required Value | Purpose |
| :--- | :--- | :--- |
| `Content-Type` | `application/grpc-web+json` | Declares gRPC-Web JSON encoding |
| `X-Grpc-Web` | `1` | Enables gRPC-Web framing |
| `x-codeium-csrf-token` | `<csrf-token>` | CSRF token extracted from `http://127.0.0.1:<PORT>/` |

#### CSRF Token Extraction
Make a `GET` request to `http://127.0.0.1:<PORT>/` and extract the token from the inline script:
```js
const html = await fetch('http://127.0.0.1:8090/').then(r => r.text());
const csrfToken = html.match(/"csrfToken":\s*"([^"]+)"/)[1];
```

---

### gRPC-Web Wire Framing

Both request payloads and streaming response chunks are binary-framed:

```
+-----------------+-------------------------+-------------------------------+
| Byte 0 (Flag)   | Bytes 1-4 (Length)      | Bytes 5..N (Payload)          |
| 0x00 Data       | 32-bit Big-Endian Int   | UTF-8 Encoded JSON String     |
| 0x80 Trailer    |                         |                               |
+-----------------+-------------------------+-------------------------------+
```

#### Frame Encoder (JavaScript)
```js
function encodeFrame(jsonObj) {
  const jsonBuf = Buffer.from(JSON.stringify(jsonObj), 'utf-8');
  const frame = Buffer.alloc(5 + jsonBuf.length);
  frame[0] = 0x00; // Data Frame Flag
  frame.writeUInt32BE(jsonBuf.length, 1);
  jsonBuf.copy(frame, 5);
  return frame;
}
```

#### Frame Decoder Generator (JavaScript)
```js
async function* parseGrpcWebStream(responseBody) {
  let buffer = Buffer.alloc(0);
  for await (const chunk of responseBody) {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    while (buffer.length >= 5) {
      const flag = buffer[0];
      const length = buffer.readUInt32BE(1);
      if (buffer.length < 5 + length) break;
      
      const payload = buffer.subarray(5, 5 + length);
      buffer = buffer.subarray(5 + length);
      
      if (flag === 0x00 && payload.length > 0) {
        yield JSON.parse(payload.toString('utf-8'));
      }
    }
  }
}
```

---

## 2. Complete RPC API Reference

### Model & Quota Management

#### 1. `GetAvailableModels`
Fetches all live available models, quota limits, reset timestamps, and capabilities.

- **Endpoint**: `/exa.language_server_pb.LanguageServerService/GetAvailableModels`
- **Request Payload**:
  ```json
  { "force_refresh": true }
  ```
- **Response Structure**:
  ```json
  {
    "response": {
      "models": {
        "gemini-3.8-flash-high": {
          "model": "MODEL_PLACEHOLDER_M319",
          "displayName": "Gemini 3.8 Flash (High)",
          "disabled": false,
          "supportsThinking": true,
          "quotaInfo": {
            "remainingFraction": 1.0,
            "resetTime": "2026-09-06T12:00:00Z"
          }
        },
        "gemini-3.7-flash-tiered": {
          "model": "MODEL_PLACEHOLDER_M299",
          "displayName": "Gemini 3.7 Flash (Medium)",
          "disabled": false,
          "supportsThinking": true,
          "quotaInfo": {
            "remainingFraction": 0.85,
            "resetTime": "2026-09-06T12:00:00Z"
          }
        }
      }
    }
  }
  ```

#### 2. `RetrieveUserQuotaSummary`
Returns current user quota levels across models.

- **Endpoint**: `/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`
- **Request Payload**: `{}`
- **Response**: Quota breakdown per tier and model category.

---

### Session / Cascade Lifecycle

#### 3. `StartCascade`
Initializes a new conversation session (`cascadeId`).

- **Endpoint**: `/exa.language_server_pb.LanguageServerService/StartCascade`
- **Request Payload**:
  ```json
  {
    "source": "CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT",
    "cascadeId": "e0357f01-3c5a-4e6d-9a6a-08cc4934a508",
    "requestedModel": "MODEL_PLACEHOLDER_M319",
    "projectEnvConfig": {
      "projectId": "default-cli-project",
      "defaultProjectEnvironment": {}
    }
  }
  ```
- **Response**:
  ```json
  {
    "cascadeId": "e0357f01-3c5a-4e6d-9a6a-08cc4934a508",
    "projectEnvInfo": {}
  }
  ```

#### 4. `JetboxWriteSummary`
Sets a custom title/summary for a conversation session.

- **Endpoint**: `/exa.language_server_pb.LanguageServerService/JetboxWriteSummary`
- **Request Payload**:
  ```json
  {
    "cascadeId": "e0357f01-3c5a-4e6d-9a6a-08cc4934a508",
    "summary": {
      "summary": "Build Custom UI Wrapper",
      "createdTime": "2026-09-06T11:30:00.000Z"
    }
  }
  ```

#### 5. `UpdateConversationAnnotations`
Updates session metadata such as last read time.

- **Endpoint**: `/exa.language_server_pb.LanguageServerService/UpdateConversationAnnotations`
- **Request Payload**:
  ```json
  {
    "cascadeIds": ["e0357f01-3c5a-4e6d-9a6a-08cc4934a508"],
    "annotations": {
      "lastUserViewTime": "2026-09-06T11:30:00.000Z"
    },
    "mergeAnnotations": true
  }
  ```

---

### Messaging & Execution Control

#### 6. `SendUserCascadeMessage`
Sends a prompt to the agent with complete control over model choice, thinking budget, and tool auto-execution policies.

- **Endpoint**: `/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage`
- **Request Payload**:
  ```json
  {
    "cascadeId": "e0357f01-3c5a-4e6d-9a6a-08cc4934a508",
    "items": [
      {
        "text": "Check system status and run tests"
      }
    ],
    "cascadeConfig": {
      "plannerConfig": {
        "requestedModel": {
          "model": "MODEL_PLACEHOLDER_M299"
        },
        "supportsThinking": true,
        "thinkingBudget": 8192,
        "supportsLatexRendering": true,
        "useAiCredits": false,
        "toolConfig": {
          "runCommand": {
            "autoCommandConfig": {
              "autoExecutionPolicy": "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER"
            }
          },
          "notifyUser": {}
        },
        "knowledgeConfig": {}
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

### Streaming & State Subscriptions

#### 7. `StreamAgentStateUpdates`
Subscribes to live execution updates from the agent (real-time thinking deltas, text deltas, tool proposals, terminal execution outputs, and status transitions).

- **Endpoint**: `/exa.language_server_pb.LanguageServerService/StreamAgentStateUpdates`
- **Request Payload**:
  ```json
  {
    "conversationId": "e0357f01-3c5a-4e6d-9a6a-08cc4934a508",
    "subscriberId": "sub-1725621450000",
    "trajectoryVerbosity": 2,
    "initialStepsPageBounds": {
      "startIndex": 0
    }
  }
  ```

#### Parsing Emitted Updates
```js
for await (const chunk of parseGrpcWebStream(res.body)) {
  const update = chunk.update;
  const status = update?.status || update?.executableStatus || '';
  const steps = update?.mainTrajectoryUpdate?.stepsUpdate?.steps || [];
  
  steps.forEach(step => {
    // 1. Live Thinking Stream
    if (step.plannerResponse?.thinking) {
      console.log('Thinking Delta:', step.plannerResponse.thinking);
    }
    // 2. Live Content Delta
    if (step.plannerResponse?.response) {
      console.log('Response Content:', step.plannerResponse.response);
    }
    // 3. Command Execution Event
    if (step.runCommand) {
      console.log('Running Command:', step.runCommand.commandLine, step.runCommand.output);
    }
    // 4. File Read / Edit Event
    if (step.viewFile) {
      console.log('Read File:', step.viewFile.absolutePathUri);
    }
    if (step.codeAction) {
      console.log('File Edit Diff:', step.codeAction.diff);
    }
  });

  if (status === 'CASCADE_RUN_STATUS_IDLE') {
    console.log('Turn finished.');
  }
}
```

#### 8. `CancelCascadeInvocation` / `CancelCascadeSteps`
Interrupts agent execution or kills running background tasks.

- **Endpoint**: `/exa.language_server_pb.LanguageServerService/CancelCascadeInvocation`
- **Request Payload**:
  ```json
  {
    "cascadeId": "e0357f01-3c5a-4e6d-9a6a-08cc4934a508",
    "killBackgroundTasks": true
  }
  ```

---

### History & Trajectory Inspection

#### 9. `GetAllCascadeTrajectories`
Lists all active and past conversations.

- **Endpoint**: `/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories`
- **Request Payload**:
  ```json
  { "excludeSubtrajectories": true }
  ```
- **Response**: Map of trajectory summaries with `summary`, `lastModifiedTime`, and `stepCount`.

#### 10. `GetCascadeTrajectorySteps`
Fetches full step history and command outputs for a conversation.

- **Endpoint**: `/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps`
- **Request Payload**:
  ```json
  {
    "cascadeId": "e0357f01-3c5a-4e6d-9a6a-08cc4934a508",
    "trajectoryVerbosity": 2
  }
  ```

#### 11. `GetTurnDiff`
Fetches turn step index boundaries (`turnStartIndex`, `turnEndIndexExclusive`) and turn metadata.

- **Endpoint**: `/exa.language_server_pb.LanguageServerService/GetTurnDiff`
- **Request Payload**:
  ```json
  {
    "conversationId": "e0357f01-3c5a-4e6d-9a6a-08cc4934a508",
    "stepIndex": 11
  }
  ```

---

### System, Auth & Workspace Context

| Endpoint | Method | Request Payload | Purpose |
| :--- | :--- | :--- | :--- |
| `GetLocalUserInfo` | POST | `{}` | Returns user email and account plan (e.g. Google AI Pro) |
| `GetAuthStatus` | POST | `{}` | Checks login & auth token status |
| `GetUserStatus` | POST | `{}` | Returns feature flags & permissions |
| `GetSlashCommands` | POST | `{ cascadeConfig: ... }` | Returns available slash commands (`/goal`, `/schedule`, `/grill-me`, `/learn`) |
| `GetAllSkills` | POST | `{}` | Returns workspace & global skills |
| `GetAllWorkflows` | POST | `{}` | Returns available workflows |

---

## 3. Fine-Grained Feature Control

### Model Switching

You can switch models per message by updating `requestedModel.model`:

```js
const MODELS = {
  GEMINI_3_8_FLASH: "MODEL_PLACEHOLDER_M319",
  GEMINI_3_7_FLASH: "MODEL_PLACEHOLDER_M299",
  GEMINI_3_7_PRO:   "MODEL_GEMINI_3_7_PRO",
  CLAUDE_3_5_SONNET:"MODEL_CLAUDE_3_5_SONNET"
};
```

---

### Reasoning & Thinking Budget

Control thinking depth via `plannerConfig`:
- **Enable Thinking with Budget**:
  ```json
  "supportsThinking": true,
  "thinkingBudget": 8192
  ```
- **Disable Thinking**:
  ```json
  "supportsThinking": false,
  "thinkingBudget": 0
  ```

---

### Tool Auto-Execution Policies

Control execution policy via `autoExecutionPolicy`:
- `CASCADE_COMMANDS_AUTO_EXECUTION_EAGER`: Agent runs commands automatically without prompt.
- `CASCADE_COMMANDS_AUTO_EXECUTION_ASK_USER`: UI prompts user before running each tool call.
- `CASCADE_COMMANDS_AUTO_EXECUTION_DISABLED`: Agent cannot run tools.

---

## 4. Complete Reference Client Implementation

```javascript
import crypto from 'crypto';

export class AntigravityHubClient {
  constructor(port = 8090) {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.csrfToken = '';
  }

  async init() {
    const res = await fetch(`${this.baseUrl}/`);
    const html = await res.text();
    const match = html.match(/"csrfToken":\s*"([^"]+)"/);
    if (!match) throw new Error('CSRF Token not found');
    this.csrfToken = match[1];
  }

  getHeaders() {
    return {
      'Content-Type': 'application/grpc-web+json',
      'X-Grpc-Web': '1',
      'x-codeium-csrf-token': this.csrfToken
    };
  }

  encodeFrame(obj) {
    const buf = Buffer.from(JSON.stringify(obj), 'utf-8');
    const frame = Buffer.alloc(5 + buf.length);
    frame[0] = 0x00;
    frame.writeUInt32BE(buf.length, 1);
    buf.copy(frame, 5);
    return frame;
  }

  async *parseStream(responseBody) {
    let buffer = Buffer.alloc(0);
    for await (const chunk of responseBody) {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      while (buffer.length >= 5) {
        const flag = buffer[0];
        const length = buffer.readUInt32BE(1);
        if (buffer.length < 5 + length) break;
        const payload = buffer.subarray(5, 5 + length);
        buffer = buffer.subarray(5 + length);
        if (flag === 0x00 && payload.length > 0) {
          yield JSON.parse(payload.toString('utf-8'));
        }
      }
    }
  }

  async startSession(modelEnum = 'MODEL_PLACEHOLDER_M319') {
    const cascadeId = crypto.randomUUID();
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/StartCascade`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame({
        source: 'CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT',
        cascadeId,
        requestedModel: modelEnum,
        projectEnvConfig: { projectId: 'default-cli-project' }
      })
    });
    if (!res.ok) throw new Error(`StartCascade failed: ${res.status}`);
    return cascadeId;
  }

  async sendMessage({ cascadeId, prompt, modelEnum = 'MODEL_PLACEHOLDER_M299', thinkingBudget = 8192, autoExecute = true }) {
    const payload = {
      cascadeId,
      items: [{ text: prompt }],
      cascadeConfig: {
        plannerConfig: {
          requestedModel: { model: modelEnum },
          supportsThinking: thinkingBudget > 0,
          thinkingBudget,
          supportsLatexRendering: true,
          toolConfig: {
            runCommand: {
              autoCommandConfig: {
                autoExecutionPolicy: autoExecute ? 'CASCADE_COMMANDS_AUTO_EXECUTION_EAGER' : 'CASCADE_COMMANDS_AUTO_EXECUTION_ASK_USER'
              }
            }
          }
        },
        executorConfig: { useCoreDirect: true }
      },
      customAgentSpec: {
        builtinAgent: { defaultAgent: { isGoogle: false, isInteractive: true } }
      }
    };

    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame(payload)
    });
    return res.ok;
  }

  async *streamUpdates(cascadeId) {
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/StreamAgentStateUpdates`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame({
        conversationId: cascadeId,
        subscriberId: `sub-${Date.now()}`,
        trajectoryVerbosity: 2
      })
    });

    for await (const json of this.parseStream(res.body)) {
      yield json;
    }
  }
}
```
