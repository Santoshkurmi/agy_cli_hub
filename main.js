import { spawn, spawnSync } from 'child_process';
import os from 'os';
import crypto from 'crypto';
import fs from 'fs';
import readline from 'readline';

const PORT = 8090;
const AGY_BIN = `${os.homedir()}/.gemini/bin/agy`;
const WORKSPACE_DIR = process.cwd();

// Load Model Enum Map for accurate Proto ID translation
let MODEL_ENUM_MAP = {};
try {
  const mapFile = `${WORKSPACE_DIR}/models_map.json`;
  if (fs.existsSync(mapFile)) {
    MODEL_ENUM_MAP = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
  }
} catch {}

// Helper: Interactive fzf selector
export function runFzf(items, prompt = 'Search > ') {
  try {
    const input = items.join('\n');
    const result = spawnSync('fzf', [
      '--prompt', prompt,
      '--height', '50%',
      '--reverse',
      '--border',
      '--ansi',
      '--no-sort',
      '--inline-info'
    ], {
      input,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'inherit']
    });
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim();
    }
  } catch (err) {
    console.error('fzf execution error:', err);
  }
  return null;
}

export function formatRelativeTime(date) {
  const now = new Date();
  const diffSec = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays}d ago`;
}

// 1. Spawn Daemon or reuse existing instance
export async function startAgyDaemon() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`);
    if (res.status < 500) return null;
  } catch {}

  console.log('\x1b[90m[agy daemon]\x1b[0m Spawning background service...');
  const proc = spawn(AGY_BIN, [
    '--hub',
    `--hub-port=${PORT}`,
    '--app_data_dir=antigravity',
    `--add-dir=${WORKSPACE_DIR}`
  ], {
    env: {
      ...process.env,
      HOME: os.homedir(),
      USERPROFILE: os.homedir(),
      AGY_ENABLE_HUB: '1',
      ANTIGRAVITY_VSCODE_HOST: '1',
      ANTIGRAVITY_AUTH_SUCCESS_APP: 'vscode'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return proc;
}

// 2. Poll until daemon is ready
export async function waitForDaemon(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Timed out waiting for agy Hub');
}

// 3. gRPC-Web Frame Encoder
export function encodeGrpcWebFrame(jsonObj) {
  const jsonBuf = Buffer.from(JSON.stringify(jsonObj), 'utf-8');
  const frame = Buffer.alloc(5 + jsonBuf.length);
  frame[0] = 0x00; // Data frame
  frame.writeUInt32BE(jsonBuf.length, 1);
  jsonBuf.copy(frame, 5);
  return frame;
}

// 4. gRPC-Web Stream Decoder
export async function* parseGrpcWebStream(responseBody) {
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
        try {
          yield JSON.parse(payload.toString('utf-8'));
        } catch {}
      }
    }
  }
}

// 5. Antigravity Direct Client
export class AntigravityClient {
  constructor(port = PORT) {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.csrfToken = '';
    this.availableModels = [];
  }

