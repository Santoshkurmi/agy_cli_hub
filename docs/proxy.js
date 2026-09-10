import http from 'http';
import fs from 'fs';
import path from 'path';

const TARGET_PORT = parseInt(process.env.TARGET_PORT || '8090', 10);
const LISTEN_PORT = parseInt(process.env.LISTEN_PORT || '8091', 10);
const BASE_TRAFFIC_DIR = process.env.TRAFFIC_DIR || process.env.LOG_DIR || path.join(process.cwd(), 'traffic_logs');

// Ensure base directories exist
const CHATS_DIR = path.join(BASE_TRAFFIC_DIR, 'chats');
const APIS_DIR = path.join(BASE_TRAFFIC_DIR, 'apis');
fs.mkdirSync(CHATS_DIR, { recursive: true });
fs.mkdirSync(APIS_DIR, { recursive: true });

console.log(`\x1b[1;36m╔═══════════════════════════════════════════════════════════════════════╗\x1b[0m`);
console.log(`\x1b[1;36m║\x1b[0m \x1b[1;37m✦ AGY HUB INTERCEPTOR & LIVE CHAT RPC ANALYZER ✦\x1b[0m                     \x1b[1;36m║\x1b[0m`);
console.log(`\x1b[1;36m╚═══════════════════════════════════════════════════════════════════════╝\x1b[0m`);
console.log(`\x1b[1;36m[Proxy]\x1b[0m Listening on port \x1b[1;32m${LISTEN_PORT}\x1b[0m -> Forwarding to \x1b[1;33m${TARGET_PORT}\x1b[0m`);
console.log(`\x1b[90mBase Traffic Directory:\x1b[0m \x1b[35m${BASE_TRAFFIC_DIR}\x1b[0m`);
console.log(`\x1b[90m  Chats Log Dir:       \x1b[34m${CHATS_DIR}\x1b[0m`);
console.log(`\x1b[90m  One-off APIs Dir:    \x1b[34m${APIS_DIR}\x1b[0m\n`);

// Helper to decode gRPC-Web frames from Buffer
function parseGrpcWebFrames(buf) {
  const frames = [];
  let offset = 0;
  while (offset + 5 <= buf.length) {
    const flag = buf[offset];
    const len = buf.readUInt32BE(offset + 1);
    if (offset + 5 + len > buf.length) break;
    const payload = buf.subarray(offset + 5, offset + 5 + len);
    offset += 5 + len;

    let json = null;
    const rawStr = payload.toString('utf-8');
    try {
      json = JSON.parse(rawStr);
    } catch {
      json = rawStr;
    }
    frames.push({
      flag: flag === 0x80 ? 'TRAILER' : 'DATA',
      length: len,
      payload: json,
      rawString: typeof json === 'string' ? json : undefined
    });
  }
  return { frames, remainder: buf.subarray(offset) };
}

// Clean endpoint name from URL
function extractEndpointName(urlStr) {
  const cleanUrl = urlStr.split('?')[0];
  const parts = cleanUrl.split('/');
  return parts[parts.length - 1] || 'unknown_rpc';
}

// Check if an endpoint is a chat state stream RPC
function isChatStreamRpc(endpoint, reqBody) {
  if (endpoint.includes('StreamAgentStateUpdates') || endpoint.includes('StreamCascadeUpdates')) {
    return true;
  }
  if (endpoint.includes('Stream') && (reqBody?.conversationId || reqBody?.cascadeId || reqBody?.conversation_id || reqBody?.cascade_id)) {
    return true;
  }
  return false;
}

