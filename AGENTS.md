# AGENTS.md: Repository Architecture & Engineering Rules

## 1. Directory Structure & Project Roles

This workspace is structured into dedicated directories with distinct responsibilities:

* **`antiGem/` (ACTIVE PROJECT)**:
  - The primary Android codebase currently being rebuilt from scratch step-by-step.
  - Built with Jetpack Compose, Kotlin Coroutines/Flow, OkHttp (gRPC-Web & SSE), and KotlinX Serialization.
  - Must follow strict type-safety, clean architecture, and zero-fuzzy API contracts.

* **`antiGem_old/` (REFERENCE CODEBASE)**:
  - The preserved archive of the previous application implementation.
  - Used exclusively as a reference for UI styling, themes, animations, Termux native integration, LaTeX rendering, and component behaviors.
  - Do not edit `antiGem_old/`. Migrate and refactor features cleanly into `antiGem/`.

* **`api_docs/` (OFFICIAL API SPECIFICATIONS)**:
  - Contains complete, verified specification files for all **55 RPC & streaming endpoints** of the AGY Hub language server and Jetbox state engine.
  - Each `.md` file defines the service name, transport framing, concrete Kotlin `@Serializable` DTOs, wire JSON payloads, and client lifecycle handling rules.
  - Refer to [`api_docs/README.md`](file:///home/cat/agy_cli_hub/api_docs/README.md) for the master index.

* **`docs/` (TRAFFIC LOGS & BACKEND SPECS)**:
  - Contains recorded HTTP/gRPC-Web wire traffic logs (`docs/traffic_logs/apis/`) and protocol reverse-engineering notes.

---

## 2. Core Protocol & Type Safety Enforcement

### A. Zero-Fuzzy Protocol Handling
1. **No Substring/Fuzzy Matching**:
   - Never use `.contains("RUN")`, `.contains("DONE")`, `.contains("WAIT")`, `.contains("MCP")`, or similar substring heuristics on protocol status or type fields.
   - Wire strings from AGY Hub (`step.status`, `step.type`, `cascade.status`, `toolConfig`, `permissionGrants`) must map directly to typed Kotlin enums or exact equality comparisons (`==`).

2. **Deterministic Step Lifecycle**:
   - A step's lifecycle state belongs strictly to that step (`step.status` and `step.requestedInteraction`).
   - The cascade-level status (`cascadeStatus`) must never be used to infer or flip an individual tool's status.

3. **Execution State Rules**:
   - A tool step is `RUNNING` until `step.status` explicitly transitions to `CORTEX_STEP_STATUS_DONE` or `CORTEX_STEP_STATUS_ERROR`.
   - Never infer execution completion based on blank output or secondary event timing.

---

## 3. AGY Transport & Framing Contracts

1. **LanguageServerService (`/exa.language_server_pb.LanguageServerService/*`)**:
   - **Transport**: gRPC-Web binary framing.
   - **Header Frame**: 5-byte prefix (`0x00` flag + 4-byte big-endian payload length).
   - **Headers**:
     - `Content-Type: application/grpc-web+json`
     - `x-grpc-web: 1`
     - `x-codeium-csrf-token: <UUID>`

2. **JetboxService (`/jetbox.JetboxService/*`)**:
   - **Transport**: Connect-RPC JSON over HTTP POST.
   - **Headers**:
     - `Content-Type: application/json`
     - `Connect-Protocol-Version: 1`
     - `x-conversation-id: <UUID>`
     - `x-codeium-csrf-token: <UUID>`

3. **SSE Streaming (`StreamAgentStateUpdates`, `StreamSummaries`)**:
   - **Transport**: Server-Sent Events / chunked gRPC-Web data stream.
   - **Framing**: Line-delimited JSON or gRPC-Web framed messages.

---

## 4. Rebuilding Workflow (`antiGem/`)

When building new features in `antiGem/`:
1. **Step 1: Models & DTOs**: Create Kotlin `@Serializable` data classes matching the corresponding `api_docs/<API_NAME>.md` specification.
2. **Step 2: Network Client**: Implement the typed gRPC-Web / Connect-RPC service calls with proper framing and header injection.
3. **Step 3: Repository & State Flow**: Expose typed Kotlin `StateFlow` streams for UI consumption.
4. **Step 4: UI & Compose Layer**: Implement or port the UI components referencing `antiGem_old/`, adhering to Gemini dark/light themes.