  async initCsrfToken() {
    const res = await fetch(`${this.baseUrl}/`);
    const html = await res.text();
    const match = html.match(/"csrfToken":\s*"([^"]+)"/);
    if (!match) throw new Error('Could not find csrfToken');
    this.csrfToken = match[1];
    return this.csrfToken;
  }

  getHeaders() {
    return {
      'Content-Type': 'application/grpc-web+json',
      'X-Grpc-Web': '1',
      'x-codeium-csrf-token': this.csrfToken
    };
  }

  // Fetch all live models & quotas dynamically from language server
  async fetchAvailableModels() {
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/GetAvailableModels`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: encodeGrpcWebFrame({ force_refresh: true })
    });
    if (!res.ok) throw new Error(`GetAvailableModels failed: ${res.status}`);

    const list = [];
    for await (const json of parseGrpcWebStream(res.body)) {
      const models = json.response?.models || {};
      for (const [key, details] of Object.entries(models)) {
        if (!details.disabled) {
          const rawEnum = details.model ? details.model.replace(/^MODEL_/, '') : '';
          const intId = MODEL_ENUM_MAP[rawEnum] || 1301;

          list.push({
            key,
            name: details.displayName || key,
            modelEnum: details.model,
            intId: intId,
            supportsThinking: details.supportsThinking || false,
            quotaFraction: details.quotaInfo?.remainingFraction ?? 1,
            resetTime: details.quotaInfo?.resetTime ? new Date(details.quotaInfo.resetTime) : null
          });
        }
      }
    }
    this.availableModels = list;
    return list;
  }

  // Create new session with full tool calling and agentic capabilities
  async createConversation(modelIntId = 1301) {
    const cascadeId = crypto.randomUUID();
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/StartCascade`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: encodeGrpcWebFrame({
        cascade_id: cascadeId,
        source: 1, // CASCADE_CLIENT
        requested_model: modelIntId,
        workspace_uris: [`file://${WORKSPACE_DIR}`],
        custom_agent_spec: {
          config: {
            case: 'builtinAgent',
            value: {
              agentType: {
                case: 'defaultAgent',
                value: {
                  isGoogle: true,
                  isInteractive: true
                }
              }
            }
          }
        }
      })
    });
    if (!res.ok) throw new Error(`StartCascade failed: ${res.status}`);
    return cascadeId;
  }

  // List all conversations (filters out empty ghost sessions)
  async listConversations() {
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: encodeGrpcWebFrame({ exclude_subtrajectories: true })
    });
    if (!res.ok) throw new Error(`GetAllCascadeTrajectories failed: ${res.status}`);

    const conversations = [];
    for await (const json of parseGrpcWebStream(res.body)) {
      const summaries = json.trajectorySummaries || {};
      for (const [id, summary] of Object.entries(summaries)) {
        if (summary.lastModifiedTime && (summary.summary || (summary.stepCount && summary.stepCount > 0))) {
          conversations.push({
            id,
            title: summary.summary || 'Untitled Conversation',
            lastModified: new Date(summary.lastModifiedTime),
            stepCount: summary.stepCount || 0
          });
        }
      }
    }
    return conversations.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }

  // Get raw step count for accurate turn offsetting
  async getRawStepCount(cascadeId) {
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: encodeGrpcWebFrame({
        cascade_id: cascadeId,
        trajectory_verbosity: 2
      })
    });
    if (!res.ok) return 0;

    for await (const json of parseGrpcWebStream(res.body)) {
      return (json.steps || []).length;
    }
    return 0;
  }

  // Fetch full history of a conversation
  async getConversationHistory(cascadeId) {
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: encodeGrpcWebFrame({
        cascade_id: cascadeId,
        trajectory_verbosity: 2
      })
    });
    if (!res.ok) throw new Error(`GetCascadeTrajectorySteps failed: ${res.status}`);

    const history = [];
    for await (const json of parseGrpcWebStream(res.body)) {
      const steps = json.steps || [];
      for (const step of steps) {
        if (step.userInput) {
          const text = step.userInput.userResponse || step.userInput.items?.[0]?.text || '';
          if (text) history.push({ role: 'user', content: text });
        } else if (step.plannerResponse) {
          const content = step.plannerResponse.response || '';
          const thinking = step.plannerResponse.thinking || '';
          const toolCalls = step.plannerResponse.toolCalls || [];
          if (content || thinking || toolCalls.length > 0) {
            history.push({ role: 'assistant', content, thinking, toolCalls });
          }
        } else if (step.runCommand) {
          const cmd = step.runCommand.commandLine || step.runCommand.proposedCommandLine;
          const lastMsg = history[history.length - 1];
          if (lastMsg && lastMsg.role === 'tool' && lastMsg.toolType === 'command' && lastMsg.command === cmd) {
            if (step.runCommand.output || step.runCommand.combinedOutput?.full) {
              lastMsg.output = step.runCommand.combinedOutput?.full || step.runCommand.output;
            }
          } else {
            history.push({ role: 'tool', toolType: 'command', command: cmd, output: step.runCommand.output || step.runCommand.combinedOutput?.full });
          }
        } else if (step.codeAction) {
          history.push({ role: 'tool', toolType: 'code', uri: step.codeAction.uri });
        } else if (step.searchWeb) {
          history.push({ role: 'tool', toolType: 'search', query: step.searchWeb.query || 'Web Search' });
        } else if (step.generic) {
          history.push({ role: 'tool', toolType: 'generic', action: step.generic.toolAction || step.generic.toolSummary });
        } else if (step.errorMessage) {
          history.push({ role: 'error', message: step.errorMessage.error?.userErrorMessage || step.errorMessage.error?.shortError });
        }
      }
    }
    return history;
  }

  // Send a prompt with full tool calling & thinking enabled
  async sendMessage({ conversationId, text, modelKey, modelIntId }) {
    const payload = {
      cascade_id: conversationId,
      items: [{ text }],
      cascade_config: {
        chat_model_name: modelKey,
        planner_config: {
          model_name: modelKey,
          plan_model: modelIntId,
          requested_model: {
            choice: {
              case: 'model',
              value: modelIntId
            }
          },
          supports_latex_rendering: true,
          supports_thinking: true,
          thinking_budget: 8192,
          tool_config: {
            run_command: {
              auto_command_config: {
                auto_execution_policy: 1 // AUTO_EXECUTE / ALLOW
              }
            },
            permission_config: {
              auto_execution_policy: 1
            }
          }
        }
      }
    };

    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: encodeGrpcWebFrame(payload)
    });
    if (!res.ok) throw new Error(`SendUserCascadeMessage failed: ${res.status}`);
    return res;
  }

  // Stream live delta updates starting after raw step count
  async *streamUpdates(conversationId, startStepIndex = 0, abortSignal) {
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/StreamAgentStateUpdates`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: encodeGrpcWebFrame({
        conversation_id: conversationId,
        subscriber_id: `sub-${Date.now()}`,
        trajectory_verbosity: 2
      }),
      signal: abortSignal
    });

    const stepResponseOffsets = new Map();
    const stepThinkingOffsets = new Map();
    const seenGenericSteps = new Set();
    const seenSearchSteps = new Set();
    const seenCommandSteps = new Set();
    const seenCodeActionSteps = new Set();
    const seenToolCallSteps = new Set();
    let hasSeenRunningState = false;

    for await (const json of parseGrpcWebStream(res.body)) {
      const update = json.update;
      const status = update?.status || update?.executableStatus || update?.executorLoopStatus || '';

      if (status.includes('RUNNING')) {
        hasSeenRunningState = true;
      }

      const steps = update?.mainTrajectoryUpdate?.stepsUpdate?.steps || [];
      const indices = update?.mainTrajectoryUpdate?.stepsUpdate?.indices || [];

      for (let i = 0; i < steps.length; i++) {
        const stepIndex = indices[i] !== undefined ? indices[i] : i;
        
        // Skip steps belonging to prior turns
        if (stepIndex < startStepIndex) continue;

        const step = steps[i];

        // 1. Live Thinking Stream
        if (step.plannerResponse?.thinking) {
          const fullThinking = step.plannerResponse.thinking;
          const prevOffset = stepThinkingOffsets.get(stepIndex) || 0;
          if (fullThinking.length > prevOffset) {
            const delta = fullThinking.slice(prevOffset);
            stepThinkingOffsets.set(stepIndex, fullThinking.length);
            yield { type: 'thinking', delta, full: fullThinking };
          }
        }

        // 2. Live Content Stream
        if (step.plannerResponse?.response) {
          const fullResponse = step.plannerResponse.response;
          const prevOffset = stepResponseOffsets.get(stepIndex) || 0;
          if (fullResponse.length > prevOffset) {
            const delta = fullResponse.slice(prevOffset);
            stepResponseOffsets.set(stepIndex, fullResponse.length);
            yield { type: 'content', delta, full: fullResponse };
          }
        }

        // 3. Tool Calls from Planner
        if (step.plannerResponse?.toolCalls && step.plannerResponse.toolCalls.length > 0) {
          if (!seenToolCallSteps.has(stepIndex)) {
            seenToolCallSteps.add(stepIndex);
            yield { type: 'tool_calls', calls: step.plannerResponse.toolCalls };
          }
        }

        // 4. Web Search Execution
        if (step.searchWeb || step.type === 'CORTEX_STEP_TYPE_SEARCH_WEB') {
          if (!seenSearchSteps.has(stepIndex)) {
            seenSearchSteps.add(stepIndex);
            const query = step.searchWeb?.query || 'Searching the web';
            yield { type: 'search', query };
          }
        }

        // 5. Generic Tool Actions
        if (step.generic || step.type === 'CORTEX_STEP_TYPE_GENERIC') {
          const action = step.generic?.toolAction || step.generic?.toolSummary || 'Agent Tool Action';
          if (!seenGenericSteps.has(action)) {
            seenGenericSteps.add(action);
            yield { type: 'generic_action', action };
          }
        }

        // 6. Terminal Command Execution
        if (step.runCommand) {
          const cmd = step.runCommand.commandLine || step.runCommand.proposedCommandLine;
          const out = step.runCommand.combinedOutput?.full || step.runCommand.output || '';
          if (!seenCommandSteps.has(cmd)) {
            seenCommandSteps.add(cmd);
            yield { type: 'command', command: cmd, output: out };
          }
        }

        // 7. File Code Edits
        if (step.codeAction) {
          if (!seenCodeActionSteps.has(stepIndex)) {
            seenCodeActionSteps.add(stepIndex);
            yield { type: 'file_edit', uri: step.codeAction.uri };
          }
        }

        // 8. Error Message
        if (step.errorMessage) {
          const msg = step.errorMessage.error?.userErrorMessage || step.errorMessage.error?.shortError || 'Agent error';
          yield { type: 'error', message: msg };
        }
      }

      // Check if turn finished after running
      if (hasSeenRunningState && status === 'CASCADE_RUN_STATUS_IDLE') {
        yield { type: 'done' };
        break;
      }
    }
  }

  // Stop running execution
  async stop(conversationId) {
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/CancelCascadeInvocation`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: encodeGrpcWebFrame({
        cascade_id: conversationId,
        kill_background_tasks: true
      })
    });
    return res.ok;
  }
}

