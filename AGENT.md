# AGENT.md: Project Overview & Developer Guide

## 1. What We Are Building
This repository hosts the **Antigravity (AGY) Client & Hub Ecosystem**—a next-generation agentic developer platform powered by Google DeepMind's Antigravity / Gemini code intelligence. It combines a desktop/web command hub with a complete mobile agentic IDE.

The ecosystem contains two core pillars:
1. **AGY CLI Hub & Web UI (`web_ui/`)**:
   - Connects directly to the local Antigravity Language Server Daemon (`agy` running on `127.0.0.1:8090`).
   - A reactive, modern web dashboard (React + Vite) for full conversation management, streaming thought/tool execution, quota telemetry, process inspection, and Google OAuth lifecycle.
2. **antiGem (`antiGem/`)**:
   - A standalone Android mobile application (Kotlin + Jetpack Compose) and companion daemon suite.
   - Brings full-fledged agentic coding to mobile devices: code editor, project file tree, Git source control, embedded Termux terminal, on-device OS automation via Android Accessibility Service, and direct Cloud Code / Bridge connectivity.

---

## 2. Directory Structure

```
agy_cli_hub/
├── docs/
│   └── AGY_HUB_RPC_API_DOCUMENTATION.md  # Definitive RPC specification for port 8090
├── web_ui/                                # Vite + React Web Application
│   ├── src/
│   │   ├── agyClient.js                   # Connect-RPC / gRPC-Web client library
│   │   ├── App.jsx                        # Main dashboard, sidebar, chat, and telemetry
│   │   └── index.css                      # Modern dark theme styles
│   └── package.json
├── antiGem/                               # Android Mobile Client + Companion Daemons
│   ├── app/                               # Native Android Jetpack Compose app
│   │   └── src/main/java/com/example/gemini/
│   │       ├── ui/chat/                   # Mobile chat UI with thinking & tool cards
│   │       ├── ui/ide/                    # Mobile IDE (Editor, Git, Tree, Diff viewer)
│   │       ├── data/automation/           # Android Accessibility Automation Service
│   │       ├── data/daemon/               # Local IDE / Termux daemon API client
│   │       └── data/remote/               # Cloud Code & Bridge RPC services
│   ├── server/                            # Go REST/WS daemon (projects, files, Git)
│   ├── termux-daemon/                     # Lightweight Go server running inside Termux
│   ├── server.js                          # Node.js backend bridge for CLI & artifacts
│   └── build.gradle.kts
└── AGENT.md                               # This guide
```

---

## 3. Communication Architecture

### AGY Daemon Hub (Port `8090`)
- **Service**: `exa.language_server_pb.LanguageServerService`
- **Protocol**: Connect-RPC (JSON) for unary calls; binary 5-byte framed gRPC-Web for streaming.
- **CSRF Token**: Fetched via `GET http://127.0.0.1:8090/` from the HTML body, sent in header:
  `x-codeium-csrf-token: <token>`
- **Complete Endpoint Specs**: See [`docs/AGY_HUB_RPC_API_DOCUMENTATION.md`](file:///home/cat/agy_cli_hub/docs/AGY_HUB_RPC_API_DOCUMENTATION.md).

### antiGem Bridge & Daemon (Port `8080` or Termux)
- **Go / Node Daemons**: Expose REST endpoints under `/api/*` for:
  - Project management (`/api/projects`, `/api/projects/create`)
  - File tree & CRUD (`/api/tree`, `/api/file/read`, `/api/file/save`, `/api/file/patch`)
  - Git integration (`/api/git/status`, `/api/git/stage`, `/api/git/commit`, `/api/git/diff`)
  - WebSocket hub for live event broadcast (`/ws`)

---

## 4. Key Workflows & How to Implement Stuff

### A. Authentication (Google OAuth)
- **Status Check**: Call `GetCommandQuota` or `GetAuthStatus`. If user is logged in, email and quota buckets are returned.
- **Login**: Call `POST /exa.language_server_pb.LanguageServerService/Login` with payload `{}`. The daemon starts a local listener, computes PKCE credentials, and opens the system browser to Google's consent screen. Once consented, the daemon captures the callback.
- **Logout**: Call `POST /exa.language_server_pb.LanguageServerService/AuthLogout` with `{}`.

### B. Chat & Streaming (Daemon RPC)
- **List Conversations**: Call `GetChatHistory`. Returns conversation IDs, titles, timestamps, and active status.
- **Load History**: Call `LoadConversationHistory` with `{ conversationId }` to retrieve all historical steps, thought chains, and tool invocations.
- **Send Message / Stream Response**:
  - Endpoint: `GetChatMessage`
  - Transport: gRPC-Web stream with 5-byte framing (`[0x00, byte0, byte1, byte2, byte3]`).
  - Chunks include `streamDelta` with `thought` (reasoning block) and `text` (markdown output).
  - Tool invocations arrive under `toolCalls` (e.g. `run_command`, `write_to_file`, `ask_question`).
- **Cancel Execution**: Call `CancelChatMessage` with `{ conversationId }`.
- **Fork Conversation**: Call `ForkConversation` with `{ conversationId, stepIndex }`.

### C. Quota & Model Monitoring
- **Models**: Call `GetAvailableModels`. Returns available LLM model descriptors and tags.
- **Quota**: Call `GetCommandQuota`. Returns `userEmail`, `userTier`, `perModelQuotaList` (percentage remaining, reset periods).

### D. antiGem Mobile OS Automation
- Located in `antiGem/app/src/main/java/com/example/gemini/data/automation/`.
- Uses Android's `AccessibilityService` (`AndroidAutomationService`):
  - Traverses `rootInActiveWindow` view hierarchy.
  - Can click/tap nodes by ID, text, or coordinates (`dispatchGesture`).
  - Can type text into focused editable fields.
  - Can take screenshots and report foreground package names.

---

## 5. Development & Testing Commands

- **Web Dashboard**:
  ```bash
  cd web_ui
  npm install
  npm run dev
  ```
  Runs Vite dev server on `http://localhost:5173` (or configured port). Ensure `agy` daemon is running on port `8090`.

- **antiGem Companion Go Server**:
  ```bash
  cd antiGem/server
  go run main.go
  ```
  Runs REST + WebSocket server on port `8080`.

- **antiGem Companion Node Server**:
  ```bash
  cd antiGem
  node server.js
  ```

- **antiGem Android App Build**:
  ```bash
  cd antiGem
  ./gradlew assembleDebug
  ```

---

## 6. Golden Rules for AI Agents Modifying This Repo

1. **Always Check Port & Headers**: All AGY daemon calls must hit `http://127.0.0.1:8090` and carry `x-codeium-csrf-token`.
2. **Never Break Streaming Codec**: In `web_ui/src/agyClient.js`, streaming calls require 5-byte big-endian framing; do not replace them with plain JSON fetches.
3. **Preserve UI Richness**: Follow premium dark UI styling in `web_ui/src/index.css` and Material3 Compose theming in `antiGem/app/`. Avoid plain or unstyled components.
4. **Refer to Documentation**: Consult `docs/AGY_HUB_RPC_API_DOCUMENTATION.md` whenever adding or modifying RPC calls.
