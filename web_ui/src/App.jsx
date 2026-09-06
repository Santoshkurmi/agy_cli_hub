import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Plus,
  Send,
  Square,
  Brain,
  Terminal,
  Cpu,
  ChevronDown,
  ChevronUp,
  Zap,
  Settings,
  RefreshCw,
  FileText,
  Search,
  Code,
  Folder,
  FolderGit2,
  Check,
  X,
  Lock,
  Bell,
  Play,
  Loader2,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  Info
} from 'lucide-react';
import { AntigravityBrowserClient } from './agyClient';

const client = new AntigravityBrowserClient('http://127.0.0.1:8090');

const getSavedWorkspaces = () => {
  try {
    return JSON.parse(localStorage.getItem('agy_session_workspaces') || '{}');
  } catch {
    return {};
  }
};

const saveSessionWorkspace = (sessionId, path, projId) => {
  try {
    const saved = getSavedWorkspaces();
    saved[sessionId] = { workspaceDir: path, projectId: projId };
    localStorage.setItem('agy_session_workspaces', JSON.stringify(saved));
  } catch (e) {
    console.warn('Failed to save session workspace:', e);
  }
};

export default function App() {
  const [hubUrl, setHubUrl] = useState('http://127.0.0.1:8090');
  const [connected, setConnected] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [thinkingBudget, setThinkingBudget] = useState(8192);
  const [autoExecutionPolicy, setAutoExecutionPolicy] = useState(() => {
    return localStorage.getItem('agy_auto_exec_policy') || 'EAGER';
  });

  // Projects and Workspace Folders
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('default-cli-project');
  const [workspaceDir, setWorkspaceDir] = useState('/home/cat/agy_cli_hub');
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [modalMode, setModalMode] = useState('new');
  const [tempCustomPath, setTempCustomPath] = useState('/home/cat/agy_cli_hub');
  const [tempSelectedProjectId, setTempSelectedProjectId] = useState('default-cli-project');

  const [messages, setMessages] = useState([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [collapsedThinking, setCollapsedThinking] = useState({});
  const [collapsedTools, setCollapsedTools] = useState({});
  const [showConfig, setShowConfig] = useState(false);

  // Global Toast Notifications
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'error') => {
    const id = Date.now() + Math.random().toString(36).slice(2, 6);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);  // for stop button (CancelCascadeInvocation)
  const streamControllerRef = useRef(null); // for the one persistent stream per session
  const turnStartStepRef = useRef(0);        // updated before each sendMessage
  const totalStepsRef = useRef(0);           // tracked from StreamAgentStateUpdates
  const isGeneratingRef = useRef(false);
  const newSessionsNeedingTitleRef = useRef(new Set());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const hasInitializedRef = useRef(false);

  // Initial connect & load (runs once on mount, guarded against duplicate executions)
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    client.setBaseUrl(hubUrl);
    connectAndLoad();
  }, []);

  const connectAndLoad = async () => {
    try {
      console.log('[UI] Initializing client connection...');
      await client.initCsrfToken();
      setConnected(true);

      // 1. Fetch available models
      console.log('[UI] Fetching available models...');
      const availableModels = await client.getAvailableModels();
      setModels(availableModels);
      if (availableModels.length > 0 && !selectedModel) {
        const preferred = availableModels.find(m => m.key.includes('3.8')) || availableModels[0];
        setSelectedModel(preferred.modelEnum);
      }

      // 2. Fetch projects
      console.log('[UI] Fetching registered projects...');
      try {
        const pList = await client.listProjects();
        const defaultList = [
          { id: 'agy-cli-hub', name: 'agy_cli_hub', path: '/home/cat/agy_cli_hub', folderUri: 'file:///home/cat/agy_cli_hub' },
          ...pList.filter(p => p.path && p.path !== '/home/cat/agy_cli_hub')
        ];
        setProjects(defaultList);
      } catch (err) {
        console.warn('Failed to load projects:', err);
      }

      // 3. Fetch conversations list
      console.log('[UI] Fetching conversations list...');
      const convList = await client.listConversations();
      setConversations(convList);
      convList.forEach(c => {
        if (c.stepCount === 0 || (c.title && c.title.startsWith('Session ('))) {
          newSessionsNeedingTitleRef.current.add(c.id);
        }
      });
      if (convList.length > 0 && !activeSessionId) {
        selectConversation(convList[0].id);
      }
    } catch (err) {
      console.warn('[UI] Connect check failed:', err.message);
      setConnected(false);
      showToast(`Daemon connection failed: ${err.message}`, 'error');
    }
  };

  const openNewSessionModal = () => {
    setModalMode('new');
    setTempCustomPath(workspaceDir || '/home/cat/agy_cli_hub');
    setTempSelectedProjectId(selectedProjectId || 'default-cli-project');
    setShowProjectModal(true);
  };

  const handleConfirmProject = async (path, projId) => {
    const finalPath = (path || '').trim() || '/home/cat/agy_cli_hub';
    const finalProjId = projId || 'default-cli-project';
    setWorkspaceDir(finalPath);
    setSelectedProjectId(finalProjId);
    setShowProjectModal(false);

    const projObj = projects.find(p => p.id === finalProjId);
    const projName = projObj?.name || finalPath.split('/').filter(Boolean).pop() || 'Workspace';

    try {
      const modelToUse = selectedModel || models[0]?.modelEnum || 'MODEL_PLACEHOLDER_M319';
      const cascadeId = await client.startConversation(modelToUse, finalPath, finalProjId);
      newSessionsNeedingTitleRef.current.add(cascadeId);
      saveSessionWorkspace(cascadeId, finalPath, finalProjId);
      const newChat = {
        id: cascadeId,
        title: `Session (${projName})`,
        lastModified: new Date().toISOString(),
        stepCount: 0,
        workspaceDir: finalPath,
        projectId: finalProjId
      };
      setConversations(prev => [newChat, ...prev]);
      setActiveSessionId(cascadeId);
      setMessages([
        { role: 'system', content: `Workspace initialized: ${finalPath} [${projName}]` }
      ]);
      showToast(`Session created in ${projName}`, 'success');
      // Open ONE persistent stream for the newly created conversation
      startPersistentStream(cascadeId);
    } catch (err) {
      console.error('Failed to start session:', err);
      showToast(`Failed to start session: ${err.message}`, 'error');
    }
  };

  // ---- Persistent stream management ----
  // Starts ONE long-lived StreamAgentStateUpdates connection for a session.
  // Stays open across all turns; turnStartStepRef controls which steps are
  // routed to the current assistant bubble.
  const startPersistentStream = (sessionId) => {
    // Abort any existing stream for this session
    if (streamControllerRef.current) {
      streamControllerRef.current.abort();
      streamControllerRef.current = null;
    }
    if (!sessionId) return;

    const controller = new AbortController();
    streamControllerRef.current = controller;

    // Pass a getter so the stream reads the current turn boundary dynamically
    client.streamUpdates(
      sessionId,
      (update) => {
        if (update.type === 'init') {
          totalStepsRef.current = update.totalLength || 0;
          turnStartStepRef.current = update.totalLength || 0;
          if (update.messages && update.messages.length > 0) {
            setMessages(update.messages);
          }
          if (update.isRunning) {
            setIsGenerating(true);
            isGeneratingRef.current = true;
          } else {
            setIsGenerating(false);
            isGeneratingRef.current = false;
          }
          return;
        }

        if (update.type === 'step_count') {
          totalStepsRef.current = update.totalLength;
          return;
        }

        if (update.stepIndex !== undefined && update.stepIndex >= totalStepsRef.current) {
          totalStepsRef.current = update.stepIndex + 1;
        }

        if (update.type === 'done') {
          const wasGenerating = isGeneratingRef.current;
          isGeneratingRef.current = false;
          setIsGenerating(false);

          // Only fetch conversation list once: after the first response of a NEW chat,
          // so its sidebar title updates from the placeholder to the model-generated title.
          // Never call it when switching chats or on subsequent messages in existing chats.
          if (wasGenerating && newSessionsNeedingTitleRef.current.has(sessionId)) {
            newSessionsNeedingTitleRef.current.delete(sessionId);
            client.listConversations().then(remoteList => {
              const saved = getSavedWorkspaces();
              setConversations(prev => remoteList.map(remote => {
                const existing = prev.find(p => p.id === remote.id);
                return {
                  ...remote,
                  workspaceDir: existing?.workspaceDir || saved[remote.id]?.workspaceDir || '/home/cat/agy_cli_hub',
                  projectId: existing?.projectId || saved[remote.id]?.projectId || 'default-cli-project'
                };
              }));
            });
          }
          return;
        }

        setMessages(prev => {
          const clone = [...prev];
          const lastIdx = clone.length - 1;
          if (lastIdx < 0 || clone[lastIdx].role !== 'assistant') return clone;

          const last = { ...clone[lastIdx], steps: [...(clone[lastIdx].steps || [])] };
          clone[lastIdx] = last;

          let stepObj = last.steps.find(s => s.stepIndex === update.stepIndex);

          if (update.type === 'thinking') {
            const thinkingText = update.full !== undefined ? update.full : ((stepObj?.thinking || '') + (update.delta || ''));
            let thinkStep = last.steps.find(s => s.type === 'planner' && (s.stepIndex === update.stepIndex || (s.thinking && !s.content)));
            if (!thinkStep) {
              thinkStep = { stepIndex: update.stepIndex, type: 'planner', thinking: thinkingText, content: '' };
              last.steps.push(thinkStep);
            } else {
              const sIdx = last.steps.indexOf(thinkStep);
              last.steps[sIdx] = { ...thinkStep, stepIndex: update.stepIndex, thinking: thinkingText };
            }
          } else if (update.type === 'content') {
            const contentText = update.full !== undefined ? update.full : ((stepObj?.content || '') + (update.delta || ''));
            let contentStep = last.steps.find(s => s.type === 'planner' && (s.stepIndex === update.stepIndex || Boolean(s.content)));
            if (!contentStep) {
              contentStep = { stepIndex: update.stepIndex, type: 'planner', thinking: '', content: contentText };
              last.steps.push(contentStep);
            } else {
              const sIdx = last.steps.indexOf(contentStep);
              last.steps[sIdx] = { ...contentStep, stepIndex: update.stepIndex, content: contentText };
            }
          } else if (update.type === 'tool') {
            const prevRetryIdx = (update.toolType === 'command' && update.command)
              ? last.steps.findIndex(s => s.toolType === 'command' && s.command === update.command && (!s.output || s.isWaiting || s.isProposed))
              : -1;
            if (prevRetryIdx !== -1) {
              last.steps[prevRetryIdx] = { ...last.steps[prevRetryIdx], ...update };
            } else if (!stepObj) {
              stepObj = { stepIndex: update.stepIndex, ...update };
              last.steps.push(stepObj);
            } else {
              const sIdx = last.steps.indexOf(stepObj);
              last.steps[sIdx] = { ...stepObj, ...update };
            }
          } else if (update.type === 'tool_output') {
            const targetStep = stepObj || (update.command ? last.steps.find(s => s.toolType === 'command' && s.command === update.command) : null) || last.steps.slice().reverse().find(s => s.toolType === 'command');
            if (targetStep) {
              const sIdx = last.steps.indexOf(targetStep);
              last.steps[sIdx] = {
                ...targetStep,
                output: update.output,
                isProposed: update.isProposed,
                status: update.status,
                isWaiting: update.isWaiting,
                error: update.error
              };
            }
          } else if (update.type === 'notify_user') {
            if (!stepObj) {
              stepObj = {
                stepIndex: update.stepIndex,
                type: 'notifyUser',
                content: update.content,
                reviewUris: update.reviewUris,
                isBlocking: update.isBlocking,
                askForUserFeedback: update.askForUserFeedback,
                confidence: update.confidence
              };
              last.steps.push(stepObj);
            } else {
              const sIdx = last.steps.indexOf(stepObj);
              last.steps[sIdx] = {
                ...stepObj,
                type: 'notifyUser',
                content: update.content,
                reviewUris: update.reviewUris,
                isBlocking: update.isBlocking
              };
            }
          } else if (update.type === 'error') {
            const errIdx = last.steps.findIndex(s => s.type === 'exec_error');
            const newErrStep = {
              stepIndex: errIdx >= 0 ? last.steps[errIdx].stepIndex : Date.now(),
              type: 'exec_error',
              content: update.message || 'An unknown execution error occurred.'
            };
            if (errIdx >= 0) {
              last.steps[errIdx] = newErrStep;
            } else {
              last.steps.push(newErrStep);
            }
          }

          return clone;
        });
      },
      controller.signal,
      () => turnStartStepRef.current, // dynamic getter — updated before each sendMessage
      true // persistent: don't stop stream on IDLE
    ).catch(err => {
      if (err.name !== 'AbortError') {
        console.error('[Stream] Persistent stream error:', err);
      }
    });
  };

  const selectConversation = async (id) => {
    if (id === activeSessionId) return;
    setActiveSessionId(id);
    isGeneratingRef.current = false;
    setIsGenerating(false);
    turnStartStepRef.current = 0;
    totalStepsRef.current = 0;

    const targetConv = conversations.find(c => c.id === id);
    const saved = getSavedWorkspaces();
    const path = targetConv?.workspaceDir || saved[id]?.workspaceDir;
    const proj = targetConv?.projectId || saved[id]?.projectId;
    if (path) setWorkspaceDir(path);
    if (proj) setSelectedProjectId(proj);

    // StreamAgentStateUpdates delivers complete history in Chunk 0 — no redundant RPC calls
    startPersistentStream(id);
  };

  const handleApproveCommand = async (stepIndex, scope = 'PERMISSION_SCOPE_ONCE') => {
    if (!activeSessionId) return;
    try {
      const step = messages.flatMap(m => m.steps || []).find(s => s.stepIndex === stepIndex);
      const trajectoryId = step?.trajectoryId;
      await client.handleCascadeUserInteraction(activeSessionId, stepIndex, trajectoryId, true, scope);
      const scopeLabel = scope === 'PERMISSION_SCOPE_ONCE' ? 'Run Once'
        : scope === 'PERMISSION_SCOPE_CONVERSATION' ? 'Always in Chat'
        : 'Always in Workspace';
      showToast(`Command approved: ${scopeLabel}`, 'success');
    } catch (err) {
      console.warn('handleCascadeUserInteraction approval failed, trying fallback:', err);
      try {
        await client.resolveOutstandingSteps(activeSessionId);
        showToast('Command approved via fallback', 'success');
      } catch (fallbackErr) {
        console.error('Failed to approve command:', fallbackErr);
        showToast(`Approval failed: ${fallbackErr.message}`, 'error');
      }
    }
  };

  const handleCancelStep = async (stepIndex) => {
    if (!activeSessionId) return;
    try {
      const step = messages.flatMap(m => m.steps || []).find(s => s.stepIndex === stepIndex);
      const trajectoryId = step?.trajectoryId;
      await client.handleCascadeUserInteraction(activeSessionId, stepIndex, trajectoryId, false, undefined, 'User canceled this command.');
      showToast('Command canceled by user', 'info');
    } catch (err) {
      console.warn('handleCascadeUserInteraction cancel failed, trying fallback:', err);
      try {
        await client.cancelCascadeSteps(activeSessionId, [stepIndex]);
        showToast('Command canceled', 'info');
      } catch (fallbackErr) {
        console.error('Failed to cancel step:', fallbackErr);
        showToast(`Cancel failed: ${fallbackErr.message}`, 'error');
      }
    }
  };

  const handleResolvePlan = async () => {
    if (!activeSessionId) return;
    try {
      await client.resolveOutstandingSteps(activeSessionId);
      showToast('Plan approved and proceeding', 'success');
    } catch (err) {
      console.error('Failed to proceed:', err);
      showToast(`Failed to proceed: ${err.message}`, 'error');
    }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputPrompt.trim() || isGenerating) return;

    const modelToUse = selectedModel || models[0]?.modelEnum || 'MODEL_PLACEHOLDER_M319';

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      try {
        targetSessionId = await client.startConversation(modelToUse, workspaceDir, selectedProjectId);
        newSessionsNeedingTitleRef.current.add(targetSessionId);
        setActiveSessionId(targetSessionId);
        saveSessionWorkspace(targetSessionId, workspaceDir, selectedProjectId);
        const projObj = projects.find(p => p.id === selectedProjectId);
        const projName = projObj?.name || workspaceDir.split('/').filter(Boolean).pop() || 'Workspace';
        setConversations(prev => [{
          id: targetSessionId,
          title: inputPrompt.slice(0, 30),
          lastModified: new Date().toISOString(),
          stepCount: 1,
          workspaceDir,
          projectId: selectedProjectId
        }, ...prev]);
        // Open the persistent stream for this new session
        startPersistentStream(targetSessionId);
      } catch (startErr) {
        console.error('Failed to create session:', startErr);
        alert(`Failed to create session: ${startErr.message}`);
        return;
      }
    }

    const currentPrompt = inputPrompt;
    setInputPrompt('');

    // 1. Snapshot current step count as the turn boundary for this message.
    //    Tracked directly from StreamAgentStateUpdates — zero extra network requests!
    turnStartStepRef.current = totalStepsRef.current;

    // 2. Append user message & placeholder assistant turn
    setMessages(prev => [...prev, { role: 'user', content: currentPrompt }, { role: 'assistant', steps: [] }]);
    isGeneratingRef.current = true;
    setIsGenerating(true);

    try {
      // 3. Send the message — the persistent stream already open will receive updates
      await client.sendMessage({
        cascadeId: targetSessionId,
        text: currentPrompt,
        modelEnum: modelToUse,
        thinkingBudget: parseInt(thinkingBudget, 10),
        autoExecutionPolicy
      });
    } catch (err) {
      console.error('Chat send error:', err);
      setMessages(prev => {
        const clone = [...prev];
        const lastIdx = clone.length - 1;
        if (lastIdx >= 0 && clone[lastIdx].role === 'assistant') {
          clone[lastIdx] = {
            ...clone[lastIdx],
            steps: [
              ...(clone[lastIdx].steps || []),
              { stepIndex: 999999, type: 'error', content: `Failed to send message: ${err.message}` }
            ]
          };
        }
        return clone;
      });
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  };

  const handleStop = async () => {
    isGeneratingRef.current = false;
    setIsGenerating(false);
    if (activeSessionId) {
      await client.stop(activeSessionId);
    }
    // NOTE: Do NOT abort streamControllerRef — the persistent stream must stay alive.
    // abortControllerRef is only for stop button legacy; generation stop is done via CancelCascadeInvocation.
  };




  const toggleThinking = (key) => {
    setCollapsedThinking(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleTool = (key) => {
    setCollapsedTools(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const activeModelObj = models.find(m => m.modelEnum === selectedModel);

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo-area">
            <Zap size={20} color="#38bdf8" />
            <span>Antigravity UI</span>
            <span className="logo-badge">Direct Hub</span>
          </div>
          <button className="btn-new-chat" onClick={openNewSessionModal}>
            <Plus size={16} /> New Session
          </button>
        </div>

        <div className="chat-list">
          {conversations.map(chat => (
            <div
              key={chat.id}
              className={`chat-item ${chat.id === activeSessionId ? 'active' : ''}`}
              onClick={() => selectConversation(chat.id)}
            >
              <div className="chat-item-title">{chat.title}</div>
              <div className="chat-item-meta">
                <span>{chat.stepCount} steps</span>
                <span>{new Date(chat.lastModified).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
          ))}
          {conversations.length === 0 && (
            <div style={{ padding: '20px', color: '#64748b', fontSize: '12px', textAlign: 'center' }}>
              No sessions found. Start a new session!
            </div>
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="main-content">
        {/* Top Control Bar */}
        <div className="top-bar">
          <div className="top-bar-left">
            <div className="status-badge" onClick={() => setShowConfig(!showConfig)} style={{ cursor: 'pointer' }}>
              <span className={`status-dot ${connected ? 'online' : 'offline'}`}></span>
              <span>{connected ? `Direct Hub (${hubUrl.replace('http://', '')})` : 'Disconnected'}</span>
              <Settings size={12} style={{ marginLeft: 4 }} />
            </div>

            {/* Project / Workspace Display Pill */}
            <div
              className={`project-pill ${activeSessionId ? 'locked' : ''}`}
              onClick={() => {
                if (!activeSessionId) openNewSessionModal();
              }}
              title={
                activeSessionId
                  ? 'Project workspace is locked to this active session. Click "+ New Session" to select another project folder.'
                  : 'Click to select project folder for new session'
              }
            >
              {activeSessionId ? (
                <Lock size={13} color="#94a3b8" />
              ) : (
                <Folder size={14} color="#38bdf8" />
              )}
              <span className="project-pill-title">
                {projects.find(p => p.id === selectedProjectId)?.name || workspaceDir.split('/').filter(Boolean).pop() || 'Workspace'}
              </span>
              <span className="project-pill-path">
                {workspaceDir ? workspaceDir.split('/').slice(-2).join('/') : ''}
              </span>
              {activeSessionId ? (
                <span className="pill-lock-tag">Locked</span>
              ) : (
                <ChevronDown size={12} color="#64748b" />
              )}
            </div>

            {activeModelObj?.quotaFraction !== undefined && (
              <div className="status-badge" style={{ color: '#38bdf8' }}>
                Quota: {Math.round(activeModelObj.quotaFraction * 100)}%
              </div>
            )}
          </div>

          <div className="top-bar-controls">
            {/* Model Selector */}
            <div className="control-group">
              <Cpu size={14} />
              <select
                className="select-control"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {models.map(m => (
                  <option key={m.key} value={m.modelEnum}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>

            {/* Thinking Budget Slider */}
            <div className="control-group">
              <Brain size={14} />
              <span>Thinking:</span>
              <div className="slider-container">
                <input
                  type="range"
                  min="0"
                  max="32768"
                  step="2048"
                  value={thinkingBudget}
                  onChange={(e) => setThinkingBudget(e.target.value)}
                />
                <span style={{ fontSize: '11px', minWidth: '40px' }}>
                  {thinkingBudget > 0 ? `${thinkingBudget}` : 'Off'}
                </span>
              </div>
            </div>

            {/* Command Auto-Execution Policy */}
            <div className="control-group">
              <Terminal size={14} />
              <span>Policy:</span>
              <select
                className="select-control"
                value={autoExecutionPolicy}
                onChange={(e) => {
                  const val = e.target.value;
                  setAutoExecutionPolicy(val);
                  localStorage.setItem('agy_auto_exec_policy', val);
                  const fullPolicy = val === 'EAGER' ? 'CASCADE_COMMANDS_AUTO_EXECUTION_EAGER'
                    : val === 'AUTO' ? 'CASCADE_COMMANDS_AUTO_EXECUTION_AUTO'
                    : 'CASCADE_COMMANDS_AUTO_EXECUTION_OFF';
                  client.setUserSettings(fullPolicy);
                }}
                title="Command Auto-Execution Policy: Eager (auto-run everything), Auto (smart safety), Off (ask user every time)"
              >
                <option value="EAGER">⚡ Auto-Run (Eager)</option>
                <option value="AUTO">🛡️ Smart Safety (Auto)</option>
                <option value="OFF">✋ Ask User (Off)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Optional Config Bar */}
        {showConfig && (
          <div style={{ padding: '8px 20px', background: '#111722', borderBottom: '1px solid #243147', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Hub URL:</span>
              <input
                type="text"
                value={hubUrl}
                onChange={(e) => setHubUrl(e.target.value)}
                style={{ background: '#161f30', border: '1px solid #243147', color: '#f1f5f9', padding: '4px 8px', borderRadius: 4, fontSize: '12px', width: '200px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Workspace Folder:</span>
              <input
                type="text"
                value={workspaceDir}
                onChange={(e) => setWorkspaceDir(e.target.value)}
                style={{ background: '#161f30', border: '1px solid #243147', color: '#f1f5f9', padding: '4px 8px', borderRadius: 4, fontSize: '12px', width: '240px' }}
              />
            </div>
            <button onClick={connectAndLoad} style={{ background: '#2563eb', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 4, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={12} /> Reconnect
            </button>
          </div>
        )}

        {/* Chat Messages */}
        <div className="messages-container">
          {messages.map((msg, idx) => (
            <div key={idx} className="message-row">
              {msg.role === 'system' ? (
                <div className="message-system">
                  <Folder size={14} color="#38bdf8" />
                  <span>{msg.content}</span>
                </div>
              ) : msg.role === 'user' ? (
                <div className="message-user">{msg.content}</div>
              ) : (
                <div className="message-assistant">
                  {/* Step-based execution stream (Thinking, Tools, and Content in chronological order) */}
                  {msg.steps && msg.steps.length > 0 ? (
                    msg.steps.map((step, sIdx) => {
                      if (step.type === 'error') {
                        return (
                          <div key={sIdx} className="error-card" style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '13px', margin: '6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertCircle size={16} />
                            <span>{step.content}</span>
                          </div>
                        );
                      }

                      if (step.type === 'exec_error') {
                        // Parse quota reset time if present
                        const resetMatch = step.content.match(/Resets in ([^.]+)/);
                        const quotaMatch = step.content.match(/RESOURCE_EXHAUSTED|quota reached/i);
                        return (
                          <div key={sIdx} style={{
                            padding: '14px 16px',
                            borderRadius: '10px',
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            margin: '8px 0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontWeight: 600, fontSize: '13px' }}>
                              <AlertCircle size={15} />
                              <span>{quotaMatch ? '⚡ Quota Limit Reached' : '❌ Execution Error'}</span>
                            </div>
                            <div style={{ color: '#fca5a5', fontSize: '12px', lineHeight: '1.5', wordBreak: 'break-word' }}>
                              {step.content}
                            </div>
                            {resetMatch && (
                              <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                                🕐 Quota resets in {resetMatch[1]}. Consider switching to a different model in the toolbar above.
                              </div>
                            )}
                          </div>
                        );
                      }


                      if (step.type === 'planner') {
                        const thinkKey = `${idx}-${step.stepIndex}`;
                        return (
                          <div key={sIdx} className="step-block">
                            {step.thinking && (
                              <div className="thinking-box">
                                <div className="thinking-header" onClick={() => toggleThinking(thinkKey)}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Brain size={14} />
                                    {isGenerating && idx === messages.length - 1 && !step.content ? 'Reasoning in progress...' : 'Thought Process'}
                                  </span>
                                  {collapsedThinking[thinkKey] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                </div>
                                {!collapsedThinking[thinkKey] && (
                                  <div className="thinking-content">{step.thinking}</div>
                                )}
                              </div>
                            )}
                            {step.content && (
                              <div className="assistant-text">{step.content}</div>
                            )}
                          </div>
                        );
                      }

                      if (step.type === 'tool') {
                        const toolKey = `${idx}-${step.stepIndex}`;
                        const isCollapsed = collapsedTools[toolKey];
                        // True approval required ONLY if step is specifically waiting on user OR proposed in OFF mode with no output
                        const isAwaitingApproval = !step.output && !step.error && (
                          step.status === 'CORTEX_STEP_STATUS_WAITING' ||
                          step.isWaiting ||
                          (step.isProposed && autoExecutionPolicy === 'OFF' && step.status !== 'CORTEX_STEP_STATUS_RUNNING')
                        );
                        const isRunning = !step.output && !step.error && !isAwaitingApproval && (
                          step.status === 'CORTEX_STEP_STATUS_RUNNING' ||
                          (isGenerating && sIdx === (msg.steps || []).length - 1 && step.status !== 'CORTEX_STEP_STATUS_ERROR' && step.status !== 'CORTEX_STEP_STATUS_DONE')
                        );
                        return (
                          <div key={sIdx} className="tool-box">
                            <div
                              className="tool-header"
                              onClick={() => toggleTool(toolKey)}
                              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {step.toolType === 'command' && <Terminal size={14} />}
                                {step.toolType === 'read' && <FileText size={14} />}
                                {step.toolType === 'edit' && <Code size={14} />}
                                {step.toolType === 'search' && <Search size={14} />}
                                {step.toolType !== 'command' && step.toolType !== 'read' && step.toolType !== 'edit' && step.toolType !== 'search' && <Terminal size={14} />}
                                <span>{step.label || (step.command ? `Terminal: ${step.command}` : 'Tool Execution')}</span>
                              </div>
                              {(step.output || step.diff || step.error) && (
                                <span style={{ color: '#64748b' }}>
                                  {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                </span>
                              )}
                            </div>
                            {!isCollapsed && (
                              <>
                                {step.output && (
                                  <div className="tool-content">{step.output}</div>
                                )}
                                {step.diff && (
                                  <div className="tool-content">{step.diff}</div>
                                )}
                                {step.error && !step.output && (
                                  <div className="tool-content" style={{ color: '#ef4444' }}>{step.error}</div>
                                )}
                                {step.toolType === 'command' && isRunning && (
                                  <div style={{ padding: '8px 12px', fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Loader2 size={12} className="spin" /> Executing command in workspace...
                                  </div>
                                )}
                                {step.toolType === 'command' && isAwaitingApproval && (
                                  <div className="command-action-bar">
                                    <span className="approval-badge">
                                      <Terminal size={12} /> Execution approval required
                                    </span>
                                    <div className="action-buttons">
                                      <button
                                        type="button"
                                        className="btn-approve"
                                        onClick={() => handleApproveCommand(step.stepIndex, 'PERMISSION_SCOPE_ONCE')}
                                        title="Execute this command once"
                                      >
                                        <Play size={12} /> Run Once
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-approve-conversation"
                                        onClick={() => handleApproveCommand(step.stepIndex, 'PERMISSION_SCOPE_CONVERSATION')}
                                        title="Always allow this command in this conversation"
                                      >
                                        <Check size={12} /> Always in Chat
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-approve-workspace"
                                        onClick={() => handleApproveCommand(step.stepIndex, 'PERMISSION_SCOPE_WORKSPACE')}
                                        title="Always allow this command in this workspace"
                                      >
                                        <ShieldCheck size={12} /> Always in Workspace
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-reject"
                                        onClick={() => handleCancelStep(step.stepIndex)}
                                        title="Cancel this command"
                                      >
                                        <X size={12} /> Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      }

                      if (step.type === 'notifyUser') {
                        return (
                          <div key={sIdx} className={`notify-user-card ${step.isBlocking ? 'blocking' : ''}`}>
                            <div className="notify-user-header">
                              <div className="notify-user-title">
                                <Bell size={16} color={step.isBlocking ? '#f59e0b' : '#38bdf8'} />
                                <span>{step.isBlocking ? 'Action Required: Plan Review & Feedback' : 'Agent Notification'}</span>
                              </div>
                              {step.isBlocking ? (
                                <span className="blocking-tag">⏸️ Review Required</span>
                              ) : (
                                <span className="notice-tag">ℹ️ Notice</span>
                              )}
                            </div>

                            {step.content && (
                              <div className="notify-user-content">{step.content}</div>
                            )}

                            {step.reviewUris && step.reviewUris.length > 0 && (
                              <div className="notify-uris-list">
                                <span className="uris-label">Artifacts / Files to Review:</span>
                                <div className="uris-chips">
                                  {step.reviewUris.map((uri, uIdx) => (
                                    <span key={uIdx} className="uri-chip" title={uri}>
                                      <FileText size={12} />
                                      {uri.split('/').filter(Boolean).pop() || uri}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {step.isBlocking && (
                              <div className="notify-actions-bar">
                                <button
                                  type="button"
                                  className="btn-proceed"
                                  onClick={handleResolvePlan}
                                >
                                  <Check size={14} /> Proceed with Plan
                                </button>
                                <span className="notify-hint">Or send a reply below with suggestions</span>
                              </div>
                            )}
                          </div>
                        );
                      }

                      return null;
                    })
                  ) : (
                    /* Fallback for legacy messages or waiting state */
                    <>
                      {msg.thinking && (
                        <div className="thinking-box">
                          <div className="thinking-header" onClick={() => toggleThinking(idx)}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Brain size={14} />
                              Thought Process
                            </span>
                            {collapsedThinking[idx] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                          </div>
                          {!collapsedThinking[idx] && (
                            <div className="thinking-content">{msg.thinking}</div>
                          )}
                        </div>
                      )}
                      {msg.tools && msg.tools.map((tool, tIdx) => (
                        <div key={tIdx} className="tool-box">
                          <div className="tool-header">
                            <Terminal size={14} />
                            <span>{tool.label || tool.command}</span>
                          </div>
                          {tool.output && <div className="tool-content">{tool.output}</div>}
                        </div>
                      ))}
                      {msg.content && <div className="assistant-text">{msg.content}</div>}
                      {isGenerating && idx === messages.length - 1 && (
                        <div style={{ color: '#64748b', fontSize: '13px', fontStyle: 'italic' }}>
                          Waiting for response...
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Prompt Input Box */}
        <div className="input-area">
          <form className="input-box-wrapper" onSubmit={handleSendMessage}>
            <textarea
              className="chat-input"
              placeholder="Send prompt to agy daemon directly from browser..."
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            {isGenerating ? (
              <button type="button" className="stop-button" onClick={handleStop}>
                <Square size={14} /> Stop
              </button>
            ) : (
              <button
                type="submit"
                className="send-button"
                disabled={!inputPrompt.trim() || !connected}
              >
                <Send size={14} /> Send
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Project & Workspace Selection Modal */}
      {showProjectModal && (
        <div className="modal-overlay" onClick={() => setShowProjectModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <Folder size={20} color="#38bdf8" />
                <span>{modalMode === 'new' ? 'Choose Project & Workspace' : 'Switch Workspace Mid-Conversation'}</span>
              </div>
              <button
                onClick={() => setShowProjectModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
              {modalMode === 'new'
                ? 'Choose which project or workspace folder this new conversation should belong to. Tool actions (file edits, terminal commands) will execute inside this directory.'
                : 'Change the active working directory for this conversation. Subsequent commands and file operations will immediately target the new path.'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>Available Registered Projects:</span>
              <div className="project-option-list">
                {projects.map((p) => {
                  const isSel = tempSelectedProjectId === p.id && tempCustomPath === (p.path || tempCustomPath);
                  return (
                    <div
                      key={p.id}
                      className={`project-option-item ${isSel ? 'selected' : ''}`}
                      onClick={() => {
                        setTempSelectedProjectId(p.id);
                        if (p.path) setTempCustomPath(p.path);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FolderGit2 size={18} color={isSel ? '#38bdf8' : '#64748b'} />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>{p.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{p.path || 'Global / Default Workspace'}</div>
                        </div>
                      </div>
                      {isSel && <Check size={16} color="#38bdf8" />}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>Working Directory Path:</span>
              <input
                type="text"
                value={tempCustomPath}
                onChange={(e) => setTempCustomPath(e.target.value)}
                placeholder="/home/cat/path/to/project"
                style={{
                  background: '#161f30',
                  border: '1px solid #243147',
                  color: '#f1f5f9',
                  padding: '8px 12px',
                  borderRadius: 6,
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setShowProjectModal(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #243147',
                  color: '#94a3b8',
                  padding: '8px 14px',
                  borderRadius: 6,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmProject(tempCustomPath, tempSelectedProjectId)}
                style={{
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {modalMode === 'new' ? 'Start Session' : 'Apply Workspace Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast-item ${t.type}`}>
            {t.type === 'error' && <AlertCircle size={16} color="#ef4444" />}
            {t.type === 'success' && <CheckCircle2 size={16} color="#10b981" />}
            {t.type === 'info' && <Info size={16} color="#38bdf8" />}
            <span style={{ flex: 1, wordBreak: 'break-word' }}>{t.message}</span>
            <button type="button" className="toast-close" onClick={() => removeToast(t.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