// 6. Interactive CLI Application
class InteractiveApp {
  constructor() {
    this.client = new AntigravityClient(PORT);
    this.currentModelKey = 'gemini-3.7-flash-tiered';
    this.currentModelIntId = 1301;
    this.currentModelDisplayName = 'gemini-3.7-flash-tiered';
    this.currentConversationId = null;
    this.currentConversationTitle = 'New Session';
    this.cachedChats = [];
    this.activeController = null;
    this.rl = null;
  }

  async init() {
    await startAgyDaemon();
    await waitForDaemon();
    await this.client.initCsrfToken();
    
    // Fetch live models dynamically
    const models = await this.client.fetchAvailableModels();
    
    // Set gemini-3.7-flash-tiered as default
    const preferred = models.find(m => m.key === 'gemini-3.7-flash-tiered') || models.find(m => m.key.includes('3.7-flash-tiered')) || models[0];
    if (preferred) {
      this.currentModelKey = preferred.key;
      this.currentModelDisplayName = preferred.name;
      this.currentModelIntId = preferred.intId;
    }

    // Lazy init - only create conversation on first prompt
    this.currentConversationId = null;
    this.currentConversationTitle = 'New Session';
  }

  printHeader() {
    console.clear();
    console.log('\x1b[1;35m╔════════════════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;35m║\x1b[0m \x1b[1;37m✦ ANTIGRAVITY DIRECT AI CONSOLE (Google Pro Subscription) ✦\x1b[0m           \x1b[1;35m║\x1b[0m');
    console.log('\x1b[1;35m╚════════════════════════════════════════════════════════════════════════╝\x1b[0m\n');
    this.printStatus();
    console.log('\x1b[90mCommands: /list (or /chats with fzf), /models (fzf), /new, /quota, /stop, /history, /exit\x1b[0m\n');
  }