// Extract conversation or cascade ID from request or response
function extractChatId(req, reqBody, firstFrame) {
  if (reqBody && typeof reqBody === 'object') {
    if (reqBody.conversationId) return reqBody.conversationId;
    if (reqBody.cascadeId) return reqBody.cascadeId;
    if (reqBody.conversation_id) return reqBody.conversation_id;
    if (reqBody.cascade_id) return reqBody.cascade_id;
  }
  if (req.headers['x-conversation-id']) return req.headers['x-conversation-id'];
  if (req.headers['x-cascade-id']) return req.headers['x-cascade-id'];

  try {
    const urlObj = new URL(req.url, 'http://127.0.0.1');
    const queryId = urlObj.searchParams.get('conversationId') || urlObj.searchParams.get('cascadeId');
    if (queryId) return queryId;
  } catch {}

  if (firstFrame?.payload?.update) {
    const u = firstFrame.payload.update;
    if (u.trajectoryId) return u.trajectoryId;
    if (u.conversationId) return u.conversationId;
    if (u.cascadeId) return u.cascadeId;
  }

  return null;
}

// Find next available session number for a chat ID
function getNextSessionIndex(chatDir) {
  if (!fs.existsSync(chatDir)) return 1;
  const entries = fs.readdirSync(chatDir, { withFileTypes: true });
  let maxIdx = 0;
  for (const entry of entries) {
    const match = entry.name.match(/^session_(\d+)/i) || entry.name.match(/_(\d+)\./);
    if (match) {
      const idx = parseInt(match[1], 10);
      if (idx > maxIdx) maxIdx = idx;
    }
  }
  return maxIdx + 1;
}

// Unified helper to extract tool info from AGY 2.0 / CLI Hub steps
function parseStepToolInfo(step) {
  const meta = step.metadata || {};
  const toolCall = meta.toolCall || {};
  const toolName = toolCall.name || '';
  const generic = step.generic || {};
  const args = generic.args || {};
  const result = generic.result || {};
  const payload = result.payload || {};
  const status = step.status || 'UNKNOWN';
  const reqInteraction = step.requestedInteraction;

  let toolType = toolName;
  if (!toolType) {
    if (step.runCommand || args.CommandLine) toolType = 'run_command';
    else if (step.viewFile || args.AbsolutePath) toolType = 'view_file';
    else if (step.codeAction || args.ReplacementChunks || (args.TargetFile && args.CodeContent)) toolType = args.CodeContent ? 'write_to_file' : 'replace_file_content';
    else if (step.searchWeb || args.query) toolType = 'search_web';
    else if (step.listDirectory || args.DirectoryPath) toolType = 'list_dir';
    else if (step.find || args.Pattern) toolType = 'find_by_name';
    else if (step.generateImage || args.Prompt) toolType = 'generate_image';
    else if (reqInteraction) toolType = 'requestedInteraction';
    else if (step.type === 'CORTEX_STEP_TYPE_GENERIC' && Object.keys(args).length > 0) toolType = 'generic_tool';
  }

  if (!toolType && !step.runCommand && !step.viewFile && !step.codeAction && !step.searchWeb && !step.listDirectory && !step.find && !step.generateImage && !reqInteraction) {
    return null;
  }

  const command = args.CommandLine || step.runCommand?.commandLine || step.runCommand?.proposedCommandLine || '';
  const file = (args.TargetFile || args.AbsolutePath || step.viewFile?.absolutePathUri || step.viewFile?.uri || step.codeAction?.uri || '').replace(/^file:\/\//, '');
  const query = args.query || args.Query || step.searchWeb?.query || '';
  const dir = (args.DirectoryPath || args.SearchDirectory || step.listDirectory?.directoryPathUri || step.find?.searchDirectory || '').replace(/^file:\/\//, '');
  const prompt = args.Prompt || step.generateImage?.prompt || '';
  const actionLabel = meta.toolAction || args.toolAction || meta.toolSummary || args.toolSummary || '';

  let output = '';
  let exitCode = undefined;

  const rc = payload.runCommand || step.runCommand;
  if (rc) {
    output = rc.combinedOutput?.full || rc.output || '';
    exitCode = rc.exitCode;
  }
  const sw = payload.searchWeb || step.searchWeb;
  if (sw) {
    output = sw.summary || JSON.stringify(sw.results || []);
  }
  const vf = payload.viewFile || step.viewFile;
  if (vf && vf.content) {
    output = typeof vf.content === 'string' ? `(${vf.content.length} chars)` : '';
  }
  const ca = payload.codeAction || step.codeAction;
  if (ca) {
    output = ca.diff || (ca.diffStats ? `+${ca.diffStats.additions || 0}, -${ca.diffStats.deletions || 0}` : '');
  }
  const ld = payload.listDirectory || step.listDirectory;
  if (ld) {
    output = `${ld.results?.length || 0} items`;
  }
  const mcp = payload.mcpTool;
  if (mcp) {
    output = JSON.stringify(mcp.result || mcp.output || '');
  }
  if (!output && result.fullOutputUri) {
    output = `[Full output at ${result.fullOutputUri}]`;
  }

  return {
    toolType: toolType || 'tool',
    status,
    actionLabel,
    command,
    file,
    query,
    dir,
    prompt,
    output,
    exitCode,
    args,
    error: step.error?.shortError || step.error?.message
  };
}

// Turn-by-turn chat reconstructor (matches Web UI agyClient.js logic)
function reconstructChatTurns(steps) {
  const turns = [];
  let currentAssistant = null;

  (steps || []).forEach((step, idx) => {
    const stepIndex = step.metadata?.sourceTrajectoryStepInfo?.stepIndex ?? idx;
    if (step.userInput) {
      const rawText = step.userInput.userResponse || step.userInput.items?.[0]?.text || '';
      let cleanText = rawText;
      const userReqMatch = rawText.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i);
      if (userReqMatch) {
        cleanText = userReqMatch[1].trim();
      } else {
        cleanText = cleanText
          .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, '')
          .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/gi, '')
          .replace(/<system_instructions>[\s\S]*?<\/system_instructions>/gi, '')
          .trim();
      }

      turns.push({
        role: 'user',
        stepIndex,
        content: cleanText
      });
      currentAssistant = { role: 'assistant', steps: [] };
      turns.push(currentAssistant);
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
      } else {
        const toolInfo = parseStepToolInfo(step);
        if (toolInfo) {
          currentAssistant.steps.push({
            stepIndex,
            type: 'tool',
            ...toolInfo
          });
        }
      }
    }
  });

  return turns;
}

