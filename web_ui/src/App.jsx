import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  GitBranch,
  Check,
  X,
  Lock,
  Bell,
  Play,
  Loader2,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  Info,
  Activity,
  Copy,
  Clock,
  Ban
} from 'lucide-react';
import { AntigravityBrowserClient } from './agyClient';

const client = new AntigravityBrowserClient('http://127.0.0.1:8090');

function formatQuotaResetTime(isoString) {
  if (!isoString) return 'N/A';
  try {
    const target = new Date(isoString).getTime();
    const now = Date.now();
    const diffMs = target - now;
    if (diffMs <= 0) return 'Resetting now';

    const totalMins = Math.floor(diffMs / (1000 * 60));
    const days = Math.floor(totalMins / (60 * 24));
    const hours = Math.floor((totalMins % (60 * 24)) / 60);
    const mins = totalMins % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    parts.push(`${mins}m`);

    const dateObj = new Date(isoString);
    const timeFormatted = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dayFormatted = days > 0 ? dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' : '';

    return `in ${parts.join(' ')} (${dayFormatted}${timeFormatted})`;
  } catch (e) {
    return isoString;
  }
}

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
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('agy_preferred_model_enum') || '';
  });
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
  const [tempCustomPath, setTempCustomPath] = useState('');
  const [tempSelectedProjectId, setTempSelectedProjectId] = useState('default-cli-project');
  const [showTasksModal, setShowTasksModal] = useState(false);
  const [tasksFilter, setTasksFilter] = useState('ALL');
  const [tasksSearch, setTasksSearch] = useState('');
  const [expandedModalTasks, setExpandedModalTasks] = useState({});
  const [copiedStepIndex, setCopiedStepIndex] = useState(null);

  // Quota & Rate Limit States
  const [quotaSummary, setQuotaSummary] = useState(null);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [isRefreshingQuota, setIsRefreshingQuota] = useState(false);

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

  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const messagesContainerRef = useRef(null);
  const shouldInstantScrollRef = useRef(false);

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);  // for stop button (CancelCascadeInvocation)
  const streamControllerRef = useRef(null); // for the one persistent stream per session
  const summariesControllerRef = useRef(null); // for JetboxSubscribeToSummaries
  const turnStartStepRef = useRef(0);        // updated before each sendMessage
  const totalStepsRef = useRef(0);           // tracked from StreamAgentStateUpdates
  const isGeneratingRef = useRef(false);
  const activeSessionIdRef = useRef(activeSessionId);
  const hasInitialSelectedRef = useRef(false);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const [expandedProjects, setExpandedProjects] = useState({});
  const toggleProjectExpand = (projId) => {
    setExpandedProjects(prev => ({ ...prev, [projId]: !prev[projId] }));
  };

  const getProjectDisplayName = (projId, wsDir) => {
    const p = projects.find(proj => proj.id === projId || proj.path === wsDir);
    if (p?.name) return p.name;
    if (wsDir) {
      const folder = wsDir.replace(/\/+$/, '').split('/').pop();
      if (folder) return folder;
    }
    if (projId && projId !== 'default-cli-project') return projId;
    return 'Main Workspace';
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffSec = Math.floor((now - d) / 1000);
      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      if (diffSec < 172800) return 'Yesterday';
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const groupedConversations = React.useMemo(() => {
    const groups = {};
    conversations.forEach(chat => {
      const projKey = chat.projectId || 'default-cli-project';
      const projName = getProjectDisplayName(projKey, chat.workspaceDir);

      if (!groups[projKey]) {
        groups[projKey] = {
          id: projKey,
          name: projName,
          workspaceDir: chat.workspaceDir,
          chats: [],
          latestUpdate: chat.lastModified || '1970-01-01'
        };
      }
      groups[projKey].chats.push(chat);
      if (new Date(chat.lastModified) > new Date(groups[projKey].latestUpdate)) {
        groups[projKey].latestUpdate = chat.lastModified;
      }
    });

    // Sort chats within each project: latest updated first
    Object.values(groups).forEach(g => {
      g.chats.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    });

    // Sort project groups by latest activity
    return Object.values(groups).sort((a, b) => new Date(b.latestUpdate) - new Date(a.latestUpdate));
  }, [conversations, projects]);

  const scrollToBottom = (instant = false) => {
    if (instant || shouldInstantScrollRef.current) {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (isLoadingChat) return;

    if (shouldInstantScrollRef.current) {
      const jump = () => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      };
      jump();
      requestAnimationFrame(jump);
      const timer = setTimeout(jump, 50);
      shouldInstantScrollRef.current = false;
      return () => clearTimeout(timer);
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoadingChat]);

  const hasInitializedRef = useRef(false);

  const fetchQuotaSummary = useCallback(async () => {
    try {
      setIsRefreshingQuota(true);
      const summary = await client.getUserQuotaSummary();
      if (summary) {
        setQuotaSummary(summary);
      }
    } catch (err) {
      console.warn('[UI] Failed to fetch quota summary:', err);
    } finally {
      setIsRefreshingQuota(false);
    }
  }, []);

  // Poll quota every 2 minutes
  useEffect(() => {
    const timer = setInterval(() => {
      fetchQuotaSummary();
    }, 120000);
    return () => clearInterval(timer);
  }, [fetchQuotaSummary]);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowQuotaModal(false);
        setShowTasksModal(false);
        setShowProjectModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

      // 1. Fetch available models & initial quota
      console.log('[UI] Fetching available models...');
      const availableModels = await client.getAvailableModels();
      setModels(availableModels);
      if (availableModels.length > 0) {
        const savedKey = localStorage.getItem('agy_preferred_model_key');
        const savedEnum = localStorage.getItem('agy_preferred_model_enum');
        const matched = availableModels.find(m => 
          (savedKey && m.key === savedKey) || (savedEnum && m.modelEnum === savedEnum)
        );
        if (matched) {
          setSelectedModel(matched.modelEnum);
        } else if (!selectedModel) {
          const preferred = availableModels.find(m => m.key.includes('3.8')) || availableModels[0];
          setSelectedModel(preferred.modelEnum);
        }
      }
      fetchQuotaSummary();

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

      // 3. Live Subscription to conversation summaries via JetboxSubscribeToSummaries
      console.log('[UI] Subscribing to live conversation summaries...');
      if (summariesControllerRef.current) {
        summariesControllerRef.current.abort();
      }
      const summariesCtrl = new AbortController();
      summariesControllerRef.current = summariesCtrl;

      client.subscribeToSummaries((incomingUpdates) => {
        setConversations(prev => {
          const map = new Map(prev.map(c => [c.id, c]));
          const saved = getSavedWorkspaces();

          for (const [id, item] of Object.entries(incomingUpdates)) {
            // Ignore empty abandoned sessions with no steps, no title, and no summary (unless currently active)
            const hasContent = Boolean(item.annotations?.title || item.summary || (item.stepCount && item.stepCount > 0));
            if (!hasContent && id !== activeSessionIdRef.current) {
              map.delete(id);
              continue;
            }

            const existing = map.get(id);
            const workspaceUri = item.trajectoryMetadata?.workspaceUris?.[0] || item.workspaces?.[0]?.workspaceFolderAbsoluteUri || '';
            const wsDir = workspaceUri ? workspaceUri.replace(/^file:\/\//, '') : (existing?.workspaceDir || saved[id]?.workspaceDir || '/home/cat/agy_cli_hub');
            const projId = item.trajectoryMetadata?.projectId || existing?.projectId || saved[id]?.projectId || 'default-cli-project';
            const branch = item.workspaces?.[0]?.branchName || existing?.branchName || '';

            map.set(id, {
              ...existing,
              id,
              title: item.annotations?.title || item.summary || existing?.title || 'New Session',
              lastModified: item.lastModifiedTime || existing?.lastModified || new Date().toISOString(),
              stepCount: item.stepCount !== undefined ? item.stepCount : (existing?.stepCount || 0),
              status: item.status || existing?.status || 'CASCADE_RUN_STATUS_IDLE',
              projectId: projId,
              workspaceDir: wsDir,
              branchName: branch,
              lastUserInputTime: item.lastUserInputTime,
              createdTime: item.createdTime
            });
          }

          const sorted = Array.from(map.values()).sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

          if (!hasInitialSelectedRef.current && !activeSessionIdRef.current && sorted.length > 0) {
            hasInitialSelectedRef.current = true;
            selectConversation(sorted[0].id);
          }

          return sorted;
        });
      }, summariesCtrl.signal);
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

  const handleConfirmProject = (path, projId) => {
    const finalPath = (path || '').trim() || '/home/cat/agy_cli_hub';
    const finalProjId = projId || 'default-cli-project';
    setWorkspaceDir(finalPath);
    setSelectedProjectId(finalProjId);
    setShowProjectModal(false);

    // Prevent auto-selection in JetboxSubscribeToSummaries from kicking us out of the new chat
    hasInitialSelectedRef.current = true;

    // Abort any existing stream from previous conversation
    if (streamControllerRef.current) {
      streamControllerRef.current.abort();
      streamControllerRef.current = null;
    }

    setActiveSessionId(null);
    turnStartStepRef.current = 0;
    totalStepsRef.current = 0;
    setIsGenerating(false);
    isGeneratingRef.current = false;
    setIsLoadingChat(false);

    const projObj = projects.find(p => p.id === finalProjId);
    const projName = projObj?.name || finalPath.split('/').filter(Boolean).pop() || 'Workspace';

    setMessages([
      { role: 'system', content: `Workspace ready: ${finalPath} [${projName}]. Type a message to begin.` }
    ]);
    showToast(`Ready in ${projName}. Type a message to start.`, 'info');
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
          turnStartStepRef.current = update.currentTurnStartStep !== undefined
            ? update.currentTurnStartStep
            : (update.totalLength || 0);
          if (update.messages && update.messages.length > 0) {
            setMessages(update.messages);
          }
          setIsLoadingChat(false);
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
          isGeneratingRef.current = false;
          setIsGenerating(false);
          return;
        }

        setMessages(prev => {
          const clone = [...prev];
          let lastIdx = clone.length - 1;
          if (lastIdx < 0 || clone[lastIdx].role !== 'assistant') {
            clone.push({ role: 'assistant', steps: [] });
            lastIdx = clone.length - 1;
          }

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
    setIsLoadingChat(true);
    shouldInstantScrollRef.current = true;

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
        showToast(`Failed to create session: ${startErr.message}`, 'error');
        return;
      }
    }

    const currentPrompt = inputPrompt;
    setInputPrompt('');

    // 1. Snapshot current step count as the turn boundary for this message.
    //    Tracked directly from StreamAgentStateUpdates — zero extra network requests!
    turnStartStepRef.current = totalStepsRef.current;

    // 2. Append user message & placeholder assistant turn
    setMessages(prev => [
      ...prev.filter(m => m.role !== 'system'),
      { role: 'user', content: currentPrompt },
      { role: 'assistant', steps: [] }
    ]);
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

  // Extract all tasks / tool executions dynamically from messages
  const allTasks = useMemo(() => {
    const list = [];
    messages.forEach((msg) => {
      if (msg.role === 'assistant' && Array.isArray(msg.steps)) {
        msg.steps.forEach(step => {
          if (step.type === 'tool' || step.toolType) {
            const rawStatus = step.status || '';
            let status = 'DONE';
            if (step.error || rawStatus.includes('ERROR') || rawStatus.includes('FAIL')) status = 'ERROR';
            else if (step.isRunning || rawStatus.includes('RUNNING')) status = 'RUNNING';
            else if (step.isWaiting || rawStatus.includes('WAIT')) status = 'WAITING';
            else if (rawStatus.includes('CANCEL')) status = 'CANCELLED';

            list.push({
              stepIndex: step.stepIndex,
              type: step.toolType || 'tool',
              label: step.label || (step.command ? `Terminal: ${step.command}` : 'Tool Execution'),
              command: step.command,
              output: step.output || '',
              diff: step.diff || '',
              error: step.error || '',
              status,
              rawStatus
            });
          }
        });
      }
    });
    return list;
  }, [messages]);

  const runningTasks = useMemo(() => allTasks.filter(t => t.status === 'RUNNING'), [allTasks]);
  const runningTasksCount = runningTasks.length;

  const filteredTasks = useMemo(() => {
    return allTasks.filter(task => {
      if (tasksFilter === 'RUNNING' && task.status !== 'RUNNING') return false;
      if (tasksFilter === 'COMMANDS' && task.type !== 'command') return false;
      if (tasksFilter === 'FILES' && task.type !== 'read' && task.type !== 'edit' && task.type !== 'list') return false;
      if (tasksFilter === 'ERRORS' && task.status !== 'ERROR' && !task.error) return false;

      if (tasksSearch.trim()) {
        const q = tasksSearch.toLowerCase();
        const matchLabel = (task.label || '').toLowerCase().includes(q);
        const matchOutput = (task.output || '').toLowerCase().includes(q);
        const matchType = (task.type || '').toLowerCase().includes(q);
        return matchLabel || matchOutput || matchType;
      }
      return true;
    });
  }, [allTasks, tasksFilter, tasksSearch]);

  const handleKillTask = async (stepIndex) => {
    if (!activeSessionId) return;
    try {
      const ok = await client.cancelCascadeSteps(activeSessionId, [stepIndex]);
      if (ok) {
        showToast(`Stopped process #${stepIndex}`, 'info');
        setMessages(prev => prev.map(msg => {
          if (msg.role !== 'assistant' || !Array.isArray(msg.steps)) return msg;
          return {
            ...msg,
            steps: msg.steps.map(s => {
              if (s.stepIndex === stepIndex) {
                return { ...s, status: 'CORTEX_STEP_STATUS_CANCELLED', isRunning: false, error: 'Cancelled by user' };
              }
              return s;
            })
          };
        }));
      } else {
        showToast(`Failed to stop process #${stepIndex}`, 'error');
      }
    } catch (err) {
      console.error('Failed to kill task:', err);
      showToast(`Error stopping task: ${err.message}`, 'error');
    }
  };

  const toggleModalTask = (stepIndex) => {
    setExpandedModalTasks(prev => ({
      ...prev,
      [stepIndex]: !prev[stepIndex]
    }));
  };

  const copyTaskOutput = (stepIndex, text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedStepIndex(stepIndex);
    setTimeout(() => setCopiedStepIndex(null), 2000);
  };

  // Group available models into distinct families (Gemini 3.8 Flash, Gemini 3.1 Pro, Claude, GPT, etc.)
  const modelFamilies = useMemo(() => {
    const map = new Map();
    for (const m of models) {
      const famKey = m.baseName || m.displayName;
      if (!map.has(famKey)) {
        map.set(famKey, {
          familyKey: famKey,
          displayName: famKey,
          variants: []
        });
      }
      map.get(famKey).variants.push(m);
    }

    const tierOrder = { 'Low': 1, 'Medium': 2, 'High': 3 };
    const list = [];
    for (const fam of map.values()) {
      fam.variants.sort((a, b) => (tierOrder[a.tier] || 0) - (tierOrder[b.tier] || 0));
      list.push(fam);
    }
    return list;
  }, [models]);

  const activeModelObj = models.find(m => m.modelEnum === selectedModel) || models[0];
  const activeFamily = modelFamilies.find(f => f.variants.some(v => v.modelEnum === activeModelObj?.modelEnum)) || modelFamilies[0];

  const handleSelectModel = (modelEnum) => {
    setSelectedModel(modelEnum);
    if (modelEnum) {
      localStorage.setItem('agy_preferred_model_enum', modelEnum);
      const found = models.find(m => m.modelEnum === modelEnum);
      if (found?.key) {
        localStorage.setItem('agy_preferred_model_key', found.key);
      }
    }
  };

  const handleFamilyChange = (e) => {
    const famKey = e.target.value;
    const fam = modelFamilies.find(f => f.familyKey === famKey);
    if (!fam || fam.variants.length === 0) return;
    const prevTier = activeModelObj?.tier;
    const matched = prevTier ? fam.variants.find(v => v.tier === prevTier) : null;
    const target = matched || fam.variants[fam.variants.length - 1];
    handleSelectModel(target.modelEnum);
  };

  const isGeminiModel = !activeModelObj || 
    activeModelObj.key?.startsWith('gemini') || 
    activeModelObj.modelProvider === 'MODEL_PROVIDER_GOOGLE';

  const activeQuotaGroup = quotaSummary?.groups?.find(g => 
    isGeminiModel 
      ? g.displayName?.toLowerCase().includes('gemini') 
      : (g.displayName?.toLowerCase().includes('claude') || g.displayName?.toLowerCase().includes('gpt'))
  );

  const bucket5h = activeQuotaGroup?.buckets?.find(b => b.window === '5h');
  const bucketWeekly = activeQuotaGroup?.buckets?.find(b => b.window === 'weekly');

  const pct5h = bucket5h?.remainingFraction !== undefined ? Math.round(bucket5h.remainingFraction * 100) : null;
  const pctWeekly = bucketWeekly?.remainingFraction !== undefined ? Math.round(bucketWeekly.remainingFraction * 100) : null;

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
          {groupedConversations.map(group => {
            const hasMore = group.chats.length > 5;
            const isExpanded = Boolean(expandedProjects[group.id]);
            const displayedChats = isExpanded ? group.chats : group.chats.slice(0, 5);

            return (
              <div className="project-group" key={group.id}>
                <div
                  className="project-group-header"
                  onClick={() => hasMore && toggleProjectExpand(group.id)}
                  style={{ cursor: hasMore ? 'pointer' : 'default' }}
                  title={hasMore ? (isExpanded ? 'Collapse back to 5 chats' : `Show all ${group.chats.length} chats`) : undefined}
                >
                  <div className="project-group-title">
                    <Folder size={13} className="project-icon" />
                    <span className="project-name">{group.name}</span>
                    <span className="project-count">{group.chats.length}</span>
                  </div>
                  {hasMore && (
                    <div className="project-toggle-icon">
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </div>
                  )}
                </div>

                <div className="project-chats-list">
                  {displayedChats.map(chat => {
                    const isRunning = chat.status === 'CASCADE_RUN_STATUS_RUNNING';
                    const isActive = chat.id === activeSessionId;
                    return (
                      <div
                        key={chat.id}
                        className={`chat-item ${isActive ? 'active' : ''} ${isRunning ? 'running' : ''}`}
                        onClick={() => selectConversation(chat.id)}
                      >
                        <div className="chat-item-header">
                          <div className="chat-item-title" title={chat.title}>{chat.title}</div>
                          {isRunning && (
                            <span className="live-badge" title="Agent is working...">
                              <span className="live-dot-pulse"></span>
                              Running
                            </span>
                          )}
                        </div>
                        <div className="chat-item-meta">
                          <span className="meta-steps">
                            {chat.stepCount || 0} {chat.stepCount === 1 ? 'step' : 'steps'}
                          </span>
                          {chat.branchName && (
                            <span className="meta-branch" title={`Branch: ${chat.branchName}`}>
                              <GitBranch size={10} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />
                              {chat.branchName}
                            </span>
                          )}
                          <span className="meta-time">{formatTimeAgo(chat.lastModified)}</span>
                        </div>
                      </div>
                    );
                  })}

                  {hasMore && (
                    <button
                      className="btn-show-more-chats"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleProjectExpand(group.id);
                      }}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp size={12} /> Show less (top 5)
                        </>
                      ) : (
                        <>
                          <ChevronDown size={12} /> See all ({group.chats.length - 5} more)
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

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

            {/* Tasks & Process Activity Badge */}
            {activeSessionId && (
              <button
                type="button"
                className={`tasks-activity-btn ${runningTasksCount > 0 ? 'has-running' : ''}`}
                onClick={() => setShowTasksModal(true)}
                title="Inspect running processes and executed commands (/tasks)"
              >
                {runningTasksCount > 0 ? (
                  <>
                    <Loader2 size={13} className="spin" />
                    <span className="task-running-badge">{runningTasksCount} Running</span>
                  </>
                ) : (
                  <>
                    <Activity size={13} color="#38bdf8" />
                    <span>{allTasks.length} {allTasks.length === 1 ? 'Task' : 'Tasks'}</span>
                  </>
                )}
              </button>
            )}

            {/* Clickable Quota Badge (5h / 7d dual indicators) */}
            <button
              type="button"
              className="quota-status-badge"
              onClick={() => setShowQuotaModal(true)}
              title="Click to view full 5-hour and 7-day quota breakdown"
            >
              <Zap size={13} color={pct5h !== null && pct5h <= 10 ? '#f87171' : '#38bdf8'} />
              <span>
                Quota ({isGeminiModel ? 'Gemini' : 'Claude/GPT'}):{' '}
                <strong style={{ color: pct5h !== null && pct5h <= 15 ? '#f87171' : '#f1f5f9' }}>
                  {pct5h !== null ? `${pct5h}%` : `${Math.round((activeModelObj?.quotaFraction ?? 1) * 100)}%`}
                </strong>
                {' / '}
                <strong style={{ color: pctWeekly !== null && pctWeekly <= 15 ? '#f87171' : '#f1f5f9' }}>
                  {pctWeekly !== null ? `${pctWeekly}%` : '100%'}
                </strong>
              </span>
              <span className="quota-tag-label">(5h / 7d)</span>
            </button>
          </div>

          <div className="top-bar-controls">
            {/* Model Family Selector & Tier Pills */}
            <div className="control-group model-selector-group">
              <Cpu size={14} />
              <select
                className="select-control"
                value={activeFamily?.familyKey || ''}
                onChange={handleFamilyChange}
                title="Select Model Family"
              >
                {modelFamilies.map(f => (
                  <option key={f.familyKey} value={f.familyKey}>
                    {f.displayName}
                  </option>
                ))}
              </select>

              {/* Variant / Tier Pills (Low, Medium, High) if family has multiple variants */}
              {activeFamily && activeFamily.variants.length > 1 && (
                <div className="model-tiers-pills">
                  {activeFamily.variants.map(v => (
                    <button
                      key={v.modelEnum}
                      type="button"
                      className={`tier-pill-btn ${selectedModel === v.modelEnum ? 'active' : ''}`}
                      onClick={() => handleSelectModel(v.modelEnum)}
                      title={`${v.displayName} - ${v.tier || 'Default'}`}
                    >
                      {v.tier || 'Std'}
                    </button>
                  ))}
                </div>
              )}
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
        <div className="messages-container" ref={messagesContainerRef}>
          {isLoadingChat ? (
            <div className="chat-loading-state">
              <Loader2 size={26} className="spin-loader" />
              <span>Loading conversation history...</span>
            </div>
          ) : (
            messages.map((msg, idx) => (
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
                        const isFailed = Boolean(step.error || step.status === 'CORTEX_STEP_STATUS_ERROR');
                        // Failed tools default to EXPANDED so the user immediately sees the error!
                        const isCollapsed = collapsedTools[toolKey] !== undefined ? collapsedTools[toolKey] : false;

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
                          <div key={sIdx} className={`tool-box ${isFailed ? 'tool-failed' : ''}`} style={isFailed ? { borderColor: 'rgba(239, 68, 68, 0.4)' } : {}}>
                            <div
                              className="tool-header"
                              onClick={() => toggleTool(toolKey)}
                              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                                {isFailed ? (
                                  <AlertCircle size={14} color="#f87171" style={{ flexShrink: 0 }} />
                                ) : step.toolType === 'command' ? (
                                  <Terminal size={14} style={{ flexShrink: 0 }} />
                                ) : step.toolType === 'read' ? (
                                  <FileText size={14} color="#38bdf8" style={{ flexShrink: 0 }} />
                                ) : step.toolType === 'list' ? (
                                  <Folder size={14} color="#38bdf8" style={{ flexShrink: 0 }} />
                                ) : step.toolType === 'find' ? (
                                  <Search size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
                                ) : step.toolType === 'edit' ? (
                                  <Code size={14} color="#a855f7" style={{ flexShrink: 0 }} />
                                ) : step.toolType === 'search' ? (
                                  <Search size={14} color="#34d399" style={{ flexShrink: 0 }} />
                                ) : (
                                  <Terminal size={14} style={{ flexShrink: 0 }} />
                                )}
                                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                  {step.label || (step.command ? `Terminal: ${step.command}` : 'Tool Execution')}
                                </span>
                                {isFailed && (
                                  <span style={{ fontSize: '11px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, flexShrink: 0 }}>
                                    Failed
                                  </span>
                                )}
                              </div>
                              {(step.output || step.diff || step.error) && (
                                <span style={{ color: '#64748b' }}>
                                  {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                </span>
                              )}
                            </div>
                            {!isCollapsed && (
                              <>
                                {step.error && (
                                  <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.12)', borderLeft: '3px solid #ef4444', color: '#fca5a5', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '4px 8px', borderRadius: '0 4px 4px 0' }}>
                                    <div style={{ fontWeight: 600, marginBottom: '2px', color: '#ef4444' }}>Execution Error:</div>
                                    {step.error}
                                  </div>
                                )}
                                {step.diff && (
                                  <div className="tool-content">{step.diff}</div>
                                )}
                                {step.output && (!step.error || step.output !== `Search failed: ${step.error}`) && (
                                  <div className="tool-content">{step.output}</div>
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
          )))}
          <div ref={messagesEndRef} />
        </div>

        {/* Prompt Input Box */}
        <div className="input-area">
          {runningTasksCount > 0 && (
            <div className="running-tasks-banner" onClick={() => setShowTasksModal(true)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Loader2 size={14} className="spin" color="#fbbf24" />
                <span>
                  <strong>{runningTasksCount}</strong> background {runningTasksCount === 1 ? 'command' : 'commands'} currently executing
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="view-tasks-link">View Progress & Stop &rarr;</span>
              </div>
            </div>
          )}
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

      {/* Tasks & Process Inspector Modal */}
      {showTasksModal && (
        <div className="modal-overlay" onClick={() => setShowTasksModal(false)}>
          <div className="tasks-modal-content" onClick={e => e.stopPropagation()}>
            <div className="tasks-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Activity size={20} color="#38bdf8" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#f1f5f9' }}>Tasks & Process Inspector</h3>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                    Inspect commands, background processes, outputs, and stop active tasks
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTasksModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Toolbar: Filters & Search */}
            <div className="tasks-modal-toolbar">
              <div className="tasks-filter-tabs">
                <button
                  type="button"
                  className={`tasks-filter-tab ${tasksFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setTasksFilter('ALL')}
                >
                  All ({allTasks.length})
                </button>
                <button
                  type="button"
                  className={`tasks-filter-tab ${tasksFilter === 'RUNNING' ? 'active' : ''}`}
                  onClick={() => setTasksFilter('RUNNING')}
                  style={runningTasksCount > 0 ? { color: '#fbbf24', fontWeight: 600 } : {}}
                >
                  Running ({runningTasksCount})
                </button>
                <button
                  type="button"
                  className={`tasks-filter-tab ${tasksFilter === 'COMMANDS' ? 'active' : ''}`}
                  onClick={() => setTasksFilter('COMMANDS')}
                >
                  Commands ({allTasks.filter(t => t.type === 'command').length})
                </button>
                <button
                  type="button"
                  className={`tasks-filter-tab ${tasksFilter === 'FILES' ? 'active' : ''}`}
                  onClick={() => setTasksFilter('FILES')}
                >
                  Files ({allTasks.filter(t => t.type === 'read' || t.type === 'edit' || t.type === 'list').length})
                </button>
                <button
                  type="button"
                  className={`tasks-filter-tab ${tasksFilter === 'ERRORS' ? 'active' : ''}`}
                  onClick={() => setTasksFilter('ERRORS')}
                  style={allTasks.some(t => t.status === 'ERROR') ? { color: '#f87171' } : {}}
                >
                  Errors ({allTasks.filter(t => t.status === 'ERROR' || Boolean(t.error)).length})
                </button>
              </div>

              <input
                type="text"
                className="tasks-search-input"
                placeholder="Filter commands or files..."
                value={tasksSearch}
                onChange={e => setTasksSearch(e.target.value)}
              />
            </div>

            {/* Task Cards List */}
            <div className="tasks-list-scroll">
              {filteredTasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: '13px' }}>
                  No tasks or commands match the current filter.
                </div>
              ) : (
                filteredTasks.map(task => {
                  const isRunning = task.status === 'RUNNING';
                  const isError = task.status === 'ERROR' || Boolean(task.error);
                  const isDone = task.status === 'DONE';
                  const isWaiting = task.status === 'WAITING';
                  const isCancelled = task.status === 'CANCELLED';
                  const isExpanded = expandedModalTasks[task.stepIndex] ?? (isRunning || isError);

                  return (
                    <div
                      key={task.stepIndex}
                      className={`task-card-item ${isRunning ? 'running' : isError ? 'failed' : ''}`}
                    >
                      <div className="task-card-header" onClick={() => toggleModalTask(task.stepIndex)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b' }}>
                            #{task.stepIndex}
                          </span>

                          <span className={`task-badge-status ${task.status.toLowerCase()}`}>
                            {isRunning && <Loader2 size={10} className="spin" />}
                            {isDone && <Check size={10} />}
                            {isError && <AlertCircle size={10} />}
                            {isWaiting && <Clock size={10} />}
                            {isCancelled && <Ban size={10} />}
                            {task.status}
                          </span>

                          <span className="task-type-tag">[{task.type}]</span>

                          <span
                            style={{
                              fontSize: '12.5px',
                              color: '#f1f5f9',
                              fontFamily: task.type === 'command' ? 'monospace' : 'inherit',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '420px'
                            }}
                            title={task.label}
                          >
                            {task.label}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          {isRunning && (
                            <button
                              type="button"
                              className="btn-kill-task"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleKillTask(task.stepIndex);
                              }}
                              title="Cancel / Stop this running command"
                            >
                              <Square size={11} fill="#ef4444" /> Stop
                            </button>
                          )}

                          {(task.output || task.diff || task.error) && (
                            <span style={{ color: '#64748b', display: 'flex', alignItems: 'center' }}>
                              {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </span>
                          )}
                        </div>
                      </div>

                      {isExpanded && (task.output || task.diff || task.error) && (
                        <div className="task-expanded-body">
                          {task.error && (
                            <div style={{ padding: '8px 10px', background: 'rgba(239, 68, 68, 0.15)', borderLeft: '3px solid #ef4444', color: '#fca5a5', fontSize: '12px', marginBottom: '8px', borderRadius: '0 4px 4px 0', whiteSpace: 'pre-wrap' }}>
                              <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: '2px' }}>Error:</div>
                              {task.error}
                            </div>
                          )}

                          {task.diff && (
                            <div style={{ marginBottom: '8px' }}>
                              <pre className="task-output-pre" style={{ color: '#a78bfa' }}>{task.diff}</pre>
                            </div>
                          )}

                          {task.output && (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  Output
                                </span>
                                <button
                                  type="button"
                                  onClick={() => copyTaskOutput(task.stepIndex, task.output)}
                                  style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  {copiedStepIndex === task.stepIndex ? (
                                    <>
                                      <Check size={11} color="#34d399" />
                                      <span style={{ color: '#34d399' }}>Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={11} />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              </div>
                              <pre className="task-output-pre">{task.output}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quota Details Modal */}
      {showQuotaModal && (
        <div className="modal-overlay" onClick={() => setShowQuotaModal(false)}>
          <div className="modal-card quota-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} color="#38bdf8" />
                <div>
                  <h3 className="modal-title" style={{ margin: 0 }}>Model Quotas & Limits</h3>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>Real-time 5-hour and 7-day subscription usage</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={fetchQuotaSummary}
                  className="btn-icon"
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  title="Refresh Quota"
                  disabled={isRefreshingQuota}
                >
                  <RefreshCw size={14} className={isRefreshingQuota ? 'spin' : ''} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuotaModal(false)}
                  className="btn-icon"
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '4px' }}>
              {(quotaSummary?.groups || []).map((group, idx) => {
                const b5h = group.buckets?.find(b => b.window === '5h');
                const bWeekly = group.buckets?.find(b => b.window === 'weekly');
                const p5h = b5h?.remainingFraction !== undefined ? Math.round(b5h.remainingFraction * 100) : 100;
                const pWeekly = bWeekly?.remainingFraction !== undefined ? Math.round(bWeekly.remainingFraction * 100) : 100;

                const getBarColor = (pct) => {
                  if (pct > 40) return '#38bdf8';
                  if (pct > 15) return '#f59e0b';
                  return '#ef4444';
                };

                return (
                  <div key={idx} className="quota-group-card">
                    <div className="quota-group-header">
                      <div className="quota-group-title">
                        <span>{group.displayName}</span>
                        <span className="quota-pool-badge">Shared Pool</span>
                      </div>
                    </div>

                    <div className="quota-group-desc">
                      {group.description}
                    </div>

                    <div className="quota-gauges-grid">
                      {/* 5-Hour Limit Box */}
                      <div className="quota-gauge-box">
                        <div className="quota-gauge-top">
                          <span className="quota-gauge-window">5-Hour Limit</span>
                          <span className="quota-gauge-pct" style={{ color: getBarColor(p5h) }}>
                            {p5h}% Remaining
                          </span>
                        </div>
                        <div className="quota-bar-track">
                          <div
                            className="quota-bar-fill"
                            style={{ width: `${p5h}%`, background: getBarColor(p5h) }}
                          />
                        </div>
                        <div className="quota-reset-info">
                          <Clock size={12} color="#94a3b8" />
                          <span>Resets {formatQuotaResetTime(b5h?.resetTime)}</span>
                        </div>
                        {b5h?.description && (
                          <div className="quota-bucket-desc">
                            {b5h.description}
                          </div>
                        )}
                      </div>

                      {/* 7-Day Weekly Limit Box */}
                      <div className="quota-gauge-box">
                        <div className="quota-gauge-top">
                          <span className="quota-gauge-window">7-Day (Weekly) Limit</span>
                          <span className="quota-gauge-pct" style={{ color: getBarColor(pWeekly) }}>
                            {pWeekly}% Remaining
                          </span>
                        </div>
                        <div className="quota-bar-track">
                          <div
                            className="quota-bar-fill"
                            style={{ width: `${pWeekly}%`, background: getBarColor(pWeekly) }}
                          />
                        </div>
                        <div className="quota-reset-info">
                          <Clock size={12} color="#94a3b8" />
                          <span>Resets {formatQuotaResetTime(bWeekly?.resetTime)}</span>
                        </div>
                        {bWeekly?.description && (
                          <div className="quota-bucket-desc">
                            {bWeekly.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="quota-modal-footer-note">
                💡 <strong>How Quotas Work:</strong> Within each pool, models share both a 5-hour smoothing limit and a 7-day weekly limit. Token consumption is weighted by model capability. When the 5-hour limit is reached for Claude/GPT, you can continue working seamlessly using Gemini models.
              </div>
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