  printStatus() {
    const shortId = this.currentConversationId ? this.currentConversationId.slice(0, 8) : 'new';
    console.log(`\x1b[1;34m[Chat]\x1b[0m \x1b[37m${this.currentConversationTitle}\x1b[0m (\x1b[90m${shortId}...\x1b[0m) | \x1b[1;33m[Model]\x1b[0m \x1b[1;36m${this.currentModelDisplayName}\x1b[0m (\x1b[90m${this.currentModelKey}\x1b[0m)`);
    console.log('\x1b[90m' + '─'.repeat(72) + '\x1b[0m');
  }

  // Interactive fzf conversation selector (sorted latest modified first)
  async selectChatWithFzf() {
    process.stdout.write('\x1b[90mLoading conversations...\x1b[0m\r');
    this.cachedChats = await this.client.listConversations();
    process.stdout.write('                         \r');

    if (this.cachedChats.length === 0) {
      console.log('\x1b[90mNo conversations found.\x1b[0m\n');
      return;
    }

    const items = this.cachedChats.map((chat) => {
      const relTime = formatRelativeTime(chat.lastModified);
      const timeStr = chat.lastModified.toLocaleDateString() + ' ' + chat.lastModified.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `\x1b[33m${relTime.padEnd(9)}\x1b[0m \x1b[90m(${timeStr})\x1b[0m  \x1b[1;37m${chat.title.padEnd(36)}\x1b[0m \x1b[90m[${chat.id}]\x1b[0m`;
    });

    const selected = runFzf(items, 'Select Conversation (Latest First) > ');
    if (selected) {
      const match = selected.match(/\[([a-f0-9-]+)\]/);
      if (match) {
        await this.openChat(match[1]);
      }
    } else {
      this.printHeader();
    }
  }

