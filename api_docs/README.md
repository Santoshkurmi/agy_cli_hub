# Antigravity Hub (AGY) Connect-RPC & gRPC-Web API Directory

This directory contains the complete, type-safe specifications for all **55 RPC endpoints and SSE streaming APIs** powering the Antigravity Hub language server, chat orchestration engine, and Jetbox state synchronization backend.

Every specification document provides:
1. Exact service name, method name, URL endpoint, and HTTP method.
2. Transport framing (gRPC-Web binary 5-byte length-prefixed JSON vs Connect-RPC protocol vs SSE streaming).
3. Concrete Kotlin `@Serializable` request/response DTOs with default parameters and explicit nullability.
4. Client handling rules, state machines, and lifecycle triggers.
5. Exact wire JSON examples extracted directly from verified traffic logs.

---

## API Catalog by Group

### Group 1: Core Chat & Execution Pipeline (14 APIs)
| API Name | Transport | Purpose | Documentation Link |
|---|---|---|---|
| `StreamAgentStateUpdates` | SSE / gRPC-Web Stream | Real-time agent thought streaming, tool execution, and trajectory steps | [StreamAgentStateUpdates.md](file:///home/cat/agy_cli_hub/api_docs/StreamAgentStateUpdates.md) |
| `SendUserCascadeMessage` | gRPC-Web POST | Dispatches user prompt, context attachments, and model overrides | [SendUserCascadeMessage.md](file:///home/cat/agy_cli_hub/api_docs/SendUserCascadeMessage.md) |
| `StartCascade` | gRPC-Web POST | Initializes new conversation trajectory session | [StartCascade.md](file:///home/cat/agy_cli_hub/api_docs/StartCascade.md) |
| `GetCascadeTrajectorySteps` | gRPC-Web POST | Fetches chronological step history and metadata for a conversation | [GetCascadeTrajectorySteps.md](file:///home/cat/agy_cli_hub/api_docs/GetCascadeTrajectorySteps.md) |
| `GetAllCascadeTrajectories` | gRPC-Web POST | Retrieves all saved conversation trajectory headers and summaries | [GetAllCascadeTrajectories.md](file:///home/cat/agy_cli_hub/api_docs/GetAllCascadeTrajectories.md) |
| `HandleCascadeUserInteraction` | gRPC-Web POST | Resolves interactive user confirmation prompts (allow/deny tool calls) | [HandleCascadeUserInteraction.md](file:///home/cat/agy_cli_hub/api_docs/HandleCascadeUserInteraction.md) |
| `CancelCascadeInvocation` | gRPC-Web POST | Interrupts and halts an active agent execution step | [CancelCascadeInvocation.md](file:///home/cat/agy_cli_hub/api_docs/CancelCascadeInvocation.md) |
| `CancelCascadeSteps` | gRPC-Web POST | Cancels specific running steps within a conversation | [CancelCascadeSteps.md](file:///home/cat/agy_cli_hub/api_docs/CancelCascadeSteps.md) |
| `ResolveOutstandingSteps` | gRPC-Web POST | Cleans up and marks hanging or unfulfilled steps as resolved | [ResolveOutstandingSteps.md](file:///home/cat/agy_cli_hub/api_docs/ResolveOutstandingSteps.md) |
| `RevertToCascadeStep` | gRPC-Web POST | Rewinds a conversation state back to a previous step index | [RevertToCascadeStep.md](file:///home/cat/agy_cli_hub/api_docs/RevertToCascadeStep.md) |
| `ForkConversation` | gRPC-Web POST | Clones conversation branch from a historical checkpoint | [ForkConversation.md](file:///home/cat/agy_cli_hub/api_docs/ForkConversation.md) |
| `DeleteCascadeTrajectory` | gRPC-Web POST | Deletes conversation session and associated history from disk | [DeleteCascadeTrajectory.md](file:///home/cat/agy_cli_hub/api_docs/DeleteCascadeTrajectory.md) |
| `RequestAgentStatePageUpdate` | gRPC-Web POST | Requests manual sync/snapshot update of agent UI state | [RequestAgentStatePageUpdate.md](file:///home/cat/agy_cli_hub/api_docs/RequestAgentStatePageUpdate.md) |
| `GetTurnDiff` | gRPC-Web POST | Calculates unified git/file diff produced during a specific turn | [GetTurnDiff.md](file:///home/cat/agy_cli_hub/api_docs/GetTurnDiff.md) |

---

### Group 2: Models, Quotas & Audio (3 APIs)
| API Name | Transport | Purpose | Documentation Link |
|---|---|---|---|
| `GetAvailableModels` | gRPC-Web POST | Queries available Gemini models, tier access, and thinking limits | [GetAvailableModels.md](file:///home/cat/agy_cli_hub/api_docs/GetAvailableModels.md) |
| `RetrieveUserQuotaSummary` | gRPC-Web POST | Fetches daily/monthly quota limits, remaining credits, and reset times | [RetrieveUserQuotaSummary.md](file:///home/cat/agy_cli_hub/api_docs/RetrieveUserQuotaSummary.md) |
| `StreamAudioTranscription` | gRPC-Web Stream | Streams real-time speech-to-text audio chunks to Gemini STT | [StreamAudioTranscription.md](file:///home/cat/agy_cli_hub/api_docs/StreamAudioTranscription.md) |

---

### Group 3: Jetbox State & Real-Time Sync (4 APIs)
| API Name | Transport | Purpose | Documentation Link |
|---|---|---|---|
| `StreamSummaries` | SSE / gRPC-Web Stream | Streams real-time conversation title/summary updates | [StreamSummaries.md](file:///home/cat/agy_cli_hub/api_docs/StreamSummaries.md) |
| `JetboxWriteState` | Connect-RPC POST | Synchronizes Jetbox reactive client state to server storage | [JetboxWriteState.md](file:///home/cat/agy_cli_hub/api_docs/JetboxWriteState.md) |
| `JetboxWriteSummary` | Connect-RPC POST | Updates conversation metadata and title summary in Jetbox store | [JetboxWriteSummary.md](file:///home/cat/agy_cli_hub/api_docs/JetboxWriteSummary.md) |
| `UpdateConversationAnnotations` | gRPC-Web POST | Updates conversation tags, bookmarks, and user annotations | [UpdateConversationAnnotations.md](file:///home/cat/agy_cli_hub/api_docs/UpdateConversationAnnotations.md) |

---

### Group 4: Authentication & User Profile (7 APIs)
| API Name | Transport | Purpose | Documentation Link |
|---|---|---|---|
| `GetAuthStatus` | gRPC-Web POST | Checks Google OAuth login status, user email, and token validity | [GetAuthStatus.md](file:///home/cat/agy_cli_hub/api_docs/GetAuthStatus.md) |
| `HasAuthToken` | gRPC-Web POST | Fast boolean check if authentication token is present | [HasAuthToken.md](file:///home/cat/agy_cli_hub/api_docs/HasAuthToken.md) |
| `GetLocalUserInfo` | gRPC-Web POST | Reads local user cache, username, and active profile | [GetLocalUserInfo.md](file:///home/cat/agy_cli_hub/api_docs/GetLocalUserInfo.md) |
| `FetchUserInfo` | gRPC-Web POST | Fetches remote Google account profile and organization info | [FetchUserInfo.md](file:///home/cat/agy_cli_hub/api_docs/FetchUserInfo.md) |
| `SetUserInfo` | gRPC-Web POST | Updates active user profile and preferences | [SetUserInfo.md](file:///home/cat/agy_cli_hub/api_docs/SetUserInfo.md) |
| `GetUserStatus` | gRPC-Web POST | Queries account health, subscription flags, and rate-limit tier | [GetUserStatus.md](file:///home/cat/agy_cli_hub/api_docs/GetUserStatus.md) |
| `FetchAdminControls` | gRPC-Web POST | Fetches enterprise admin policies and managed restrictions | [FetchAdminControls.md](file:///home/cat/agy_cli_hub/api_docs/FetchAdminControls.md) |

---

### Group 5: MCP Management (4 APIs)
| API Name | Transport | Purpose | Documentation Link |
|---|---|---|---|
| `GetMcpServerStates` | gRPC-Web POST | Lists installed MCP servers, status, tool definitions, and schemas | [GetMcpServerStates.md](file:///home/cat/agy_cli_hub/api_docs/GetMcpServerStates.md) |
| `RefreshMcpServers` | gRPC-Web POST | Triggers discovery and reload of all configured MCP servers | [RefreshMcpServers.md](file:///home/cat/agy_cli_hub/api_docs/RefreshMcpServers.md) |
| `ToggleMcpServer` | gRPC-Web POST | Enables or disables an MCP server instance | [ToggleMcpServer.md](file:///home/cat/agy_cli_hub/api_docs/ToggleMcpServer.md) |
| `ListMcpPrompts` | gRPC-Web POST | Lists available prompt templates exposed by active MCP servers | [ListMcpPrompts.md](file:///home/cat/agy_cli_hub/api_docs/ListMcpPrompts.md) |

---

### Group 6: Customizations (Skills, Rules, Plugins & Slash Commands) (11 APIs)
| API Name | Transport | Purpose | Documentation Link |
|---|---|---|---|
| `GetSlashCommands` | gRPC-Web POST | Lists available slash commands (`/goal`, `/schedule`, `/learn`, etc.) | [GetSlashCommands.md](file:///home/cat/agy_cli_hub/api_docs/GetSlashCommands.md) |
| `GetAllSkills` | gRPC-Web POST | Enumerates all loaded workspace and global skill definitions | [GetAllSkills.md](file:///home/cat/agy_cli_hub/api_docs/GetAllSkills.md) |
| `GetAllRules` | gRPC-Web POST | Enumerates active project and global behavioral rule files | [GetAllRules.md](file:///home/cat/agy_cli_hub/api_docs/GetAllRules.md) |
| `GetAllPlugins` | gRPC-Web POST | Lists installed plugin bundles and exposed extensions | [GetAllPlugins.md](file:///home/cat/agy_cli_hub/api_docs/GetAllPlugins.md) |
| `GetAllWorkflows` | gRPC-Web POST | Lists predefined multi-step automation workflow scripts | [GetAllWorkflows.md](file:///home/cat/agy_cli_hub/api_docs/GetAllWorkflows.md) |
| `GetAgentScripts` | gRPC-Web POST | Queries subagent and sidecar automation scripts | [GetAgentScripts.md](file:///home/cat/agy_cli_hub/api_docs/GetAgentScripts.md) |
| `GetAvailableCascadePlugins` | gRPC-Web POST | Discovers compatible plugins for cascade agents | [GetAvailableCascadePlugins.md](file:///home/cat/agy_cli_hub/api_docs/GetAvailableCascadePlugins.md) |
| `GetBuildWithGooglePlugins` | gRPC-Web POST | Queries official Google Antigravity marketplace plugin catalog | [GetBuildWithGooglePlugins.md](file:///home/cat/agy_cli_hub/api_docs/GetBuildWithGooglePlugins.md) |
| `DownloadBuildWithGooglePlugin` | gRPC-Web POST | Downloads and installs plugin bundle from marketplace | [DownloadBuildWithGooglePlugin.md](file:///home/cat/agy_cli_hub/api_docs/DownloadBuildWithGooglePlugin.md) |
| `ListCustomizationPathsByFile` | gRPC-Web POST | Resolves customization root paths (`.agents`, `config/skills`) | [ListCustomizationPathsByFile.md](file:///home/cat/agy_cli_hub/api_docs/ListCustomizationPathsByFile.md) |
| `GetCascadeNuxes` | gRPC-Web POST | Fetches new user onboarding guides and tips (NUX) | [GetCascadeNuxes.md](file:///home/cat/agy_cli_hub/api_docs/GetCascadeNuxes.md) |

---

### Group 7: Projects, File System & Telemetry (12 APIs)
| API Name | Transport | Purpose | Documentation Link |
|---|---|---|---|
| `ReadProjects` | gRPC-Web POST | Batch fetches project profiles, root folders, and permission grants | [ReadProjects.md](file:///home/cat/agy_cli_hub/api_docs/ReadProjects.md) |
| `ReadProject` | gRPC-Web POST | Fetches single project profile, policies, and permissions | [ReadProject.md](file:///home/cat/agy_cli_hub/api_docs/ReadProject.md) |
| `UpdateProject` | gRPC-Web POST | Updates project execution policies and permission grants | [UpdateProject.md](file:///home/cat/agy_cli_hub/api_docs/UpdateProject.md) |
| `ReadFile` | gRPC-Web POST | Reads Base64-encoded local file content and language info | [ReadFile.md](file:///home/cat/agy_cli_hub/api_docs/ReadFile.md) |
| `WriteFile` | gRPC-Web POST | Writes Base64-encoded content to local file URI | [WriteFile.md](file:///home/cat/agy_cli_hub/api_docs/WriteFile.md) |
| `StatUri` | gRPC-Web POST | Inspects file/directory metadata, modTime, type, and size | [StatUri.md](file:///home/cat/agy_cli_hub/api_docs/StatUri.md) |
| `ResolveFolder` | gRPC-Web POST | Resolves directory type (Git repo, normal folder, or non-existent) | [ResolveFolder.md](file:///home/cat/agy_cli_hub/api_docs/ResolveFolder.md) |
| `RecordAnalyticsEvent` | gRPC-Web POST | Records client UI analytics and latency events | [RecordAnalyticsEvent.md](file:///home/cat/agy_cli_hub/api_docs/RecordAnalyticsEvent.md) |
| `GetServerConfiguration` | gRPC-Web POST | Queries language server environment settings and app data paths | [GetServerConfiguration.md](file:///home/cat/agy_cli_hub/api_docs/GetServerConfiguration.md) |
| `GetMendelFlags` | gRPC-Web POST | Fetches server experiment flags and rollout configuration | [GetMendelFlags.md](file:///home/cat/agy_cli_hub/api_docs/GetMendelFlags.md) |
| `GetTokenBase` | gRPC-Web POST | Calculates prompt token footprint for MCP tools and customizations | [GetTokenBase.md](file:///home/cat/agy_cli_hub/api_docs/GetTokenBase.md) |
| `GetLoadCodeAssist` | gRPC-Web POST | Fetches Gemini Code Assist subscription tiers and privacy notices | [GetLoadCodeAssist.md](file:///home/cat/agy_cli_hub/api_docs/GetLoadCodeAssist.md) |

---

## Standard Request Headers

All gRPC-Web requests sent to `http://127.0.0.1:8091/exa.language_server_pb.LanguageServerService/*` must include:
```http
Content-Type: application/grpc-web+json
x-grpc-web: 1
x-codeium-csrf-token: <CSRF_TOKEN_UUID>
```

All Connect-RPC requests sent to `/jetbox.JetboxService/*` must include:
```http
Content-Type: application/json
Connect-Protocol-Version: 1
x-conversation-id: <CONVERSATION_ID_UUID>
x-codeium-csrf-token: <CSRF_TOKEN_UUID>
```