// Live Session Analyzer class for a Chat Stream
class ChatStreamSessionTracker {
  constructor(chatId, sessionIndex, endpoint, requestPayload) {
    this.chatId = chatId;
    this.sessionIndex = sessionIndex;
    this.endpoint = endpoint;
    this.requestPayload = requestPayload;
    this.startTime = new Date();
    this.endTime = null;

    this.sessionDir = path.join(CHATS_DIR, chatId, `session_${sessionIndex}`);
    fs.mkdirSync(this.sessionDir, { recursive: true });

    this.rawJsonlPath = path.join(this.sessionDir, 'stream_raw.jsonl');
    this.framesJsonPath = path.join(this.sessionDir, 'stream_frames.json');
    this.analysisJsonPath = path.join(this.sessionDir, 'live_analysis.json');
    this.turnsJsonPath = path.join(this.sessionDir, 'reconstructed_chat.json');
    this.summaryMdPath = path.join(this.sessionDir, 'summary.md');

    // Also write flat convenience files
    this.convenienceRawPath = path.join(CHATS_DIR, chatId, `session_${sessionIndex}_raw.jsonl`);
    this.convenienceAnalysisPath = path.join(CHATS_DIR, chatId, `session_${sessionIndex}_analysis.json`);

    this.frames = [];
    this.initialSync = null;
    this.liveDeltas = [];
    this.toolCallsMap = new Map(); // key: stepIndex -> tool summary object
    this.thinkingOffsets = new Map(); // stepIndex -> last recorded length
    this.responseOffsets = new Map(); // stepIndex -> last recorded length
    this.latestSteps = [];
    this.statusHistory = [];

    console.log(`\x1b[1;32m[CHAT STREAM 💬 ${this.chatId}]\x1b[0m Starting \x1b[1;33mSession #${this.sessionIndex}\x1b[0m`);
    console.log(`  \x1b[90mSession Directory:\x1b[0m ${this.sessionDir}`);
  }