  async openChat(targetId) {
    const chatObj = this.cachedChats.find(c => c.id === targetId);
    this.currentConversationId = targetId;
    this.currentConversationTitle = chatObj ? chatObj.title : 'Session ' + targetId.slice(0, 8);
    this.printHeader();
    await this.showHistory();
  }

  async showHistory() {
    if (!this.currentConversationId) {
      console.log('\x1b[90m(New conversation - send a message to start)\x1b[0m\n');
      return;
    }
    console.log(`\n\x1b[1;34m=== Conversation History: ${this.currentConversationTitle} ===\x1b[0m\n`);
    const history = await this.client.getConversationHistory(this.currentConversationId);
    if (history.length === 0) {
      console.log('\x1b[90m(Empty conversation)\x1b[0m\n');
      return;
    }

    for (const msg of history) {
      if (msg.role === 'user') {
        console.log(`\x1b[1;35mUser:\x1b[0m ${msg.content}\n`);
      } else if (msg.role === 'assistant') {
        if (msg.thinking) {
          console.log(`\x1b[33m[Thinking] ${msg.thinking.replace(/\n/g, ' ').slice(0, 140)}...\x1b[0m`);
        }
        if (msg.content) {
          console.log(`\x1b[1;32mAssistant:\x1b[0m\n${msg.content}\n`);
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          console.log(`\x1b[36m[Tools Used: ${msg.toolCalls.map(t => t.name || 'tool').join(', ')}]\x1b[0m\n`);
        }
      } else if (msg.role === 'tool') {
        if (msg.toolType === 'command') {
          console.log(`\x1b[36m[Command: $ ${msg.command}]\x1b[0m\n`);
        } else if (msg.toolType === 'code') {
          console.log(`\x1b[36m[File Edit: ${msg.uri}]\x1b[0m\n`);
        } else if (msg.toolType === 'search') {
          console.log(`\x1b[36m[Web Search: ${msg.query}]\x1b[0m\n`);
        } else if (msg.toolType === 'generic') {
          console.log(`\x1b[36m[Action: ${msg.action}]\x1b[0m\n`);
        }
      } else if (msg.role === 'error') {
        console.log(`\x1b[31m[Error: ${msg.message}]\x1b[0m\n`);
      }
    }
    console.log('\x1b[90m' + '─'.repeat(72) + '\x1b[0m\n');
  }

  createNewChat() {
    this.currentConversationId = null;
    this.currentConversationTitle = 'New Session';
    this.printHeader();
    console.log('\x1b[32m✔ Ready for new conversation.\x1b[0m\n');
  }

