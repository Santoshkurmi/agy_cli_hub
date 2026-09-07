# Antigravity Hub RPC API Reference & Integration Guide

This document is the definitive technical specification and end-to-end integration manual for the **Google Antigravity Hub Language Server (`agy --hub`) RPC interface**.

It provides complete, type-safe schemas (TypeScript-compatible with explicit optionality and nullability) for all endpoints utilized by the application, along with concrete request/response payloads, wire framing specifications, and end-to-end workflow recipes (chat streaming, multi-modal image dispatch, conversation branching, tool authorization, process management, and rendering).

---

## Table of Contents

1. [Architecture & Transport Protocols](#1-architecture--transport-protocols)
   - [HTTP Headers & Security Handshake](#http-headers--security-handshake)
   - [Wire Formats: Connect-RPC JSON vs gRPC-Web Binary Framing](#wire-formats)
   - [Frame Encoding & Decoding Reference](#frame-encoding--decoding-reference)
2. [End-to-End Workflow Guides](#2-end-to-end-workflow-guides)
   - [Authentication & Session Flow (Login, Polling, Logout)](#workflow-authentication)
   - [Conversation List & Real-Time Sidebar Updates](#workflow-conversations)
   - [The Streaming Chat Pipeline (Text, Images, Thinking, Execution)](#workflow-chat-pipeline)
   - [Tool Confirmation & Process Execution Lifecycle](#workflow-tool-execution)
   - [Conversation Branching & Step Rewind (Fork & Revert)](#workflow-branching)
   - [Message Parsing & Rendering Pipeline](#workflow-rendering)
3. [Complete API Reference](#3-complete-api-reference)
   - [Authentication & Identity](#api-auth)
   - [Conversation Lifecycle](#api-conversation)
   - [Chat & Streaming Messages](#api-messaging)
   - [Tool & Process Control](#api-tools)
   - [System, Models & Quotas](#api-system)

---

<a name="1-architecture--transport-protocols"></a>
## 1. Architecture & Transport Protocols

The `agy` daemon hosts a local HTTP/gRPC server (default port `8090`). All remote procedure calls target the package service namespace:
```http
POST http://127.0.0.1:8090/exa.language_server_pb.LanguageServerService/<MethodName>
```

### HTTP Headers & Security Handshake

Every state-mutating request requires an active CSRF token issued by the daemon:

| Header | Value / Format | Description |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` or `application/grpc-web+json` | Declares body serialization |
| `x-codeium-csrf-token` | `<UUIDv4 String>` | **Required** anti-CSRF token |
| `X-Grpc-Web` | `1` | Required when using gRPC-Web framed endpoints |

#### CSRF Token Extraction Recipe
To obtain a valid CSRF token, perform a `GET` request to `http://127.0.0.1:8090/` and extract the `csrfToken` parameter:
```typescript
async function fetchCsrfToken(baseUrl: string = 'http://127.0.0.1:8090'): Promise<string> {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();
  const match = html.match(/"csrfToken":\s*"([^"]+)"/);
  if (!match) throw new Error("Could not extract csrfToken from daemon homepage");
  return match[1];
}
```

<a name="wire-formats"></a>
### Wire Formats

The daemon natively supports two invocation styles:

1. **Direct Connect-RPC JSON (Unary Calls)**:
   - Header: `Content-Type: application/json`
   - Payload: Standard uncompressed JSON string: `{"key": "value"}`
   - Response: Standard uncompressed JSON string: `{"key": "value"}`
   - *Used for:* `Login`, `AuthLogout`, `GetAuthStatus`, `GetLocalUserInfo`, `StartCascade`, `ForkConversation`, `DeleteCascadeTrajectory`, `HandleCascadeUserInteraction`, etc.

2. **gRPC-Web Framed JSON (Streaming & Unary)**:
   - Header: `Content-Type: application/grpc-web+json`, `X-Grpc-Web: 1`
   - Payload: 5-byte length-prefixed binary frame enclosing UTF-8 JSON.
   - Response Stream: One or more 5-byte length-prefixed frames (`0x00` Data, `0x80` Trailers).
   - *Used for:* `StreamCascadeUpdates`, `SubscribeToSummaries`, `SendUserCascadeMessage`, `GetConversationHistory`.

<a name="frame-encoding--decoding-reference"></a>
### Frame Encoding & Decoding Reference

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   Flag (0x00) |               Payload Length (Big-Endian UInt32)
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|      ...      |               UTF-8 JSON Encoded Payload ...  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

#### TypeScript / JavaScript Codec
```typescript
// Encode JSON object to gRPC-Web 5-byte prefixed frame
export function encodeFrame(payload: object): Uint8Array {
  const textBytes = new TextEncoder().encode(JSON.stringify(payload));
  const frame = new Uint8Array(5 + textBytes.length);
  frame[0] = 0x00; // Data frame flag (0x80 indicates trailers)
  const view = new DataView(frame.buffer);
  view.setUint32(1, textBytes.length, false); // Big-Endian uint32
  frame.set(textBytes, 5);
  return frame;
}

// Decode streaming gRPC-Web binary chunks
export async function parseStream(
  stream: ReadableStream<Uint8Array>,
  onFrame: (payload: any) => void
): Promise<void> {
  const reader = stream.getReader();
  let buffer = new Uint8Array(0);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const merged = new Uint8Array(buffer.length + value.length);
    merged.set(buffer);
    merged.set(value, buffer.length);
    buffer = merged;

    while (buffer.length >= 5) {
      const flag = buffer[0];
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const length = view.getUint32(1, false);

      if (buffer.length < 5 + length) break; // Incomplete frame, wait for more chunks

      const payloadBytes = buffer.subarray(5, 5 + length);
      buffer = buffer.subarray(5 + length);

      if (flag === 0x00 && payloadBytes.length > 0) {
        const text = new TextDecoder().decode(payloadBytes);
        try {
          onFrame(JSON.parse(text));
        } catch (e) {
          console.error("Failed to parse frame JSON:", text);
        }
      }
    }
  }
}
```

---

<a name="2-end-to-end-workflow-guides"></a>
## 2. End-to-End Workflow Guides

<a name="workflow-authentication"></a>
### Workflow 1: Authentication & Session Flow

The Antigravity daemon handles OAuth 2.0 PKCE directly with Google:
```
[User App]                           [Daemon (agy)]                      [Google OAuth]
     |                                      |                                  |
     |--- POST /Login --------------------->| (Spins up localhost callback)    |
     |    {"isGcpTos": false}               |--- Opens Browser ---------------->|
     |                                      |    (PKCE S256 Code Challenge)    |
     |                                      |                                  |
     |-- (Polls /GetAuthStatus every 2s) -> |                                  |
     |                                      |<-- User signs in via browser ----|
     |                                      |    Redirects to localhost:port   |
     |                                      |--- Exchanges code for tokens --->|
     |                                      |    Stores credentials locally    |
     |<-- /Login completes -----------------|                                  |
     |<-- /GetAuthStatus returns valid <----|                                  |
```

#### Step-by-Step Implementation
1. **Trigger Login**: Send `POST /Login` with `{"isGcpTos": false, "additionalScopes": [], "enableBusinessLogin": false}`.
2. **Automatic Browser Handshake**: The daemon binds a local ephemeral port (e.g. `http://localhost:35619/auth/callback`), generates a PKCE code challenge and state nonce, and automatically calls your operating system's browser opener (`xdg-open` / open).
3. **Status Polling**: While the user is completing the sign-in screen in the browser, poll `POST /GetAuthStatus` every 2 seconds.
4. **Resolution**: Once Google redirects to the daemon's ephemeral callback server, the daemon completes token exchange. `GetAuthStatus` returns `hasValidAuth: true` with granted scopes.
5. **Logout**: To revoke or clear the token, send `POST /AuthLogout` with empty body `{}`.

---

<a name="workflow-conversations"></a>
### Workflow 2: Conversation List & Real-Time Sidebar Updates

Conversations in Antigravity are called **Cascades** or **Trajectories**. The application maintains a real-time reactive sidebar list using `SubscribeToSummaries`:

```typescript
// Establish persistent streaming listener for conversations
function watchConversations(client: AgyClient, onUpdate: (conversations: CascadeSummary[]) => void) {
  const abortController = new AbortController();

  client.subscribeToSummaries((data) => {
    if (data.updates) {
      // Map updates to UI models
      const items = data.updates.map(u => ({
        cascadeId: u.cascadeId,
        trajectoryId: u.trajectoryId,
        title: u.summary || 'New Conversation',
        lastModifiedTime: u.lastModifiedTime,
        stepCount: u.stepCount,
        isActive: u.isActive
      }));
      onUpdate(items);
    }
  }, abortController.signal);

  return () => abortController.abort();
}
```

#### Starting a New Conversation
To start a new conversation thread, call `POST /StartCascade`:
```json
{
  "model": "MODEL_PLACEHOLDER_M319",
  "workspace": {
    "localWorkspace": {
      "workspaceUri": "file:///home/cat/agy_cli_hub"
    }
  }
}
```
Response returns `{ "cascadeId": "<uuid-string>" }`.

---

<a name="workflow-chat-pipeline"></a>
### Workflow 3: The Streaming Chat Pipeline (Text, Images, Thinking, Execution)

When the user sends a message, two RPCs are orchestrated in tandem:
1. `POST /StreamCascadeUpdates` is opened to subscribe to incremental streaming events.
2. `POST /SendUserCascadeMessage` is dispatched to queue the user's turn.

```
[UI Client]                                                  [Daemon]
     |                                                          |
     |---- 1. POST /StreamCascadeUpdates (gRPC-Web Stream) ---->|
     |                                                          |
     |---- 2. POST /SendUserCascadeMessage -------------------->|
     |         - Text Prompt                                    |
     |         - Base64 Images (Media)                          |
     |         - Thinking Budget & Auto-Execution Policy        |
     |                                                          |
     |<=== Streaming Chunks ====================================|
     |     Chunk 1: plannerResponse.thinking (partial tokens)   |
     |     Chunk 2: plannerResponse.thinking (more tokens)      |
     |     Chunk 3: plannerResponse.response (assistant prose)  |
     |     Chunk 4: runCommand / codeAction (tool call proposed)|
     |     Chunk 5: tool execution output / terminal stdout     |
     |     Chunk 6: step completion marker                      |
```

#### Multi-Modal Image Encoding
Images are attached inside `SendUserCascadeMessage` using the `media` array with standard data URIs or base64 structures:
```typescript
interface MediaAttachment {
  inlineData: {
    mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    data: string; // Pure Base64 string without data:image/... prefix
  };
}
```

#### Setting Thinking Budgets & Execution Policies
- **Thinking Budget**: Set `thinkingBudget` (integer, e.g. `8192` or `0` for none).
- **Auto-Execution Policy**:
  - `CASCADE_COMMANDS_AUTO_EXECUTION_EAGER`: Agent runs commands without asking.
  - `CASCADE_COMMANDS_AUTO_EXECUTION_REVIEW_DEFAULT`: Agent proposes commands and suspends execution until the user confirms or denies.

---

<a name="workflow-tool-execution"></a>
### Workflow 4: Tool Confirmation & Process Execution Lifecycle

When the agent operates in `REVIEW` mode (or triggers high-risk tools like bash commands, file overwrites, or git checkout), it emits an interaction request:

1. **Detection in Stream**:
   The stream yields a step with `requestedInteraction`:
   ```json
   {
     "stepIndex": 5,
     "trajectoryId": "349cfddf-...",
     "requestedInteraction": {
       "type": "USER_INTERACTION_TYPE_CONFIRMATION",
       "permission": {
         "toolName": "run_command",
         "command": "git push origin main",
         "scope": "PERMISSION_SCOPE_ONCE"
       }
     }
   }
   ```
2. **User Interaction**:
   The UI renders **Allow** and **Deny** buttons.
3. **Dispatch Resolution**:
   Call `POST /HandleCascadeUserInteraction`:
   - To approve:
     ```json
     {
       "cascadeId": "...",
       "stepIndex": 5,
       "trajectoryId": "...",
       "allow": true,
       "permissionScope": "PERMISSION_SCOPE_ONCE"
     }
     ```
   - To deny with custom feedback:
     ```json
     {
       "cascadeId": "...",
       "stepIndex": 5,
       "trajectoryId": "...",
       "allow": false,
       "userDenyInstruction": "Do not push to main. Create a feature branch first."
     }
     ```
4. **Canceling Ongoing Execution**:
   To immediately abort a running command or thinking agent, send `POST /StopCascade` with `{"cascadeId": "..."}`.

---

<a name="workflow-branching"></a>
### Workflow 5: Conversation Branching & Step Rewind (Fork & Revert)

Antigravity supports nonlinear history navigation:

#### 1. Forking a Conversation (`ForkConversation`)
Creates a new independent conversation branch cloned from a specific step index:
```json
{
  "sourceCascadeId": "349cfddf-0f56-4e3f-9e8e-7460a58ab92f",
  "forkAtStepIndex": 8,
  "workspace": {
    "localWorkspace": {
      "workspaceUri": "file:///home/cat/agy_cli_hub"
    }
  }
}
```
*Response:* `{ "cascadeId": "<new-cascade-uuid>", "trajectoryId": "<new-trajectory-uuid>" }`.

#### 2. Reverting to a Prior Step (`RevertToCascadeStep`)
Truncates the trajectory in-place, rewinding to a past state and discarding all later turns:
```json
{
  "cascadeId": "349cfddf-0f56-4e3f-9e8e-7460a58ab92f",
  "stepIndex": 4,
  "model": "MODEL_PLACEHOLDER_M319",
  "autoExecutionPolicy": "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER"
}
```

---

<a name="workflow-rendering"></a>
### Workflow 6: Message Parsing & Rendering Pipeline

Trajectories are returned as raw steps (`Step[]`). The UI parser aggregates steps into human-readable conversational turns:

```
Raw Trajectory Steps:
[0] userInput (text: "Analyze the database schema")
[1] plannerResponse (thinking: "Checking migrations...", response: "I will inspect schema.sql")
[2] viewFile (path: "schema.sql", content: "CREATE TABLE ...")
[3] plannerResponse (response: "Here is what I found:")
```

#### Parsing Algorithm
1. **User Turn**: Triggered when `step.userInput` is present.
   - Text is extracted from `userInput.userMessage.text` (filtering out system tags like `<USER_REQUEST>`).
   - Attached files and images are extracted from `userInput.userMessage.media`.
2. **Assistant Turn**: Triggered by `plannerResponse` or tool invocation steps:
   - `plannerResponse.thinking`: Collapsible "Thinking Process" block.
   - `plannerResponse.response`: Markdown body with code syntax highlighting.
   - `runCommand`: Terminal block showing command line, status badge, execution duration, and console output.
   - `codeAction` / file edit: Interactive diff block (`+` green additions, `-` red deletions).
   - `generateImage`: Render embedded image artifact directly.

---

<a name="3-complete-api-reference"></a>
## 3. Complete API Reference

All schemas use TypeScript notation with strict nullability annotations (`?` = optional field; `| null` = nullable).

---

<a name="api-auth"></a>
### 3.1 Authentication & Identity

#### `POST /exa.language_server_pb.LanguageServerService/Login`
Initiates Google OAuth 2.0 PKCE flow. Opens the local callback server and OS browser.

* **Transport**: Connect-RPC JSON (`Content-Type: application/json`)
* **Request Schema**:
```typescript
interface LoginRequest {
  isGcpTos?: boolean;                       // default: false
  additionalScopes?: string[];              // default: []
  enableBusinessLogin?: boolean;            // default: false
  wifLoginInfo?: {
    providerName: string;
  } | null;
}
```
* **Sample Request Payload**:
```json
{
  "isGcpTos": false,
  "additionalScopes": [],
  "enableBusinessLogin": false
}
```
* **Response Schema**:
```typescript
interface LoginResponse {
  authResult?: {
    hasValidAuth: boolean;
    grantedScopes?: string[];
    projectId?: string;
    location?: string;
    wifProvider?: string;
    isGcpTos?: boolean;
  };
}
```

---

#### `POST /exa.language_server_pb.LanguageServerService/AuthLogout`
Revokes active session tokens and clears cached credentials.

* **Transport**: Connect-RPC JSON (`Content-Type: application/json`)
* **Request Schema**: `{}` (Empty JSON object)
* **Response Schema**: `{}` (Empty JSON object, HTTP 200 OK)

---

#### `POST /exa.language_server_pb.LanguageServerService/GetAuthStatus`
Returns active authentication state, scopes, and active project credentials.

* **Transport**: Connect-RPC JSON (`Content-Type: application/json`)
* **Request Schema**: `{}`
* **Response Schema**:
```typescript
interface GetAuthStatusResponse {
  authResult: {
    hasValidAuth?: boolean;                // true if authenticated
    grantedScopes?: string[];              // e.g. ["https://www.googleapis.com/auth/userinfo.email", ...]
    projectId?: string;
    location?: string;
  };
}
```
* **Sample Response (Logged In)**:
```json
{
  "authResult": {
    "hasValidAuth": true,
    "grantedScopes": [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/cclog",
      "https://www.googleapis.com/auth/experimentsandconfigs",
      "https://www.googleapis.com/auth/aicode"
    ]
  }
}
```
* **Sample Response (Logged Out)**:
```json
{
  "authResult": {}
}
```

---

#### `POST /exa.language_server_pb.LanguageServerService/GetLocalUserInfo`
Returns system username and home directory URI.

* **Transport**: Connect-RPC JSON (`Content-Type: application/json`)
* **Request Schema**: `{}`
* **Response Schema**:
```typescript
interface GetLocalUserInfoResponse {
  username?: string;                        // e.g. "cat"
  homeDirUri?: string;                      // e.g. "file:///home/cat"
}
```
* **Sample Response**:
```json
{
  "username": "cat",
  "homeDirUri": "file:///home/cat"
}
```

---

#### `POST /exa.language_server_pb.LanguageServerService/HasAuthToken`
Quick boolean check verifying presence of stored token.

* **Transport**: Connect-RPC JSON (`Content-Type: application/json`)
* **Request Schema**: `{}`
* **Response Schema**:
```typescript
interface HasAuthTokenResponse {
  hasToken?: boolean;
}
```

---

<a name="api-conversation"></a>
### 3.2 Conversation Lifecycle

#### `POST /exa.language_server_pb.LanguageServerService/SubscribeToSummaries`
Server-streaming endpoint yielding live conversation metadata for sidebar lists.

* **Transport**: gRPC-Web Binary Framed (`application/grpc-web+json`)
* **Request Schema**:
```typescript
interface SubscribeToSummariesRequest {
  workspaceFilter?: {
    workspaceUri?: string;
  };
}
```
* **Streaming Response Frame Schema**:
```typescript
interface SummaryUpdateChunk {
  updates?: Array<{
    cascadeId: string;                     // Primary conversation ID
    trajectoryId: string;                  // Underlying trajectory storage key
    summary: string;                       // Conversation title
    lastModifiedTime?: string;             // ISO-8601 string or epoch ms
    stepCount?: number;
    isActive?: boolean;                    // true if currently computing
  }>;
}
```
* **Sample Chunk**:
```json
{
  "updates": [
    {
      "cascadeId": "349cfddf-0f56-4e3f-9e8e-7460a58ab92f",
      "trajectoryId": "traj-9901-abcd",
      "summary": "Implement OAuth Documentation & Integration Guide",
      "lastModifiedTime": "2026-09-07T12:45:00Z",
      "stepCount": 24,
      "isActive": false
    }
  ]
}
```

---

#### `POST /exa.language_server_pb.LanguageServerService/StartCascade`
Initializes a new empty conversation session.

* **Transport**: Connect-RPC JSON (`Content-Type: application/json`)
* **Request Schema**:
```typescript
interface StartCascadeRequest {
  model: string;                            // e.g. "MODEL_PLACEHOLDER_M319"
  workspace?: {
    localWorkspace?: {
      workspaceUri: string;                 // e.g. "file:///home/cat/agy_cli_hub"
    };
  };
}
```
* **Response Schema**:
```typescript
interface StartCascadeResponse {
  cascadeId: string;                        // Generated conversation UUID
  trajectoryId?: string;
}
```

---

#### `POST /exa.language_server_pb.LanguageServerService/ForkConversation`
Forks a conversation thread at a given step into a new independent session.

* **Transport**: Connect-RPC JSON (`Content-Type: application/json`)
* **Request Schema**:
```typescript
interface ForkConversationRequest {
  sourceCascadeId: string;
  forkAtStepIndex?: number | null;          // Step index to branch from (null = latest)
  workspace?: {
    localWorkspace?: {
      workspaceUri: string;
    };
  };
}
```
* **Response Schema**:
```typescript
interface ForkConversationResponse {
  cascadeId: string;                        // New conversation ID
  trajectoryId?: string;
}
```

---

#### `POST /exa.language_server_pb.LanguageServerService/DeleteCascadeTrajectory`
Permanently deletes a conversation trajectory.

* **Transport**: Connect-RPC JSON (`Content-Type: application/json`)
* **Request Schema**:
```typescript
interface DeleteCascadeTrajectoryRequest {
  cascadeId: string;
}
```
* **Response Schema**: `{}` (Empty JSON object on success)

---

#### `POST /exa.language_server_pb.LanguageServerService/RevertToCascadeStep`
Rewinds a conversation to a prior step index, discarding downstream changes.

* **Transport**: Connect-RPC JSON (`Content-Type: application/json`)
* **Request Schema**:
```typescript
interface RevertToCascadeStepRequest {
  cascadeId: string;
  stepIndex: number;
  model?: string;
  autoExecutionPolicy?: "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER" | "CASCADE_COMMANDS_AUTO_EXECUTION_REVIEW_DEFAULT";
}
```
* **Response Schema**: `{}` (Empty JSON object on success)

---

#### `POST /exa.language_server_pb.LanguageServerService/StopCascade`
Aborts any active agent planning, model generation, or running bash process.

* **Transport**: Connect-RPC JSON (`Content-Type: application/json`)
* **Request Schema**:
```typescript
interface StopCascadeRequest {
  cascadeId: string;
}
```
* **Response Schema**: `{}` (Empty JSON object on success)

---

<a name="api-messaging"></a>
### 3.3 Chat & Streaming Messages

#### `POST /exa.language_server_pb.LanguageServerService/SendUserCascadeMessage`
Submits a user prompt, images, and execution configurations to a conversation.

* **Transport**: gRPC-Web Binary Framed (`application/grpc-web+json`)
* **Request Schema**:
```typescript
interface SendUserCascadeMessageRequest {
  cascadeId: string;
  userMessage: {
    text: string;                           // Plain text prompt
    media?: Array<{
      inlineData: {
        mimeType: string;                   // e.g. "image/png"
        data: string;                       // Raw Base64 string
      };
    }>;
  };
  model?: string;                           // e.g. "MODEL_PLACEHOLDER_M319"
  thinkingBudget?: number;                  // Integer token budget, e.g. 8192
  autoExecutionPolicy?: "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER" | "CASCADE_COMMANDS_AUTO_EXECUTION_REVIEW_DEFAULT";
  planningMode?: boolean;                   // Enables structured planning workflows
}
```
* **Sample Request (Text + Attached Image)**:
```json
{
  "cascadeId": "349cfddf-0f56-4e3f-9e8e-7460a58ab92f",
  "userMessage": {
    "text": "Review this UI mockup and explain how to style it.",
    "media": [
      {
        "inlineData": {
          "mimeType": "image/png",
          "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        }
      }
    ]
  },
  "model": "MODEL_PLACEHOLDER_M319",
  "thinkingBudget": 8192,
  "autoExecutionPolicy": "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER"
}
```

---

#### `POST /exa.language_server_pb.LanguageServerService/StreamCascadeUpdates`
Establishes a persistent gRPC-Web stream yielding live thinking, text tokens, and tool calls.

* **Transport**: gRPC-Web Binary Framed (`application/grpc-web+json`)
* **Request Schema**:
```typescript
interface StreamCascadeUpdatesRequest {
  cascadeId: string;
  startStepIndex?: number;                  // default: 0
  persistent?: boolean;                     // keep stream open across steps
}
```
* **Streaming Response Frame Schema**:
```typescript
interface StreamCascadeChunk {
  mainTrajectoryUpdate?: {
    stepsUpdate?: {
      steps?: Step[];                       // Incremental or full step list
      totalLength?: number;
    };
  };
  isDone?: boolean;                         // true when current turn is finished
}

interface Step {
  stepIndex: number;
  type: string;                             // e.g. "PLANNER_RESPONSE", "USER_INPUT"
  status: "IN_PROGRESS" | "DONE" | "ERROR";
  
  // Model output
  plannerResponse?: {
    thinking?: string;                      // Reasoning stream
    response?: string;                      // Assistant markdown prose
    modifiedResponse?: string;
  };
  
  // Tool: Run Command
  runCommand?: {
    commandLine: string;
    cwd?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    durationMs?: number;
  };

  // Tool: View File
  viewFile?: {
    absolutePath: string;
    content?: string;
  };

  // Tool: Replace File Content (Diffs)
  replaceFileContent?: {
    targetFile: string;
    replacementContent: string;
    diff?: string;
  };

  // Tool: Web Search
  searchWeb?: {
    query: string;
    results?: Array<{ title: string; url: string; snippet: string }>;
  };

  // Tool Confirmation Request
  requestedInteraction?: {
    type: "USER_INTERACTION_TYPE_CONFIRMATION";
    permission?: {
      toolName: string;
      command?: string;
      scope?: string;
    };
  };
}
```

---

#### `POST /exa.language_server_pb.LanguageServerService/GetConversationHistory`
Fetches complete chronological step history for a conversation.

* **Transport**: gRPC-Web Binary Framed (`application/grpc-web+json`)
* **Request Schema**:
```typescript
interface GetConversationHistoryRequest {
  cascadeId: string;
}
```
* **Response Schema**:
```typescript
interface GetConversationHistoryResponse {
  steps: Step[];
}
```

---

<a name="api-tools"></a>
### 3.4 Tool & Process Control

#### `POST /exa.language_server_pb.LanguageServerService/HandleCascadeUserInteraction`
Grants or denies permission for a proposed tool execution.

* **Transport**: Connect-RPC JSON (`Content-Type: application/json`)
* **Request Schema**:
```typescript
interface HandleCascadeUserInteractionRequest {
  cascadeId: string;
  stepIndex: number;
  trajectoryId: string;
  allow: boolean;                           // true to approve, false to deny
  permissionScope?: "PERMISSION_SCOPE_ONCE" | "PERMISSION_SCOPE_SESSION";
  userDenyInstruction?: string;             // Optional reason sent to agent when denied
}
```
* **Sample Request (Approve Once)**:
```json
{
  "cascadeId": "349cfddf-0f56-4e3f-9e8e-7460a58ab92f",
  "stepIndex": 5,
  "trajectoryId": "traj-1234",
  "allow": true,
  "permissionScope": "PERMISSION_SCOPE_ONCE"
}
```

---

#### `POST /exa.language_server_pb.LanguageServerService/CancelCascadeSteps`
Cancels specific queued step indices before they execute.

* **Transport**: Connect-RPC JSON (`Content-Type: application/json`)
* **Request Schema**:
```typescript
interface CancelCascadeStepsRequest {
  cascadeId: string;
  stepIndices: number[];
}
```

---

<a name="api-system"></a>
### 3.5 System, Models & Quotas

#### `POST /exa.language_server_pb.LanguageServerService/GetModelStatuses`
Lists all supported models, tier restrictions, and capabilities.

* **Transport**: gRPC-Web Binary Framed (`application/grpc-web+json`)
* **Request Schema**: `{}`
* **Response Schema**:
```typescript
interface GetModelStatusesResponse {
  modelStatuses?: Array<{
    model: string;                          // Internal enum, e.g. "MODEL_PLACEHOLDER_M319"
    displayName: string;                    // e.g. "Claude 3.7 Sonnet (Thinking)"
    description?: string;
    tier?: string;                          // "TIER_PRO" | "TIER_FREE"
    supportsVision?: boolean;
    supportsThinking?: boolean;
    disabled?: boolean;
  }>;
}
```

---

#### `POST /exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`
Fetches user usage metrics, quotas, and tier reset timestamps.

* **Transport**: Connect-RPC JSON or gRPC-Web Framed
* **Request Schema**: `{}`
* **Response Schema**:
```typescript
interface UserQuotaSummaryResponse {
  quotaSummary?: {
    userTier?: string;                      // e.g. "TIER_PAID"
    remainingRequests?: number;
    maxRequests?: number;
    resetTimestampMs?: string;
  };
}
```

---

#### `POST /exa.language_server_pb.LanguageServerService/ListProjects`
Returns registered workspace folders recognized by the daemon.

* **Transport**: gRPC-Web Binary Framed (`application/grpc-web+json`)
* **Request Schema**: `{}`
* **Response Schema**:
```typescript
interface ListProjectsResponse {
  projects?: Array<{
    projectId: string;
    folderUri: string;                      // e.g. "file:///home/cat/agy_cli_hub"
    name?: string;
  }>;
}
```

---

#### `POST /exa.language_server_pb.LanguageServerService/SetUserSettings`
Persists global execution policies and sandboxing modes.

* **Transport**: Connect-RPC JSON (`Content-Type: application/json`)
* **Request Schema**:
```typescript
interface SetUserSettingsRequest {
  userSettings: {
    autoExecutionPolicy?: "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER" | "CASCADE_COMMANDS_AUTO_EXECUTION_REVIEW_DEFAULT";
    enableTerminalSandbox?: boolean;
  };
}
```

---

#### `POST /exa.language_server_pb.LanguageServerService/GetSlashCommands`
Retrieves registered system slash commands.

* **Transport**: gRPC-Web Binary Framed (`application/grpc-web+json`)
* **Request Schema**:
```typescript
interface GetSlashCommandsRequest {
  model?: string;
}
```
* **Response Schema**:
```typescript
interface GetSlashCommandsResponse {
  commands?: Array<{
    command: string;                        // e.g. "/goal", "/schedule"
    description: string;
  }>;
}
```

---

#### `POST /exa.language_server_pb.LanguageServerService/GetTranscription`
Speech-to-text audio transcription service.

* **Transport**: Connect-RPC JSON (`Content-Type: application/json`)
* **Request Schema**:
```typescript
interface GetTranscriptionRequest {
  audioBase64: string;                      // Base64 encoded audio (wav/webm/mp3)
  prompt?: string;
}
```
* **Response Schema**:
```typescript
interface GetTranscriptionResponse {
  text: string;                             // Transcribed prompt text
}
```

---

## 4. Error Handling & gRPC Status Codes

When an RPC fails, check both the HTTP status and gRPC trailer headers:

| Status Code | Name | Meaning & Resolution |
| :--- | :--- | :--- |
| `0` | `OK` | Call succeeded. |
| `3` | `INVALID_ARGUMENT` | Payload schema invalid (check field names and data types). |
| `7` | `PERMISSION_DENIED` | Invalid CSRF token. Re-fetch via `GET /` and retry with `x-codeium-csrf-token`. |
| `14` | `UNAVAILABLE` | Daemon (`agy`) is down or restarting. Verify process on port `8090`. |
| `16` | `UNAUTHENTICATED` | User is not logged in. Redirect to `/Login` flow. |
