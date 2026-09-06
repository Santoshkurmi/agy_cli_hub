// Browser-native client for agy --hub gRPC-Web RPC daemon
export class AntigravityBrowserClient {
  constructor(baseUrl = 'http://127.0.0.1:8090') {
    this.baseUrl = baseUrl;
    this.csrfToken = '';
  }

  setBaseUrl(url) {
    this.baseUrl = url;
  }

  // 1. Extract CSRF token directly from agy hub web page
  async initCsrfToken() {
    try {
      const res = await fetch(`${this.baseUrl}/`);
      if (!res.ok) throw new Error(`Hub returned HTTP ${res.status}`);
      const html = await res.text();
      const match = html.match(/"csrfToken":\s*"([^"]+)"/);
      if (match) {
        this.csrfToken = match[1];
        return this.csrfToken;
      }
      throw new Error('csrfToken not found in response');
    } catch (e) {
      console.error('Failed to init CSRF token:', e);
      throw e;
    }
  }

  getHeaders() {
    return {
      'Content-Type': 'application/grpc-web+json',
      'X-Grpc-Web': '1',
      'x-codeium-csrf-token': this.csrfToken
    };
  }

  // 2. Browser Uint8Array frame encoder (5-byte length prefix)
  encodeFrame(jsonObj) {
    const encoder = new TextEncoder();
    const jsonBytes = encoder.encode(JSON.stringify(jsonObj));
    const frame = new Uint8Array(5 + jsonBytes.length);
    frame[0] = 0x00; // Data frame
    const view = new DataView(frame.buffer);
    view.setUint32(1, jsonBytes.length, false); // Big endian
    frame.set(jsonBytes, 5);
    return frame;
  }

  // 3. Browser ReadableStream gRPC-Web frame decoder
  async parseStream(responseBody, onFrame) {
    const reader = responseBody.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = new Uint8Array(0);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const next = new Uint8Array(buffer.length + value.length);
        next.set(buffer);
        next.set(value, buffer.length);
        buffer = next;

        while (buffer.length >= 5) {
          const flag = buffer[0];
          // Big-endian 32-bit unsigned integer length
          const length = ((buffer[1] << 24) >>> 0) + (buffer[2] << 16) + (buffer[3] << 8) + buffer[4];
          if (buffer.length < 5 + length) break;

          const payloadBytes = buffer.subarray(5, 5 + length);
          buffer = buffer.slice(5 + length);

          if (flag === 0x00 && payloadBytes.length > 0) {
            try {
              const jsonStr = decoder.decode(payloadBytes);
              const json = JSON.parse(jsonStr);
              onFrame(json);
            } catch (e) {
              console.error('Frame decode error:', e, 'Raw payload:', decoder.decode(payloadBytes).slice(0, 100));
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // 4. Fetch Available Models & Quotas
  async getAvailableModels() {
    if (!this.csrfToken) await this.initCsrfToken();
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/GetAvailableModels`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame({ force_refresh: true })
    });
    if (!res.ok) throw new Error(`GetAvailableModels failed: ${res.status}`);

    const models = [];
    await this.parseStream(res.body, (json) => {
      const raw = json.response?.models || {};
      for (const [key, details] of Object.entries(raw)) {
        if (!details.disabled) {
          models.push({
            key,
            displayName: details.displayName || key,
            modelEnum: details.model,
            supportsThinking: details.supportsThinking || false,
            quotaFraction: details.quotaInfo?.remainingFraction ?? 1,
            resetTime: details.quotaInfo?.resetTime || null
          });
        }
      }
    });
    return models;
  }

  // 5. List all Conversations
  async listConversations() {
    if (!this.csrfToken) await this.initCsrfToken();
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame({ exclude_subtrajectories: true })
    });
    if (!res.ok) throw new Error(`GetAllCascadeTrajectories failed: ${res.status}`);

    const list = [];
    await this.parseStream(res.body, (json) => {
      const summaries = json.trajectorySummaries || {};
      for (const [id, summary] of Object.entries(summaries)) {
        if (summary.lastModifiedTime && (summary.summary || (summary.stepCount && summary.stepCount > 0))) {
          list.push({
            id,
            title: summary.summary || 'Untitled Conversation',
            lastModified: summary.lastModifiedTime,
            stepCount: summary.stepCount || 0
          });
        }
      }
    });
    return list.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  }

  // 6. Start a new session
  async startConversation(modelEnum = 'MODEL_PLACEHOLDER_M319') {
    if (!this.csrfToken) await this.initCsrfToken();
    const cascadeId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'c-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now();

    const payload = {
      source: 'CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT',
      cascadeId,
      requestedModel: modelEnum || 'MODEL_PLACEHOLDER_M319',
      projectEnvConfig: {
        projectId: 'default-cli-project',
        defaultProjectEnvironment: {}
      }
    };
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/StartCascade`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame(payload)
    });
    if (!res.ok) throw new Error(`StartCascade failed: ${res.status}`);
    return cascadeId;
  }

  // 7. Get History Steps for a Conversation
  async getConversationHistory(cascadeId) {
    if (!this.csrfToken) await this.initCsrfToken();
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame({
        cascade_id: cascadeId,
        trajectory_verbosity: 2
      })
    });
    if (!res.ok) throw new Error(`GetCascadeTrajectorySteps failed: ${res.status}`);

    const steps = [];
    await this.parseStream(res.body, (json) => {
      (json.steps || []).forEach((step, idx) => {
        if (step.userInput) {
          const text = step.userInput.userResponse || step.userInput.items?.[0]?.text || '';
          if (text) steps.push({ role: 'user', content: text, stepIndex: idx });
        } else if (step.plannerResponse) {
          steps.push({
            role: 'assistant',
            content: step.plannerResponse.response || '',
            thinking: step.plannerResponse.thinking || '',
            toolCalls: step.plannerResponse.toolCalls || [],
            stepIndex: idx
          });
        } else if (step.runCommand) {
          steps.push({
            role: 'tool',
            type: 'command',
            command: step.runCommand.commandLine || step.runCommand.proposedCommandLine,
            output: step.runCommand.combinedOutput?.full || step.runCommand.output || '',
            stepIndex: idx
          });
        } else if (step.viewFile) {
          steps.push({
            role: 'tool',
            type: 'read',
            file: step.viewFile.absolutePathUri,
            stepIndex: idx
          });
        } else if (step.codeAction) {
          steps.push({
            role: 'tool',
            type: 'edit',
            uri: step.codeAction.uri,
            diff: step.codeAction.diff,
            stepIndex: idx
          });
        }
      });
    });
    return steps;
  }

  // 8. Send User Prompt Message
  async sendMessage({ cascadeId, text, modelEnum, thinkingBudget = 8192, autoExecute = true }) {
    if (!this.csrfToken) await this.initCsrfToken();
    const payload = {
      cascadeId,
      items: [{ text }],
      cascadeConfig: {
        plannerConfig: {
          requestedModel: { model: modelEnum },
          supportsThinking: thinkingBudget > 0,
          thinkingBudget,
          supportsLatexRendering: true,
          useAiCredits: false,
          toolConfig: {
            runCommand: {
              autoCommandConfig: {
                autoExecutionPolicy: autoExecute
                  ? 'CASCADE_COMMANDS_AUTO_EXECUTION_EAGER'
                  : 'CASCADE_COMMANDS_AUTO_EXECUTION_ASK_USER'
              }
            },
            notifyUser: {}
          },
          knowledgeConfig: {}
        },
        executorConfig: { useCoreDirect: true },
        conversationHistoryConfig: {}
      },
      customAgentSpec: {
        builtinAgent: { defaultAgent: { isGoogle: false, isInteractive: true } }
      },
      deliveryStrategy: 'MESSAGE_DELIVERY_STRATEGY_WHEN_IDLE'
    };

    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame(payload)
    });
    if (!res.ok) throw new Error(`SendUserCascadeMessage failed: ${res.status}`);
    return res;
  }

  // 9. Stream Live Agent State Updates directly in browser
  async streamUpdates(cascadeId, onUpdate, abortSignal) {
    if (!this.csrfToken) await this.initCsrfToken();
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/StreamAgentStateUpdates`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame({
        conversationId: cascadeId,
        subscriberId: `web-sub-${Date.now()}`,
        trajectoryVerbosity: 2
      }),
      signal: abortSignal
    });
    if (!res.ok) throw new Error(`StreamAgentStateUpdates failed: ${res.status}`);

    const stepResponseOffsets = new Map();
    const stepThinkingOffsets = new Map();
    let hasSeenRunningState = false;

    await this.parseStream(res.body, (chunk) => {
      const update = chunk.update;
      const status = update?.status || update?.executableStatus || update?.executorLoopStatus || '';
      
      if (status.includes('RUNNING')) {
        hasSeenRunningState = true;
      }

      const steps = update?.mainTrajectoryUpdate?.stepsUpdate?.steps || [];
      const indices = update?.mainTrajectoryUpdate?.stepsUpdate?.indices || [];

      for (let i = 0; i < steps.length; i++) {
        const stepIndex = indices[i] !== undefined ? indices[i] : i;
        const step = steps[i];

        if (step.plannerResponse?.thinking) {
          const full = step.plannerResponse.thinking;
          const prev = stepThinkingOffsets.get(stepIndex) || 0;
          if (full.length > prev) {
            const delta = full.slice(prev);
            stepThinkingOffsets.set(stepIndex, full.length);
            onUpdate({ type: 'thinking', delta, full, stepIndex });
          }
        }

        if (step.plannerResponse?.response) {
          const full = step.plannerResponse.response;
          const prev = stepResponseOffsets.get(stepIndex) || 0;
          if (full.length > prev) {
            const delta = full.slice(prev);
            stepResponseOffsets.set(stepIndex, full.length);
            onUpdate({ type: 'content', delta, full, stepIndex });
          }
        }

        if (step.runCommand) {
          onUpdate({
            type: 'command',
            command: step.runCommand.commandLine || step.runCommand.proposedCommandLine,
            output: step.runCommand.combinedOutput?.full || step.runCommand.output || '',
            stepIndex
          });
        }

        if (step.viewFile) {
          onUpdate({
            type: 'read',
            file: step.viewFile.absolutePathUri,
            stepIndex
          });
        }

        if (step.codeAction) {
          onUpdate({
            type: 'edit',
            uri: step.codeAction.uri,
            diff: step.codeAction.diff,
            stepIndex
          });
        }
      }

      if (hasSeenRunningState && (status === 'CASCADE_RUN_STATUS_IDLE' || status.includes('IDLE'))) {
        onUpdate({ type: 'done' });
      }
    });
  }

  // 10. Stop execution
  async stop(cascadeId) {
    if (!this.csrfToken) await this.initCsrfToken();
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/CancelCascadeInvocation`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame({
        cascadeId,
        killBackgroundTasks: true
      })
    });
    return res.ok;
  }
}