  // Interactive fzf model selector
  async selectModelWithFzf() {
    process.stdout.write('\x1b[90mFetching live models & quota from server...\x1b[0m\r');
    await this.client.fetchAvailableModels();
    process.stdout.write('                                            \r');

    const items = this.client.availableModels.map((m) => {
      const quotaPct = Math.round(m.quotaFraction * 100);
      const thinking = m.supportsThinking ? '\x1b[33m[Thinking]\x1b[0m ' : '           ';
      return `\x1b[1;37m${m.name.padEnd(30)}\x1b[0m ${thinking}\x1b[32m${String(quotaPct).padStart(3)}% quota\x1b[0m \x1b[90m[${m.key}]\x1b[0m`;
    });

    const selected = runFzf(items, 'Select Model > ');
    if (selected) {
      const match = selected.match(/\[([^\]]+)\]/);
      if (match) {
        this.setModel(match[1]);
      }
    }
    this.printHeader();
  }

  async showQuota() {
    process.stdout.write('\x1b[90mFetching real-time quota from server...\x1b[0m\r');
    const models = await this.client.fetchAvailableModels();
    process.stdout.write('                                       \r');
    console.log('\n\x1b[1;34m--- Real-Time Subscription Quota Status ---\x1b[0m');
    models.forEach((m) => {
      const quotaPct = Math.round(m.quotaFraction * 100);
      const barLength = 20;
      const filled = Math.round((quotaPct / 100) * barLength);
      const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
      const reset = m.resetTime ? `(Resets at ${m.resetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : '';
      console.log(`\x1b[37m${m.name.padEnd(28)}\x1b[0m [\x1b[32m${bar}\x1b[0m] \x1b[1;32m${quotaPct}%\x1b[0m \x1b[90m${reset}\x1b[0m`);
    });
    console.log();
  }

  setModel(query) {
    const q = query.toLowerCase().trim();
    let selected = this.client.availableModels.find(m => m.key.toLowerCase() === q || m.name.toLowerCase().includes(q) || m.key.toLowerCase().includes(q));

    if (selected) {
      this.currentModelKey = selected.key;
      this.currentModelDisplayName = selected.name;
      this.currentModelIntId = selected.intId;
      console.log(`\x1b[32m✔ Switched model to:\x1b[0m \x1b[1;36m${selected.name}\x1b[0m (\x1b[90m${selected.key}\x1b[0m)\n`);
    } else {
      console.log(`\x1b[31mModel "${query}" not found. Type \`/models\` to search.\x1b[0m\n`);
    }
  }

  async stopCurrentTurn() {
    if (this.activeController) {
      this.activeController.abort();
      if (this.currentConversationId) {
        await this.client.stop(this.currentConversationId);
      }
      console.log('\n\x1b[33m⚠ Generation stopped.\x1b[0m\n');
      this.activeController = null;
      this.isGenerating = false;
    } else {
      console.log('\x1b[90mNo generation in progress.\x1b[0m\n');
    }
  }

  async sendPrompt(text) {
    this.isGenerating = true;
    this.activeController = new AbortController();

    // Lazy create conversation on first message
    if (!this.currentConversationId) {
      this.currentConversationId = await this.client.createConversation(this.currentModelIntId);
      this.currentConversationTitle = text.length > 35 ? text.slice(0, 32) + '...' : text;
      this.printHeader();
    }

    // Get raw step count before sending so we only process new steps
    const rawStepOffset = await this.client.getRawStepCount(this.currentConversationId);

    console.log(`\n\x1b[1;36m[${this.currentModelDisplayName}]\x1b[0m \x1b[90mgenerating...\x1b[0m\n`);

    let isThinking = false;

    const streamPromise = (async () => {
      try {
        for await (const event of this.client.streamUpdates(this.currentConversationId, rawStepOffset, this.activeController?.signal)) {
          if (!this.isGenerating || this.activeController?.signal.aborted) break;
          if (event.type === 'thinking') {
            if (!isThinking) {
              process.stdout.write('\x1b[1;33m[Thinking]\x1b[0m \x1b[33m');
              isThinking = true;
            }
            process.stdout.write(event.delta);
          } else if (event.type === 'content') {
            if (isThinking) {
              process.stdout.write('\x1b[0m\n\n\x1b[1;32m[Response]\x1b[0m\n');
              isThinking = false;
            }
            process.stdout.write(`\x1b[32m${event.delta}\x1b[0m`);
          } else if (event.type === 'search') {
            if (isThinking) {
              process.stdout.write('\x1b[0m\n');
              isThinking = false;
            }
            console.log(`\n\x1b[1;36m🌐 [Web Search]\x1b[0m \x1b[1;37m${event.query}\x1b[0m`);
          } else if (event.type === 'generic_action') {
            if (isThinking) {
              process.stdout.write('\x1b[0m\n');
              isThinking = false;
            }
            console.log(`\n\x1b[1;36m⚡ [Action]\x1b[0m \x1b[37m${event.action}\x1b[0m`);
          } else if (event.type === 'tool_calls') {
            if (isThinking) {
              process.stdout.write('\x1b[0m\n');
              isThinking = false;
            }
            for (const call of event.calls) {
              console.log(`\n\x1b[1;36m⚙ [Tool Call]\x1b[0m \x1b[1;37m${call.name || 'tool'}\x1b[0m \x1b[90m${JSON.stringify(call.argsJson || {})}\x1b[0m`);
            }
          } else if (event.type === 'command') {
            if (isThinking) {
              process.stdout.write('\x1b[0m\n');
              isThinking = false;
            }
            console.log(`\n\x1b[1;36m⚙ [Command]\x1b[0m $ \x1b[1;37m${event.command}\x1b[0m`);
            if (event.output) console.log(`\x1b[90m${event.output.trim()}\x1b[0m`);
          } else if (event.type === 'file_edit') {
            if (isThinking) {
              process.stdout.write('\x1b[0m\n');
              isThinking = false;
            }
            console.log(`\n\x1b[1;36m📝 [File Modified]\x1b[0m \x1b[1;37m${event.uri}\x1b[0m`);
          } else if (event.type === 'error') {
            console.log(`\n\x1b[31m✖ [Error]\x1b[0m ${event.message}\n`);
          } else if (event.type === 'done') {
            if (isThinking) process.stdout.write('\x1b[0m');
            console.log('\n');
            break;
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') console.error('\nStream error:', err);
      }
    })();

    await this.client.sendMessage({
      conversationId: this.currentConversationId,
      text,
      modelKey: this.currentModelKey,
      modelIntId: this.currentModelIntId
    });

    try {
      await streamPromise;
    } finally {
      this.isGenerating = false;
      this.activeController = null;
    }
  }

  async start() {
    await this.init();
    this.printHeader();

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\x1b[1;35m❯\x1b[0m '
    });

    this.rl.prompt();

    let lastSigintTime = 0;
    this.rl.on('SIGINT', async () => {
      if (this.isGenerating) {
        process.stdout.write('\n\x1b[33m⚠ Stopping generation (Ctrl+C)...\x1b[0m\n');
        await this.stopCurrentTurn();
        this.rl.prompt();
      } else {
        const now = Date.now();
        if (now - lastSigintTime < 2000) {
          console.log('\nBye!\n');
          process.exit(0);
        } else {
          lastSigintTime = now;
          console.log('\n\x1b[90m(Press Ctrl+C again or type /exit to quit)\x1b[0m');
          this.rl.prompt();
        }
      }
    });

    this.rl.on('line', async (line) => {
      const input = line.trim();
      if (!input) {
        this.rl.prompt();
        return;
      }

      if (input.startsWith('/')) {
        const [cmd, ...args] = input.split(' ');
        const argStr = args.join(' ').trim();

        switch (cmd.toLowerCase()) {
          case '/list':
          case '/chats':
          case '/open':
            await this.selectChatWithFzf();
            break;
          case '/history':
            await this.showHistory();
            break;
          case '/new':
            await this.createNewChat();
            break;
          case '/models':
          case '/model':
            if (argStr) {
              this.setModel(argStr);
            } else {
              await this.selectModelWithFzf();
            }
            break;
          case '/quota':
            await this.showQuota();
            break;
          case '/stop':
            await this.stopCurrentTurn();
            break;
          case '/clear':
            this.printHeader();
            break;
          case '/exit':
          case '/quit':
            console.log('\nBye!\n');
            process.exit(0);
            break;
          default:
            console.log('\x1b[31mUnknown command. Commands: /list (or /chats with fzf), /models (fzf), /new, /quota, /stop, /history, /clear, /exit\x1b[0m\n');
        }
        this.rl.prompt();
        return;
      }

      // Send prompt without pausing stdin so Ctrl+C is received immediately
      await this.sendPrompt(input);
      this.rl.prompt();
    });
  }
}

// Start app
const app = new InteractiveApp();
app.start().catch(console.error);