  processFrame(frame, frameIndex) {
    const timestamp = new Date().toISOString();
    const isChunkZero = (frameIndex === 0 && frame.flag === 'DATA');

    // 1. Live append raw frame to JSONL immediately
    const rawEntry = {
      frameIndex: frameIndex + 1,
      timestamp,
      flag: frame.flag,
      length: frame.length,
      payload: frame.payload
    };
    fs.appendFileSync(this.rawJsonlPath, JSON.stringify(rawEntry) + '\n');
    try {
      fs.appendFileSync(this.convenienceRawPath, JSON.stringify(rawEntry) + '\n');
    } catch {}

    this.frames.push(rawEntry);

    // If frame is just a gRPC trailer or empty, record status and return
    if (frame.flag === 'TRAILER') {
      console.log(`  \x1b[90m[Frame #${frameIndex + 1}]\x1b[0m \x1b[33m[gRPC-Web TRAILER]\x1b[0m Stream end signal received`);
      this.flushToDisk();
      return;
    }

    const update = frame.payload?.update;
    const status = update?.status || update?.executableStatus || update?.executorLoopStatus || '';
    if (status && !this.statusHistory.includes(status)) {
      this.statusHistory.push(status);
    }

    const stepsUpdate = update?.mainTrajectoryUpdate?.stepsUpdate;
    const steps = stepsUpdate?.steps || [];
    const indices = stepsUpdate?.indices || [];
    const totalLength = stepsUpdate?.totalLength ?? steps.length;

    // Check execution errors
    const execMetas = update?.mainTrajectoryUpdate?.executorMetadatasUpdate?.executorMetadatas || [];
    const executionErrors = [];
    for (const meta of execMetas) {
      if (meta.executionError) {
        executionErrors.push({
          executionId: meta.executionId,
          lastStepIdx: meta.lastStepIdx,
          error: meta.executionError
        });
      }
    }

    // --- CHUNK 0: INITIAL SYNC (CONNECTED AT ONCE) ---
    if (isChunkZero) {
      this.latestSteps = [...steps];
      const initialTurns = reconstructChatTurns(steps);
      const userTurns = initialTurns.filter(t => t.role === 'user');
      const assistantTurns = initialTurns.filter(t => t.role === 'assistant');

      // Pre-seed offsets & tools for past steps so live deltas calculate cleanly
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepIdx = step.metadata?.sourceTrajectoryStepInfo?.stepIndex ?? (indices[i] !== undefined ? indices[i] : i);
        if (step.plannerResponse?.thinking) {
          this.thinkingOffsets.set(stepIdx, step.plannerResponse.thinking.length);
        }
        if (step.plannerResponse?.response) {
          this.responseOffsets.set(stepIdx, step.plannerResponse.response.length);
        }
        this.inspectTool(step, stepIdx, 1, 'INITIAL_SYNC');
      }

      this.initialSync = {
        frameIndex: 1,
        timestamp,
        status,
        totalSteps: steps.length,
        reportedTotalLength: totalLength,
        userTurnsCount: userTurns.length,
        assistantTurnsCount: assistantTurns.length,
        preExistingToolsCount: this.toolCallsMap.size,
        executionErrors: executionErrors.length > 0 ? executionErrors : undefined
      };

      console.log(`  \x1b[1;36m[Frame #1 - INITIAL SYNC]\x1b[0m ${steps.length} steps loaded, status: \x1b[1;33m${status || 'UNKNOWN'}\x1b[0m, ${this.toolCallsMap.size} past tools`);
    } else {
      // --- CHUNKS 1+: LIVE STREAMING DELTAS ---
      const deltaSummary = {
        frameIndex: frameIndex + 1,
        timestamp,
        status,
        stepsReceived: steps.length,
        thinkingDeltas: [],
        responseDeltas: [],
        toolsDetected: [],
        executionErrors: executionErrors.length > 0 ? executionErrors : undefined
      };

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepIdx = step.metadata?.sourceTrajectoryStepInfo?.stepIndex ?? (indices[i] !== undefined ? indices[i] : i);

        // Update latest steps cache
        if (stepIdx !== undefined) {
          this.latestSteps[stepIdx] = step;
        }

        // 1. Thinking Delta
        if (step.plannerResponse?.thinking) {
          const full = step.plannerResponse.thinking;
          const prevLen = this.thinkingOffsets.get(stepIdx) || 0;
          if (full.length > prevLen) {
            const delta = full.slice(prevLen);
            this.thinkingOffsets.set(stepIdx, full.length);
            deltaSummary.thinkingDeltas.push({
              stepIndex: stepIdx,
              deltaChars: delta.length,
              sample: delta.length > 80 ? delta.slice(0, 80) + '...' : delta,
              totalLength: full.length
            });
          }
        }

        // 2. Response Prose Delta
        if (step.plannerResponse?.response) {
          const full = step.plannerResponse.response;
          const prevLen = this.responseOffsets.get(stepIdx) || 0;
          if (full.length > prevLen) {
            const delta = full.slice(prevLen);
            this.responseOffsets.set(stepIdx, full.length);
            deltaSummary.responseDeltas.push({
              stepIndex: stepIdx,
              deltaChars: delta.length,
              sample: delta.length > 80 ? delta.slice(0, 80) + '...' : delta,
              totalLength: full.length
            });
          }
        }

        // 3. Tool Event Detection
        const toolInfo = this.inspectTool(step, stepIdx, frameIndex + 1, 'LIVE_DELTA');
        if (toolInfo) {
          deltaSummary.toolsDetected.push(toolInfo);
        }
      }

