// Generate standard RFC4122 v4 UUID
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

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
        // Permanently ensure terminal sandbox is disabled on daemon
        this.disableTerminalSandbox().catch(() => {});
        return this.csrfToken;
      }
      throw new Error('csrfToken not found in response');
    } catch (e) {
      console.error('Failed to init CSRF token:', e);
      throw e;
    }
  }

  // Helper to validate HTTP and gRPC response headers
  checkResponse(res) {
    if (!res.ok) throw new Error(`HTTP error: ${res.status} ${res.statusText}`);
    const grpcStatus = res.headers.get('grpc-status');
    if (grpcStatus && grpcStatus !== '0') {
      const msg = decodeURIComponent(res.headers.get('grpc-message') || `gRPC error status ${grpcStatus}`);
      throw new Error(`gRPC error (${grpcStatus}): ${msg}`);
    }
  }

  // Permanently disable terminal sandbox via official JetboxWriteState
  async disableTerminalSandbox() {
    try {
      await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/JetboxWriteState`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: this.encodeFrame({
          userConfig: {
            userSettings: {
              enableTerminalSandbox: false
            }
          }
        })
      });
    } catch { }
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
    this.checkResponse(res);

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

  // 5. Live Subscription to Conversation Summaries via JetboxSubscribeToSummaries
  async subscribeToSummaries(onUpdate, abortSignal) {
    if (!this.csrfToken) await this.initCsrfToken();
    try {
      const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/JetboxSubscribeToSummaries`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: this.encodeFrame({}),
        signal: abortSignal
      });
      this.checkResponse(res);

      await this.parseStream(res.body, (json) => {
        if (json.updates) {
          onUpdate(json.updates);
        }
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[JetboxSubscribeToSummaries] stream error:', err);
      }
    }
  }

  // 6. List Registered Projects
  async listProjects() {
    if (!this.csrfToken) await this.initCsrfToken();
    let projectIds = [];
    const controller = new AbortController();
    try {
      const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/ProjectUpdatesStream`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: this.encodeFrame({}),
        signal: controller.signal
      });
      await this.parseStream(res.body, (json) => {
        if (json.projectList?.projectIds) {
          projectIds = json.projectList.projectIds;
          controller.abort();
        }
      });
    } catch {}

    if (projectIds.length === 0) {
      projectIds = ['default-cli-project', 'outside-of-project'];
    }

    try {
      const readRes = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/ReadProjects`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: this.encodeFrame({ ids: projectIds })
      });
      let projects = [];
      await this.parseStream(readRes.body, (json) => {
        if (json.projects) {
          projects = json.projects.map(p => {
            const folder = p.projectResources?.resources?.[0]?.folderUri || '';
            return {
              id: p.id,
              name: p.name || p.id,
              folderUri: folder,
              path: folder.replace(/^file:\/\//, '')
            };
          });
        }
      });
      return projects;
    } catch {
      return [];
    }
  }

  // 7. Start a new session with explicit workspace folder & project
  async startConversation(modelEnum = 'MODEL_PLACEHOLDER_M319', folderPath = '', projectId = '') {
    if (!this.csrfToken) await this.initCsrfToken();
    const cascadeId = generateUUID();

    const normalizedUri = folderPath
      ? (folderPath.startsWith('file://') ? folderPath : `file://${folderPath}`)
      : '';

    const payload = {
      source: 'CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT',
      cascadeId,
      requestedModel: modelEnum || 'MODEL_PLACEHOLDER_M319'
    };

    // CRITICAL: agy rejects StartCascade if both workspaceUris and projectEnvConfig are passed together.
    if (normalizedUri) {
      payload.workspaceUris = [normalizedUri];
      payload.overrideWorkspaceUris = [normalizedUri];
    } else if (projectId && projectId !== 'default-cli-project' && projectId !== 'custom') {
      payload.projectEnvConfig = {
        projectId,
        defaultProjectEnvironment: {}
      };
    } else {
      payload.projectEnvConfig = {
        projectId: 'default-cli-project',
        defaultProjectEnvironment: {}
      };
    }

    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/StartCascade`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame(payload)
    });
    this.checkResponse(res);
    return cascadeId;
  }

  // 8. Update workspace folder & project mid-conversation
  async setSessionWorkspace(cascadeId, folderPath = '', projectId = '', modelEnum = 'MODEL_PLACEHOLDER_M319') {
    if (!this.csrfToken) await this.initCsrfToken();
    const normalizedUri = folderPath
      ? (folderPath.startsWith('file://') ? folderPath : `file://${folderPath}`)
      : '';

    const payload = {
      source: 'CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT',
      cascadeId,
      requestedModel: modelEnum || 'MODEL_PLACEHOLDER_M319'
    };

    // CRITICAL: agy rejects StartCascade if both workspaceUris and projectEnvConfig are passed together.
    if (normalizedUri) {
      payload.workspaceUris = [normalizedUri];
      payload.overrideWorkspaceUris = [normalizedUri];
    } else if (projectId && projectId !== 'default-cli-project' && projectId !== 'custom') {
      payload.projectEnvConfig = {
        projectId,
        defaultProjectEnvironment: {}
      };
    } else {
      payload.projectEnvConfig = {
        projectId: 'default-cli-project',
        defaultProjectEnvironment: {}
      };
    }

    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/StartCascade`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame(payload)
    });
    this.checkResponse(res);
    return true;
  }

  // 8a. Handle interactive user approval/denial for cascade permission steps
  async handleCascadeUserInteraction(cascadeId, stepIndex, trajectoryId, allow = true, scope = 'PERMISSION_SCOPE_ONCE', userDenyInstruction = '') {
    if (!this.csrfToken) await this.initCsrfToken();
    const payload = {
      cascadeId,
      interaction: {
        trajectoryId: trajectoryId || undefined,
        stepIndex: Number(stepIndex),
        permission: {
          allow: Boolean(allow),
          scope: allow ? (scope || 'PERMISSION_SCOPE_ONCE') : undefined,
          userDenyInstruction: allow ? undefined : (userDenyInstruction || 'User rejected this command.')
        }
      }
    };
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/HandleCascadeUserInteraction`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame(payload)
    });
    this.checkResponse(res);
    return true;
  }

  // 8b. Resolve / Approve all outstanding/blocking steps in a cascade
  async resolveOutstandingSteps(cascadeId) {
    if (!this.csrfToken) await this.initCsrfToken();
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/ResolveOutstandingSteps`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame({ cascadeId })
    });
    this.checkResponse(res);
    return true;
  }

  // 8c. Cancel specific cascade steps (e.g. reject a proposed command)
  async cancelCascadeSteps(cascadeId, stepIndices = []) {
    if (!this.csrfToken) await this.initCsrfToken();
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/CancelCascadeSteps`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame({
        cascadeId,
        stepIndices: stepIndices.map(Number)
      })
    });
    this.checkResponse(res);
    return true;
  }

  // 7. Get raw step count for accurate turn offsetting
  async getRawStepCount(cascadeId) {
    if (!this.csrfToken) await this.initCsrfToken();
    try {
      const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: this.encodeFrame({
          cascade_id: cascadeId,
          trajectory_verbosity: 2
        })
      });
      this.checkResponse(res);
      let count = 0;
      await this.parseStream(res.body, (json) => {
        count = (json.steps || []).length;
      });
      return count;
    } catch {
      return 0;
    }
  }

  // Helper to parse a list of raw trajectory steps into UI turns
  parseStepsToTurns(steps) {
    const turns = [];
    let currentAssistant = null;

    (steps || []).forEach((step, idx) => {
      const stepIndex = step.metadata?.sourceTrajectoryStepInfo?.stepIndex ?? idx;
      if (step.userInput) {
        const text = step.userInput.userResponse || step.userInput.items?.[0]?.text || '';
        if (text) {
          turns.push({ role: 'user', content: text, stepIndex });
          currentAssistant = { role: 'assistant', steps: [] };
          turns.push(currentAssistant);
        }
      } else {
        if (!currentAssistant) {
          currentAssistant = { role: 'assistant', steps: [] };
          turns.push(currentAssistant);
        }

        if (step.plannerResponse) {
          const thinking = step.plannerResponse.thinking || '';
          const content = step.plannerResponse.response || '';
          if (thinking || content) {
            currentAssistant.steps.push({
              stepIndex,
              type: 'planner',
              thinking,
              content
            });
          }
        } else if (step.runCommand) {
          const cmd = step.runCommand.commandLine || step.runCommand.proposedCommandLine;
          const out = step.runCommand.combinedOutput?.full || step.runCommand.output || '';
          const status = step.status;
          const isWaiting = status === 'CORTEX_STEP_STATUS_WAITING';
          const isProposed = isWaiting || Boolean(step.runCommand.proposedCommandLine && !step.runCommand.commandLine && !out);
          const err = step.error?.shortError || step.error?.message;

          // If an earlier attempt of this command errored in sandbox, supersede it with the successful attempt
          const prevIdx = currentAssistant.steps.findIndex(s => s.toolType === 'command' && s.command === cmd && !s.output);
          if (prevIdx !== -1 && (out || !err?.includes('sandbox'))) {
            currentAssistant.steps[prevIdx] = {
              stepIndex,
              type: 'tool',
              toolType: 'command',
              command: cmd,
              output: out,
              status,
              isWaiting,
              isProposed,
              error: err
            };
          } else if (prevIdx === -1 && (!err || !err.includes('sandbox') || out)) {
            currentAssistant.steps.push({
              stepIndex,
              type: 'tool',
              toolType: 'command',
              command: cmd,
              output: out,
              status,
              isWaiting,
              isProposed,
              error: err
            });
          }
        } else if (step.requestedInteraction?.permission || (step.generic?.args?.CommandLine && !step.runCommand)) {
          const cmd = step.generic?.args?.CommandLine || step.requestedInteraction?.permission?.resource?.target || '';
          const trajectoryId = step.metadata?.sourceTrajectoryStepInfo?.trajectoryId || step.metadata?.sourceTrajectoryStepInfo?.cascadeId;
          currentAssistant.steps.push({
            stepIndex,
            type: 'tool',
            toolType: 'command',
            command: cmd,
            output: '',
            status: step.status || 'CORTEX_STEP_STATUS_WAITING',
            isWaiting: true,
            isProposed: true,
            trajectoryId
          });
        } else if (step.viewFile) {
          const rawUri = step.viewFile.absolutePathUri || step.viewFile.uri || '';
          const filePath = rawUri.replace(/^file:\/\//, '') || 'File';
          const fileName = filePath.split('/').filter(Boolean).pop() || filePath;
          const startLine = step.viewFile.startLine ?? (step.viewFile.endLine ? 1 : undefined);
          const endLine = step.viewFile.endLine;
          const rangeStr = (startLine !== undefined && endLine !== undefined)
            ? `L${startLine}-L${endLine}`
            : (step.viewFile.numLines ? `${step.viewFile.numLines} lines` : '');
          const label = `Read: ${fileName}${rangeStr ? ` (${rangeStr})` : ''}`;
          const err = step.error?.shortError || step.error?.message || (typeof step.error === 'string' ? step.error : undefined);

          const metaLines = [];
          metaLines.push(`File: ${filePath}`);
          if (rangeStr) metaLines.push(`Range: ${rangeStr}`);
          if (step.viewFile.numBytes) metaLines.push(`Size: ${step.viewFile.numBytes.toLocaleString()} bytes`);
          let out = metaLines.join('\n');
          if (step.viewFile.content) {
            out += `\n\n--- Content ---\n${step.viewFile.content}`;
          }

          currentAssistant.steps.push({
            stepIndex,
            type: 'tool',
            toolType: 'read',
            label,
            file: filePath,
            range: rangeStr,
            output: out,
            error: err,
            status: step.status || (err ? 'CORTEX_STEP_STATUS_ERROR' : 'CORTEX_STEP_STATUS_DONE')
          });
        } else if (step.codeAction) {
          const rawUri = step.codeAction.uri || step.codeAction.actionSpec?.command?.file?.absoluteUri || step.codeAction.actionResult?.edit?.absoluteUri || '';
          const filePath = rawUri.replace(/^file:\/\//, '') || 'File';
          const fileName = filePath.split('/').filter(Boolean).pop() || filePath;
          const chunk = step.codeAction.replacementInfos?.[0]?.originalChunk;
          const startLine = chunk?.startLine;
          const endLine = chunk?.endLine;
          const rangeStr = (startLine !== undefined && endLine !== undefined) ? `L${startLine}-L${endLine}` : '';
          const diffStats = step.codeAction.diffStats;
          const statsStr = diffStats ? `(+${diffStats.additions || 0}, -${diffStats.deletions || 0})` : '';
          const label = `Edit: ${fileName}${rangeStr ? ` (${rangeStr})` : ''} ${statsStr}`.trim();
          const diff = step.codeAction.diff || step.codeAction.content || (chunk ? `@@ -${startLine},${(endLine - startLine + 1)} @@\n-${chunk.targetContent}\n+${chunk.replacementContent}` : '');
          const err = step.error?.shortError || step.error?.message || (typeof step.error === 'string' ? step.error : undefined);

          currentAssistant.steps.push({
            stepIndex,
            type: 'tool',
            toolType: 'edit',
            label,
            file: filePath,
            range: rangeStr,
            diff,
            error: err,
            status: step.status || (err ? 'CORTEX_STEP_STATUS_ERROR' : 'CORTEX_STEP_STATUS_DONE')
          });
        } else if (step.notifyUser) {
          currentAssistant.steps.push({
            stepIndex,
            type: 'notifyUser',
            content: step.notifyUser.notificationContent || '',
            reviewUris: step.notifyUser.reviewAbsoluteUris || [],
            isBlocking: Boolean(step.notifyUser.isBlocking),
            askForUserFeedback: Boolean(step.notifyUser.askForUserFeedback),
            confidence: step.notifyUser.confidenceScore || null
          });
        } else if (step.searchWeb) {
          const query = step.searchWeb.query || '';
          const summary = step.searchWeb.summary || '';
          const err = step.error?.shortError || step.error?.message || (typeof step.error === 'string' ? step.error : undefined);
          const label = `Web Search: ${query || 'Search'}`;
          const output = summary || (err ? `Search failed: ${err}` : `Query: ${query}`);

          currentAssistant.steps.push({
            stepIndex,
            type: 'tool',
            toolType: 'search',
            label,
            query,
            output,
            error: err,
            status: step.status || (err ? 'CORTEX_STEP_STATUS_ERROR' : 'CORTEX_STEP_STATUS_DONE')
          });
        } else if (step.listDirectory) {
          const rawUri = step.listDirectory.directoryPathUri || '';
          const dirPath = rawUri.replace(/^file:\/\//, '') || 'Directory';
          const dirName = dirPath.split('/').filter(Boolean).pop() || dirPath;
          const items = step.listDirectory.results || [];
          const label = step.metadata?.toolAction || `List: ${dirName} (${items.length} items)`;
          const err = step.error?.shortError || step.error?.message || (typeof step.error === 'string' ? step.error : undefined);

          const metaLines = [`Directory: ${dirPath}`, `Items found: ${items.length}`];
          if (items.length > 0) {
            metaLines.push('');
            items.forEach(item => {
              const typePrefix = item.isDir ? '📁 [DIR] ' : '📄 [FILE]';
              const sizeStr = item.sizeBytes ? ` (${Number(item.sizeBytes).toLocaleString()} bytes)` : '';
              metaLines.push(`${typePrefix} ${item.name}${sizeStr}`);
            });
          } else {
            metaLines.push('\n(Directory is empty)');
          }

          currentAssistant.steps.push({
            stepIndex,
            type: 'tool',
            toolType: 'list',
            label,
            directory: dirPath,
            output: metaLines.join('\n'),
            error: err,
            status: step.status || (err ? 'CORTEX_STEP_STATUS_ERROR' : 'CORTEX_STEP_STATUS_DONE')
          });
        } else if (step.find) {
          const pattern = step.find.pattern || '';
          const dir = step.find.searchDirectory || '';
          const dirName = dir.split('/').filter(Boolean).pop() || dir;
          const label = step.metadata?.toolAction || `Find: "${pattern}" in ${dirName}`;
          const err = step.error?.shortError || step.error?.message || (typeof step.error === 'string' ? step.error : undefined);
          const out = [
            `Pattern: ${pattern}`,
            `Directory: ${dir}`,
            step.find.maxDepth ? `Max Depth: ${step.find.maxDepth}` : '',
            step.find.truncatedOutput ? `\nResults:\n${step.find.truncatedOutput}` : ''
          ].filter(Boolean).join('\n');

          currentAssistant.steps.push({
            stepIndex,
            type: 'tool',
            toolType: 'find',
            label,
            output: out,
            error: err,
            status: step.status || (err ? 'CORTEX_STEP_STATUS_ERROR' : 'CORTEX_STEP_STATUS_DONE')
          });
        } else if (step.metadata?.toolAction || step.generic) {
          currentAssistant.steps.push({
            stepIndex,
            type: 'tool',
            toolType: 'generic',
            label: step.metadata?.toolAction || step.generic?.toolAction || 'Tool Action'
          });
        }
      }
    });

    return turns.filter(t => t.role === 'user' || (t.steps && t.steps.length > 0));
  }

  // 8. Get History Steps grouped cleanly by turn with distinct steps
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
    this.checkResponse(res);

    let turns = [];
    await this.parseStream(res.body, (json) => {
      turns = this.parseStepsToTurns(json.steps || []);
    });
    return turns;
  }

  // 8. Update User Settings on daemon and global config.json
  async setUserSettings(autoExecutionPolicy) {
    if (!this.csrfToken) await this.initCsrfToken();
    try {
      // Official Jetbox API for persistent user settings
      await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/JetboxWriteState`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: this.encodeFrame({
          userConfig: {
            userSettings: {
              enableTerminalSandbox: false,
              autoExecutionPolicy: autoExecutionPolicy
            }
          }
        })
      });
    } catch (err) {
      console.warn('JetboxWriteState error:', err);
    }

    try {
      await fetch('/api/sync-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy: autoExecutionPolicy })
      });
    } catch (err) {
      console.warn('Config sync warning:', err);
    }
  }

  // 9. Send User Prompt Message
  async sendMessage({
    cascadeId,
    text,
    modelEnum,
    thinkingBudget = 8192,
    autoExecutionPolicy = 'CASCADE_COMMANDS_AUTO_EXECUTION_EAGER',
    autoExecute
  }) {
    if (!this.csrfToken) await this.initCsrfToken();

    // Support enum string, alias ('EAGER', 'AUTO', 'OFF'), or boolean autoExecute
    let policy = autoExecutionPolicy;
    if (autoExecute !== undefined && (!autoExecutionPolicy || autoExecutionPolicy === 'CASCADE_COMMANDS_AUTO_EXECUTION_EAGER')) {
      policy = autoExecute ? 'CASCADE_COMMANDS_AUTO_EXECUTION_EAGER' : 'CASCADE_COMMANDS_AUTO_EXECUTION_OFF';
    }
    if (policy === 'EAGER') policy = 'CASCADE_COMMANDS_AUTO_EXECUTION_EAGER';
    else if (policy === 'AUTO') policy = 'CASCADE_COMMANDS_AUTO_EXECUTION_AUTO';
    else if (policy === 'OFF') policy = 'CASCADE_COMMANDS_AUTO_EXECUTION_OFF';

    const payload = {
      cascadeId,
      items: [{ text }],
      cascadeConfig: {
        plannerConfig: {
          toolConfig: {
            runCommand: {
              autoCommandConfig: {
                autoExecutionPolicy: policy
              }
            },
            notifyUser: {}
          },
          requestedModel: {
            model: modelEnum || 'MODEL_PLACEHOLDER_M319'
          },
          supportsThinking: Number(thinkingBudget) > 0,
          thinkingBudget: Number(thinkingBudget) || 0,
          knowledgeConfig: {},
          useAiCredits: false,
          supportsLatexRendering: true
        },
        executorConfig: {
          useCoreDirect: true
        },
        conversationHistoryConfig: {}
      },
      customAgentSpec: {
        builtinAgent: {
          defaultAgent: {
            isGoogle: false,
            isInteractive: true
          }
        }
      },
      deliveryStrategy: 'MESSAGE_DELIVERY_STRATEGY_WHEN_IDLE'
    };

    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame(payload)
    });
    this.checkResponse(res);
    return res;
  }

  // 10. Persistent stream for a conversation — one connection for the entire session lifetime.
  // startStepGetter is a function () => number so the current turn boundary can be updated
  // between messages without reopening the stream.
  // persistent=true means IDLE signals only fire onUpdate('done') but don't close the stream.
  async streamUpdates(cascadeId, onUpdate, abortSignal, startStepIndex = 0, persistent = false) {
    if (!this.csrfToken) await this.initCsrfToken();
    // Allow passing a getter fn so callers can dynamically update the turn boundary
    const getStartStep = typeof startStepIndex === 'function' ? startStepIndex : () => startStepIndex;
    const res = await fetch(`${this.baseUrl}/exa.language_server_pb.LanguageServerService/StreamAgentStateUpdates`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: this.encodeFrame({
        conversationId: cascadeId,
        subscriberId: `web-sub-${Date.now()}`,
        trajectoryVerbosity: 2,
        initialStepsPageBounds: {
          startIndex: 0  // Always start from 0 for persistent streams; filtering is done per-turn
        }
      }),
      signal: abortSignal
    });
    this.checkResponse(res);

    const stepResponseOffsets = new Map();
    const stepThinkingOffsets = new Map();
    const seenToolSteps = new Set();
    let isDone = false;
    let isFirstChunk = true;
    const markDone = () => {
      if (!isDone) {
        if (!persistent) isDone = true;
        onUpdate({ type: 'done' });
      }
    };

    try {
      await this.parseStream(res.body, (chunk) => {
        const update = chunk.update;
        const status = update?.status || update?.executableStatus || update?.executorLoopStatus || '';

        // Detect execution errors from executorMetadatasUpdate (most reliable source)
        // The error is at: update.mainTrajectoryUpdate.executorMetadatasUpdate.executorMetadatas[].executionError
        // CRITICAL: Only emit errors where lastStepIdx >= getStartStep() so errors from
        // previous failed turns don't bleed into the current turn's chat bubble.
        const executorMetas = update?.mainTrajectoryUpdate?.executorMetadatasUpdate?.executorMetadatas || [];
        for (const meta of executorMetas) {
          const metaLastStep = meta.lastStepIdx ?? -1;
          const belongsToThisTurn = metaLastStep < 0 || metaLastStep >= getStartStep();
          if (meta.executionError && belongsToThisTurn && !seenToolSteps.has(`exec-err-${meta.executionId}`)) {
            seenToolSteps.add(`exec-err-${meta.executionId}`);
            onUpdate({ type: 'error', message: meta.executionError });
          }
        }

        const steps = update?.mainTrajectoryUpdate?.stepsUpdate?.steps || [];
        const indices = update?.mainTrajectoryUpdate?.stepsUpdate?.indices || [];
        const totalLength = update?.mainTrajectoryUpdate?.stepsUpdate?.totalLength ?? steps.length;

        // On the very first chunk received, emit the entire conversation history
        if (isFirstChunk) {
          isFirstChunk = false;
          const initialTurns = this.parseStepsToTurns(steps);

          // Find the stepIndex where the current (last) user prompt started
          let lastUserStepIndex = 0;
          for (let i = steps.length - 1; i >= 0; i--) {
            const step = steps[i];
            if (step.userInput) {
              const stepInfo = step.metadata?.sourceTrajectoryStepInfo;
              lastUserStepIndex = (stepInfo?.stepIndex !== undefined)
                ? stepInfo.stepIndex
                : (indices[i] !== undefined ? indices[i] : i);
              break;
            }
          }

          // Pre-seed offsets & seenToolSteps for steps in Chunk 0 so subsequent chunks seamlessly continue
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const stepInfo = step.metadata?.sourceTrajectoryStepInfo;
            const stepIndex = (stepInfo?.stepIndex !== undefined)
              ? stepInfo.stepIndex
              : (indices[i] !== undefined ? indices[i] : i);

            if (step.plannerResponse?.thinking) {
              stepThinkingOffsets.set(stepIndex, step.plannerResponse.thinking.length);
            }
            if (step.plannerResponse?.response) {
              stepResponseOffsets.set(stepIndex, step.plannerResponse.response.length);
            }
            if (step.runCommand || step.generic?.args?.CommandLine || step.requestedInteraction?.permission) {
              seenToolSteps.add(`cmd-${stepIndex}`);
            }
            if (step.viewFile) {
              seenToolSteps.add(`read-${stepIndex}`);
            }
            if (step.codeAction) {
              seenToolSteps.add(`edit-${stepIndex}`);
            }
            if (step.notifyUser) {
              seenToolSteps.add(`notify-${stepIndex}`);
            }
            if (step.searchWeb) {
              seenToolSteps.add(`search-${stepIndex}`);
            }
            if (step.listDirectory) {
              seenToolSteps.add(`list-${stepIndex}`);
            }
            if (step.find) {
              seenToolSteps.add(`find-${stepIndex}`);
            }
          }

          const lastStep = steps[steps.length - 1];
          const isLastStepRunning = Boolean(lastStep && (
            lastStep.status === 'CORTEX_STEP_STATUS_RUNNING' ||
            lastStep.status === 'CORTEX_STEP_STATUS_WAITING' ||
            Boolean(lastStep.requestedInteraction?.permission)
          ));
          const isRunning = status.includes('RUNNING') || status.includes('WAITING') || isLastStepRunning;

          onUpdate({
            type: 'init',
            messages: initialTurns,
            totalLength,
            status,
            isRunning,
            currentTurnStartStep: lastUserStepIndex
          });
          return;
        }

        if (update?.mainTrajectoryUpdate?.stepsUpdate?.totalLength !== undefined) {
          onUpdate({
            type: 'step_count',
            totalLength: update.mainTrajectoryUpdate.stepsUpdate.totalLength
          });
        }


        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const stepInfo = step.metadata?.sourceTrajectoryStepInfo;
          const stepIndex = (stepInfo?.stepIndex !== undefined)
            ? stepInfo.stepIndex
            : (indices[i] !== undefined ? indices[i] : (getStartStep() + i));
          const trajectoryId = stepInfo?.trajectoryId || cascadeId;
          
          // CRITICAL: Skip all steps belonging to previous turns
          if (stepIndex < getStartStep()) continue;

          // Check for step-level execution errors
          const stepExecError = step.executionError || step.error?.message;
          if (stepExecError && !seenToolSteps.has(`err-${stepIndex}`)) {
            seenToolSteps.add(`err-${stepIndex}`);
            onUpdate({ type: 'error', message: stepExecError });
          }

          // 1. Thinking

          if (step.plannerResponse?.thinking) {
            const full = step.plannerResponse.thinking;
            const prev = stepThinkingOffsets.get(stepIndex) || 0;
            if (full.length > prev) {
              const delta = full.slice(prev);
              stepThinkingOffsets.set(stepIndex, full.length);
              onUpdate({ type: 'thinking', delta, full, stepIndex });
            }
          }

          // 2. Response content
          if (step.plannerResponse?.response) {
            const full = step.plannerResponse.response;
            const prev = stepResponseOffsets.get(stepIndex) || 0;
            if (full.length > prev) {
              const delta = full.slice(prev);
              stepResponseOffsets.set(stepIndex, full.length);
              onUpdate({ type: 'content', delta, full, stepIndex });
            }
          }

          // 3a. Generic / Permission Interaction Command awaiting approval
          if (step.requestedInteraction?.permission || (step.generic?.args?.CommandLine && !step.runCommand)) {
            const cmd = step.generic?.args?.CommandLine || step.requestedInteraction?.permission?.resource?.target || '';
            const isWaiting = step.status === 'CORTEX_STEP_STATUS_WAITING' || Boolean(step.requestedInteraction?.permission);
            if (!seenToolSteps.has(`cmd-${stepIndex}`)) {
              seenToolSteps.add(`cmd-${stepIndex}`);
              onUpdate({
                type: 'tool',
                toolType: 'command',
                command: cmd,
                output: '',
                status: step.status || 'CORTEX_STEP_STATUS_WAITING',
                isWaiting,
                isProposed: true,
                stepIndex,
                trajectoryId
              });
            }
          }

          // 3b. Standard Run Command tool (Deduplicated per stepIndex)
          if (step.runCommand) {
            const cmd = step.runCommand.commandLine || step.runCommand.proposedCommandLine;
            const out = step.runCommand.combinedOutput?.full || step.runCommand.output || '';
            const status = step.status;
            const isWaiting = status === 'CORTEX_STEP_STATUS_WAITING';
            const isProposed = isWaiting || Boolean(step.runCommand.proposedCommandLine && !step.runCommand.commandLine && !out);
            const err = step.error?.shortError || step.error?.message;

            // Skip emitting internal sandbox connection failures that are retried locally
            if (err && err.includes('sandbox') && !out) {
              continue;
            }

            if (!seenToolSteps.has(`cmd-${stepIndex}`)) {
              seenToolSteps.add(`cmd-${stepIndex}`);
              onUpdate({
                type: 'tool',
                toolType: 'command',
                command: cmd,
                output: out,
                status,
                isWaiting,
                isProposed,
                error: err,
                stepIndex,
                trajectoryId
              });
            } else {
              onUpdate({
                type: 'tool_output',
                output: out,
                status,
                isWaiting,
                isProposed,
                error: err,
                stepIndex,
                trajectoryId
              });
            }
          }

          if (step.viewFile && !seenToolSteps.has(`read-${stepIndex}`)) {
            seenToolSteps.add(`read-${stepIndex}`);
            const rawUri = step.viewFile.absolutePathUri || step.viewFile.uri || '';
            const filePath = rawUri.replace(/^file:\/\//, '') || 'File';
            const fileName = filePath.split('/').filter(Boolean).pop() || filePath;
            const startLine = step.viewFile.startLine ?? (step.viewFile.endLine ? 1 : undefined);
            const endLine = step.viewFile.endLine;
            const rangeStr = (startLine !== undefined && endLine !== undefined)
              ? `L${startLine}-L${endLine}`
              : (step.viewFile.numLines ? `${step.viewFile.numLines} lines` : '');
            const label = `Read: ${fileName}${rangeStr ? ` (${rangeStr})` : ''}`;
            const err = step.error?.shortError || step.error?.message || (typeof step.error === 'string' ? step.error : undefined);
            const metaLines = [`File: ${filePath}`];
            if (rangeStr) metaLines.push(`Range: ${rangeStr}`);
            if (step.viewFile.numBytes) metaLines.push(`Size: ${step.viewFile.numBytes.toLocaleString()} bytes`);
            let out = metaLines.join('\n');
            if (step.viewFile.content) {
              out += `\n\n--- Content ---\n${step.viewFile.content}`;
            }
            onUpdate({
              type: 'tool',
              toolType: 'read',
              label,
              file: filePath,
              range: rangeStr,
              output: out,
              error: err,
              status: step.status || (err ? 'CORTEX_STEP_STATUS_ERROR' : 'CORTEX_STEP_STATUS_DONE'),
              stepIndex
            });
          }

          if (step.codeAction && !seenToolSteps.has(`edit-${stepIndex}`)) {
            seenToolSteps.add(`edit-${stepIndex}`);
            const rawUri = step.codeAction.uri || step.codeAction.actionSpec?.command?.file?.absoluteUri || step.codeAction.actionResult?.edit?.absoluteUri || '';
            const filePath = rawUri.replace(/^file:\/\//, '') || 'File';
            const fileName = filePath.split('/').filter(Boolean).pop() || filePath;
            const chunk = step.codeAction.replacementInfos?.[0]?.originalChunk;
            const startLine = chunk?.startLine;
            const endLine = chunk?.endLine;
            const rangeStr = (startLine !== undefined && endLine !== undefined) ? `L${startLine}-L${endLine}` : '';
            const diffStats = step.codeAction.diffStats;
            const statsStr = diffStats ? `(+${diffStats.additions || 0}, -${diffStats.deletions || 0})` : '';
            const label = `Edit: ${fileName}${rangeStr ? ` (${rangeStr})` : ''} ${statsStr}`.trim();
            const diff = step.codeAction.diff || step.codeAction.content || (chunk ? `@@ -${startLine},${(endLine - startLine + 1)} @@\n-${chunk.targetContent}\n+${chunk.replacementContent}` : '');
            const err = step.error?.shortError || step.error?.message || (typeof step.error === 'string' ? step.error : undefined);
            onUpdate({
              type: 'tool',
              toolType: 'edit',
              label,
              file: filePath,
              range: rangeStr,
              diff,
              error: err,
              status: step.status || (err ? 'CORTEX_STEP_STATUS_ERROR' : 'CORTEX_STEP_STATUS_DONE'),
              stepIndex
            });
          }

          if (step.notifyUser && !seenToolSteps.has(`notify-${stepIndex}`)) {
            seenToolSteps.add(`notify-${stepIndex}`);
            onUpdate({
              type: 'notify_user',
              stepIndex,
              content: step.notifyUser.notificationContent || '',
              reviewUris: step.notifyUser.reviewAbsoluteUris || [],
              isBlocking: Boolean(step.notifyUser.isBlocking),
              askForUserFeedback: Boolean(step.notifyUser.askForUserFeedback),
              confidence: step.notifyUser.confidenceScore || null
            });
          }

          if (step.searchWeb) {
            const query = step.searchWeb.query || '';
            const summary = step.searchWeb.summary || '';
            const err = step.error?.shortError || step.error?.message || (typeof step.error === 'string' ? step.error : undefined);
            const label = `Web Search: ${query || 'Search'}`;
            const output = summary || (err ? `Search failed: ${err}` : (query ? `Query: ${query}` : ''));
            const status = step.status || (err ? 'CORTEX_STEP_STATUS_ERROR' : (summary ? 'CORTEX_STEP_STATUS_DONE' : 'CORTEX_STEP_STATUS_RUNNING'));

            if (!seenToolSteps.has(`search-${stepIndex}`)) {
              seenToolSteps.add(`search-${stepIndex}`);
              onUpdate({
                type: 'tool',
                toolType: 'search',
                label,
                query,
                output,
                error: err,
                status,
                stepIndex
              });
            } else if (summary || err) {
              onUpdate({
                type: 'tool_output',
                output,
                error: err,
                status,
                stepIndex
              });
            }
          }

          if (step.listDirectory && !seenToolSteps.has(`list-${stepIndex}`)) {
            seenToolSteps.add(`list-${stepIndex}`);
            const rawUri = step.listDirectory.directoryPathUri || '';
            const dirPath = rawUri.replace(/^file:\/\//, '') || 'Directory';
            const dirName = dirPath.split('/').filter(Boolean).pop() || dirPath;
            const items = step.listDirectory.results || [];
            const label = step.metadata?.toolAction || `List: ${dirName} (${items.length} items)`;
            const err = step.error?.shortError || step.error?.message || (typeof step.error === 'string' ? step.error : undefined);

            const metaLines = [`Directory: ${dirPath}`, `Items found: ${items.length}`];
            if (items.length > 0) {
              metaLines.push('');
              items.forEach(item => {
                const typePrefix = item.isDir ? '📁 [DIR] ' : '📄 [FILE]';
                const sizeStr = item.sizeBytes ? ` (${Number(item.sizeBytes).toLocaleString()} bytes)` : '';
                metaLines.push(`${typePrefix} ${item.name}${sizeStr}`);
              });
            } else {
              metaLines.push('\n(Directory is empty)');
            }

            onUpdate({
              type: 'tool',
              toolType: 'list',
              label,
              directory: dirPath,
              output: metaLines.join('\n'),
              error: err,
              status: step.status || (err ? 'CORTEX_STEP_STATUS_ERROR' : 'CORTEX_STEP_STATUS_DONE'),
              stepIndex
            });
          }

          if (step.find && !seenToolSteps.has(`find-${stepIndex}`)) {
            seenToolSteps.add(`find-${stepIndex}`);
            const pattern = step.find.pattern || '';
            const dir = step.find.searchDirectory || '';
            const dirName = dir.split('/').filter(Boolean).pop() || dir;
            const label = step.metadata?.toolAction || `Find: "${pattern}" in ${dirName}`;
            const err = step.error?.shortError || step.error?.message || (typeof step.error === 'string' ? step.error : undefined);
            const out = [
              `Pattern: ${pattern}`,
              `Directory: ${dir}`,
              step.find.maxDepth ? `Max Depth: ${step.find.maxDepth}` : '',
              step.find.truncatedOutput ? `\nResults:\n${step.find.truncatedOutput}` : ''
            ].filter(Boolean).join('\n');

            onUpdate({
              type: 'tool',
              toolType: 'find',
              label,
              output: out,
              error: err,
              status: step.status || (err ? 'CORTEX_STEP_STATUS_ERROR' : 'CORTEX_STEP_STATUS_DONE'),
              stepIndex
            });
          }
        }

        if (status === 'CASCADE_RUN_STATUS_IDLE' || status.includes('IDLE') || status.includes('COMPLETED') || status === 'CORTEX_EXECUTABLE_STATUS_COMPLETED') {
          markDone();
        }
      });
    } finally {
      if (!abortSignal?.aborted) {
        markDone();
      }
    }
  }

  // 11. Stop execution
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