      this.liveDeltas.push(deltaSummary);

      // Console log live delta summary
      let logParts = [];
      if (deltaSummary.thinkingDeltas.length > 0) {
        const tChars = deltaSummary.thinkingDeltas.reduce((a, b) => a + b.deltaChars, 0);
        logParts.push(`\x1b[35mThinking: +${tChars}c\x1b[0m`);
      }
      if (deltaSummary.responseDeltas.length > 0) {
        const rChars = deltaSummary.responseDeltas.reduce((a, b) => a + b.deltaChars, 0);
        logParts.push(`\x1b[32mResponse: +${rChars}c\x1b[0m`);
      }
      if (deltaSummary.toolsDetected.length > 0) {
        const tNames = deltaSummary.toolsDetected.map(t => `${t.toolType} (${t.status})`).join(', ');
        logParts.push(`\x1b[1;33mTool: ${tNames}\x1b[0m`);
      }
      if (status && status !== 'CASCADE_RUN_STATUS_RUNNING') {
        logParts.push(`\x1b[90mStatus: ${status}\x1b[0m`);
      }

      const logMsg = logParts.length > 0 ? logParts.join(' | ') : `Delta frame (${steps.length} steps)`;
      console.log(`  \x1b[90m[Frame #${frameIndex + 1} - LIVE DELTA]\x1b[0m ${logMsg}`);
    }

    // Flush structured analysis and reconstructed chat to disk after every frame!
    this.flushToDisk();
  }

  inspectTool(step, stepIndex, frameNumber, origin) {
    const info = parseStepToolInfo(step);
    if (!info) return null;

    const details = {
      ...(info.actionLabel ? { label: info.actionLabel } : {}),
      ...(info.command ? { command: info.command } : {}),
      ...(info.file ? { file: info.file } : {}),
      ...(info.query ? { query: info.query } : {}),
      ...(info.dir ? { dir: info.dir } : {}),
      ...(info.prompt ? { prompt: info.prompt } : {}),
      ...(info.output ? { output: info.output } : {}),
      ...(info.exitCode !== undefined ? { exitCode: info.exitCode } : {})
    };

    const existing = this.toolCallsMap.get(stepIndex);
    const updated = {
      stepIndex,
      toolType: info.toolType,
      status: info.status,
      origin: existing ? existing.origin : origin,
      firstSeenFrame: existing ? existing.firstSeenFrame : frameNumber,
      lastUpdatedFrame: frameNumber,
      details: { ...(existing?.details || {}), ...details },
      error: info.error
    };
    this.toolCallsMap.set(stepIndex, updated);
    return updated;
  }

  flushToDisk() {
    try {
      // 1. Full frames array
      fs.writeFileSync(this.framesJsonPath, JSON.stringify(this.frames, null, 2));

      // 2. Deep analysis JSON
      const analysisData = {
        chatId: this.chatId,
        sessionIndex: this.sessionIndex,
        endpoint: this.endpoint,
        startTime: this.startTime.toISOString(),
        endTime: this.endTime ? this.endTime.toISOString() : null,
        durationSeconds: this.endTime ? ((this.endTime.getTime() - this.startTime.getTime()) / 1000).toFixed(2) : ((Date.now() - this.startTime.getTime()) / 1000).toFixed(2),
        totalFramesLogged: this.frames.length,
        statusTransitions: this.statusHistory,
        initialSync: this.initialSync,
        liveDeltasCount: this.liveDeltas.length,
        liveDeltas: this.liveDeltas,
        toolCallsSummary: Array.from(this.toolCallsMap.values())
      };
      fs.writeFileSync(this.analysisJsonPath, JSON.stringify(analysisData, null, 2));
      try {
        fs.writeFileSync(this.convenienceAnalysisPath, JSON.stringify(analysisData, null, 2));
      } catch {}

      // 3. Reconstructed Turn-by-Turn Chat
      const reconstructedTurns = reconstructChatTurns(this.latestSteps);
      fs.writeFileSync(this.turnsJsonPath, JSON.stringify(reconstructedTurns, null, 2));

      // 4. Clean Markdown summary
      this.writeSummaryMarkdown(analysisData, reconstructedTurns);
    } catch (err) {
      console.error(`Error flushing session to disk:`, err.message);
    }
  }

  writeSummaryMarkdown(analysis, turns) {
    let md = `# AGY Hub Chat Stream Analysis\n\n`;
    md += `* **Chat ID:** \`${this.chatId}\`\n`;
    md += `* **Session Index:** #${this.sessionIndex}\n`;
    md += `* **Endpoint:** \`${this.endpoint}\`\n`;
    md += `* **Started At:** ${this.startTime.toISOString()}\n`;
    md += `* **Ended At:** ${this.endTime ? this.endTime.toISOString() : 'Active Streaming...'}\n`;
    md += `* **Total Frames:** ${this.frames.length}\n`;
    md += `* **Status History:** ${this.statusHistory.map(s => `\`${s}\``).join(' -> ') || 'N/A'}\n\n`;

    md += `## 1. Initial Sync vs Live Deltas\n\n`;
    md += `| Mode | Frame | Steps | Tools Detected | Description |\n`;
    md += `|---|---|---|---|---|\n`;
    if (this.initialSync) {
      md += `| **INITIAL SYNC (Chunk 0)** | Frame #1 | ${this.initialSync.totalSteps} | ${this.initialSync.preExistingToolsCount} | History loaded at connection time |\n`;
    } else {
      md += `| **INITIAL SYNC (Chunk 0)** | N/A | 0 | 0 | No initial chunk recorded yet |\n`;
    }
    md += `| **LIVE DELTAS** | Frames #2-${this.frames.length} | - | ${this.toolCallsMap.size} | ${this.liveDeltas.length} incremental stream updates |\n\n`;

    md += `## 2. Tool Invocations Breakdown\n\n`;
    if (this.toolCallsMap.size === 0) {
      md += `*No tool invocations recorded in this session.*\n\n`;
    } else {
      md += `| Step | Tool | Status | Origin | Details |\n`;
      md += `|---|---|---|---|---|\n`;
      for (const t of this.toolCallsMap.values()) {
        const detStr = Object.entries(t.details).map(([k, v]) => `${k}: \`${typeof v === 'string' && v.length > 50 ? v.slice(0, 50) + '...' : v}\``).join(', ');
        md += `| **Step ${t.stepIndex}** | \`${t.toolType}\` | \`${t.status}\` | ${t.origin} | ${detStr || 'None'} |\n`;
      }
      md += `\n`;
    }

    md += `## 3. Reconstructed Turns Overview (${turns.length} turns)\n\n`;
    turns.forEach((turn, i) => {
      if (turn.role === 'user') {
        md += `### User Turn (Step ${turn.stepIndex})\n`;
        md += `> ${turn.content.replace(/\n/g, '\n> ')}\n\n`;
      } else {
        md += `### Assistant Turn (${turn.steps.length} events)\n`;
        turn.steps.forEach(st => {
          if (st.type === 'planner') {
            if (st.thinking) md += `* **[Step ${st.stepIndex}] Thinking:** \`${st.thinking.slice(0, 100)}...\`\n`;
            if (st.content) md += `* **[Step ${st.stepIndex}] Content:** ${st.content.slice(0, 120)}...\n`;
          } else if (st.type === 'tool') {
            md += `* **[Step ${st.stepIndex}] Tool:** \`${st.toolType}\` (\`${st.status}\`)\n`;
          }
        });
        md += `\n`;
      }
    });

    fs.writeFileSync(this.summaryMdPath, md);
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.endTime = new Date();
    const duration = ((this.endTime.getTime() - this.startTime.getTime()) / 1000).toFixed(2);
    this.flushToDisk();
    console.log(`\x1b[1;32m[CHAT STREAM 💬 ${this.chatId}]\x1b[0m Session #${this.sessionIndex} closed (\x1b[33m${duration}s\x1b[0m, \x1b[36m${this.frames.length} frames\x1b[0m)`);
  }
}

// Log standard one-off API requests
function writeApiLog(endpointName, req, reqBody, proxyRes, resFrames, resRaw, requestId) {
  const safeEndpoint = endpointName.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const endpointDir = path.join(APIS_DIR, safeEndpoint);
  fs.mkdirSync(endpointDir, { recursive: true });

  const timestampStr = new Date().toISOString().replace(/:/g, '-');
  const filename = `${timestampStr}_${req.method}_${requestId}.json`;
  const filePath = path.join(endpointDir, filename);

  const entry = {
    requestId,
    timestamp: new Date().toISOString(),
    endpoint: endpointName,
    method: req.method,
    url: req.url,
    headers: req.headers,
    requestPayload: reqBody,
    responseStatus: proxyRes.statusCode,
    responseHeaders: proxyRes.headers,
    responseFrames: resFrames.length > 0 ? resFrames : undefined,
    responseRaw: resFrames.length === 0 && resRaw.length > 0 ? resRaw.toString('utf-8') : undefined
  };

  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
  console.log(`  \x1b[90mAPI traffic saved to:\x1b[0m \x1b[34m${path.relative(process.cwd(), filePath)}\x1b[0m`);
}

// Main Proxy Server
const server = http.createServer((req, res) => {
  const requestId = Math.random().toString(36).substring(2, 9);
  const endpointName = extractEndpointName(req.url);

  let reqChunks = [];
  req.on('data', chunk => reqChunks.push(chunk));

  req.on('end', () => {
    const reqBuffer = Buffer.concat(reqChunks);

    // Parse request payload
    let requestPayload = null;
    if (reqBuffer.length >= 5 && req.headers['content-type']?.includes('grpc-web')) {
      const { frames } = parseGrpcWebFrames(reqBuffer);
      requestPayload = frames.length === 1 ? frames[0].payload : frames.map(f => f.payload);
    } else if (reqBuffer.length > 0) {
      try {
        requestPayload = JSON.parse(reqBuffer.toString('utf-8'));
      } catch {
        requestPayload = reqBuffer.toString('utf-8');
      }
    }

    const isChatStream = isChatStreamRpc(endpointName, requestPayload);
    let chatId = isChatStream ? extractChatId(req, requestPayload, null) : null;

    console.log(`\x1b[1;35m[--> REQ ${requestId}]\x1b[0m \x1b[1;37m${req.method}\x1b[0m \x1b[36m${endpointName}\x1b[0m${chatId ? ` (Chat: \x1b[1;33m${chatId}\x1b[0m)` : ''}`);
    if (requestPayload && typeof requestPayload === 'object') {
      const summaryStr = JSON.stringify(requestPayload);
      console.log(`  \x1b[90mBody:\x1b[0m ${summaryStr.length > 140 ? summaryStr.slice(0, 140) + '...' : summaryStr}`);
    }

    // Forward request to target daemon
    const options = {
      hostname: '127.0.0.1',
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${TARGET_PORT}` }
    };

    let sessionTracker = null;
    let frameCounter = 0;
    let resBuffer = Buffer.alloc(0);
    const nonChatFrames = [];

    // If chat ID is already known at request time, create tracker immediately
    if (isChatStream && chatId) {
      const chatDir = path.join(CHATS_DIR, chatId);
      const sessionIndex = getNextSessionIndex(chatDir);
      sessionTracker = new ChatStreamSessionTracker(chatId, sessionIndex, endpointName, requestPayload);
    }

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);

      proxyRes.on('data', chunk => {
        res.write(chunk);
        resBuffer = Buffer.concat([resBuffer, Buffer.from(chunk)]);

        // Decode gRPC-Web frames as they arrive live
        if (req.headers['content-type']?.includes('grpc-web') || proxyRes.headers['content-type']?.includes('grpc-web')) {
          const { frames, remainder } = parseGrpcWebFrames(resBuffer);
          if (frames.length > 0) {
            resBuffer = remainder;

            frames.forEach(frame => {
              // If this is a chat stream but chatId was unknown, extract from first response frame
              if (isChatStream && !sessionTracker) {
                chatId = extractChatId(req, requestPayload, frame) || `chat_${requestId}`;
                const chatDir = path.join(CHATS_DIR, chatId);
                const sessionIndex = getNextSessionIndex(chatDir);
                sessionTracker = new ChatStreamSessionTracker(chatId, sessionIndex, endpointName, requestPayload);
              }

              if (sessionTracker) {
                sessionTracker.processFrame(frame, frameCounter++);
              } else {
                nonChatFrames.push(frame);
              }
            });
          }
        }
      });

      proxyRes.on('end', () => {
        res.end();
        console.log(`\x1b[1;32m[<-- RES ${requestId}]\x1b[0m \x1b[37m${proxyRes.statusCode}\x1b[0m (${frameCounter || nonChatFrames.length} frames)`);

        if (sessionTracker) {
          sessionTracker.finish();
        } else {
          writeApiLog(endpointName, req, requestPayload, proxyRes, nonChatFrames, resBuffer, requestId);
        }
      });
    });

    proxyReq.on('error', (err) => {
      console.error(`\x1b[1;31m[PROXY ERROR ${requestId}]\x1b[0m`, err.message);
      if (sessionTracker) {
        sessionTracker.finish();
      }
      res.statusCode = 502;
      res.end(`Proxy Error: ${err.message}`);
    });

    res.on('close', () => {
      if (!res.writableEnded) {
        if (sessionTracker) {
          sessionTracker.finish();
        }
        if (!proxyReq.destroyed) {
          proxyReq.destroy();
        }
      }
    });

    proxyReq.write(reqBuffer);
    proxyReq.end();
  });
});

server.listen(LISTEN_PORT, () => {
  console.log(`\x1b[1;32m✓ AGY Hub Proxy is live on http://127.0.0.1:${LISTEN_PORT}\x1b[0m`);
  console.log(`\x1b[90mPoint your Web UI or Android antiGem client to port ${LISTEN_PORT} to capture and analyze all traffic in real time.\x1b[0m\n`);
});
