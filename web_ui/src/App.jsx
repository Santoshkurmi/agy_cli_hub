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
  Ban,
  GitFork,
  RotateCcw,
  Mic,
  MicOff,
  Trash2,
  Paperclip,
  Image as ImageIcon,
  File
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

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function extractImageReferences(text) {
  if (!text || typeof text !== 'string') return [];
  const results = [];

  const toPreviewUrl = (p) => {
    if (!p) return '';
    if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) {
      return p;
    }
    const clean = p.replace(/^file:\/\//, '');
    return `/api/serve-file?path=${encodeURIComponent(clean)}`;
  };

  // Markdown image syntax: ![alt](url_or_path)
  const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = mdRegex.exec(text)) !== null) {
    const p = match[2].trim();
    if (!results.some(r => r.path === p)) {
      results.push({ alt: match[1] || 'Generated image', path: p, previewUrl: toPreviewUrl(p) });
    }
  }

  // Web image URLs: https://.../image.png
  const urlRegex = /(https?:\/\/[^\s"')>]+\.(?:png|jpe?g|webp|gif|svg))/gi;
  while ((match = urlRegex.exec(text)) !== null) {
    const u = match[1].trim();
    if (!results.some(r => r.path === u)) {
      results.push({ alt: u.split('/').pop() || 'Image', path: u, previewUrl: u });
    }
  }

  // Direct file paths (e.g. /home/cat/.../cow.png)
  const pathRegex = /(?:^|\s|["'(])((?:file:\/\/|\/|\.\/)[^\s"')>]+\.(?:png|jpe?g|webp|gif|svg))(?:\b|["')]|$)/g;
  while ((match = pathRegex.exec(text)) !== null) {
    const p = match[1].trim();
    if (!results.some(r => r.path === p)) {
      results.push({ alt: p.split('/').pop() || 'Image', path: p, previewUrl: toPreviewUrl(p) });
    }
  }

  return results;
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

// Helper to parse sessionId or route from current URL path
function getSessionIdFromUrl() {
  if (typeof window === 'undefined') return null;
  const pathname = window.location.pathname.replace(/^\/c\//, '/');
  const match = pathname.match(/^\/([0-9a-fA-F-]{36})$/);
  if (match) return match[1];
  if (pathname === '/new') return 'new';
  return null;
}

// Helper to update browser URL without triggering a full page refresh
function updateUrlForSession(sessionId, replace = false) {
  if (typeof window === 'undefined') return;
  const targetPath = sessionId ? `/${sessionId}` : '/new';
  if (window.location.pathname !== targetPath) {
    if (replace) {
      window.history.replaceState(null, '', targetPath);
    } else {
      window.history.pushState(null, '', targetPath);
    }
  }
}

export default function App() {
  const initialUrlId = getSessionIdFromUrl();
  const [hubUrl, setHubUrl] = useState('http://127.0.0.1:8090');
  const [connected, setConnected] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(initialUrlId && initialUrlId !== 'new' ? initialUrlId : null);
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

  // Sidebar Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState(null);

  // Slash Command Autocomplete States (Lazy-cached on first '/')
  const [cachedSlashCommands, setCachedSlashCommands] = useState(() => {
    try {
      const stored = localStorage.getItem('agy_slash_commands_cache');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);

  // Voice Recording & Audio Note States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [attachedAudio, setAttachedAudio] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const audioStreamRef = useRef(null);
  const recordingStartTimeRef = useRef(0);
  const recognitionRef = useRef(null);

  // Multi-File & Image Upload States
  const [attachedFiles, setAttachedFiles] = useState([]);
  const fileInputRef = useRef(null);

  // Git VCS State
  const [vcsState, setVcsState] = useState(null);
  const vcsAbortCtrlRef = useRef(null);

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
  const activeSessionIdRef = useRef(initialUrlId && initialUrlId !== 'new' ? initialUrlId : null);
  const hasInitialSelectedRef = useRef(Boolean(initialUrlId));

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  // Load conversation from URL on initial mount if a specific session ID is in the URL
  useEffect(() => {
    const urlSession = getSessionIdFromUrl();
    if (urlSession && urlSession !== 'new') {
      selectConversation(urlSession, false);
    }
  }, []);

  // Handle browser Back / Forward navigation (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const urlSession = getSessionIdFromUrl();
      if (urlSession === 'new' || !urlSession) {
        if (streamControllerRef.current) {
          streamControllerRef.current.abort();
          streamControllerRef.current = null;
        }
        setActiveSessionId(null);
        turnStartStepRef.current = 0;
        totalStepsRef.current = 0;
        setIsGenerating(false);
        isGeneratingRef.current = false;
        const projObj = projects.find(p => p.id === selectedProjectId);
        const projName = projObj?.name || workspaceDir.split('/').filter(Boolean).pop() || 'Workspace';
        setMessages([
          { role: 'system', content: `Workspace ready: ${workspaceDir} [${projName}]. Type a message to begin.` }
        ]);
      } else if (urlSession && urlSession !== activeSessionIdRef.current) {
        selectConversation(urlSession, false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [workspaceDir, selectedProjectId, projects]);

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

  // 1. Debounced Conversation Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const results = await client.searchConversations(searchQuery);
        setSearchResults(results);
      } catch (err) {
        console.warn('[Search] Failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 2. Live Git VCS State Watcher
  useEffect(() => {
    if (vcsAbortCtrlRef.current) {
      vcsAbortCtrlRef.current.abort();
    }
    const ctrl = new AbortController();
    vcsAbortCtrlRef.current = ctrl;

    client.watchVersionControlState(workspaceDir, (state) => {
      setVcsState(state);
    }, ctrl.signal);

    return () => {
      ctrl.abort();
    };
  }, [workspaceDir]);

  // Prevent browser from navigating away / opening images in full screen if dragged onto page
  useEffect(() => {
    const preventWindowDrop = (e) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', preventWindowDrop);
    window.addEventListener('drop', preventWindowDrop);
    return () => {
      window.removeEventListener('dragover', preventWindowDrop);
      window.removeEventListener('drop', preventWindowDrop);
    };
  }, []);

  // 3. Lazy-fetch slash commands (cached once on typing '/')
  const fetchSlashCommandsIfNeeded = useCallback(async () => {
    if (cachedSlashCommands && cachedSlashCommands.length > 0) return cachedSlashCommands;
    try {
      const cmds = await client.getSlashCommands(selectedModel);
      if (cmds && cmds.length > 0) {
        const formatted = cmds.map(c => ({
          name: c.info?.name,
          description: c.info?.description || c.info?.modelFacingText?.slice(0, 100) || '',
          type: c.info?.type || 'command'
        }));
        setCachedSlashCommands(formatted);
        try {
          localStorage.setItem('agy_slash_commands_cache', JSON.stringify(formatted));
        } catch {}
        return formatted;
      }
    } catch (err) {
      console.warn('[Slash Commands] Failed to fetch:', err);
    }
    return [];
  }, [cachedSlashCommands, selectedModel]);

  // 4. Fork Active Conversation into a New Branch
  const handleForkSession = async () => {
    if (!activeSessionId) return;
    try {
      showToast('Forking conversation...', 'info');
      // Pass the highest step index so the entire conversation up to the current turn is branched!
      const currentHighestStep = totalStepsRef.current > 0 ? (totalStepsRef.current - 1) : null;
      const newCascadeId = await client.forkConversation(activeSessionId, currentHighestStep, workspaceDir, selectedProjectId);
      if (newCascadeId) {
        saveSessionWorkspace(newCascadeId, workspaceDir, selectedProjectId);
        const currentConv = conversations.find(c => c.id === activeSessionId);
        const newTitle = currentConv ? `[Fork] ${currentConv.title}` : 'Forked Session';

        setConversations(prev => [{
          id: newCascadeId,
          title: newTitle,
          lastModified: new Date().toISOString(),
          stepCount: totalStepsRef.current || 1,
          workspaceDir,
          projectId: selectedProjectId
        }, ...prev]);

        selectConversation(newCascadeId);
        showToast('Conversation branched into a new session!', 'success');
      }
    } catch (err) {
      console.error('Failed to fork session:', err);
      showToast(`Fork failed: ${err.message}`, 'error');
    }
  };

  // Branch conversation from a specific turn
  const handleForkFromTurn = async (targetStepIndex) => {
    if (!activeSessionId || targetStepIndex === undefined) return;
    try {
      showToast(`Branching conversation from step #${targetStepIndex}...`, 'info');
      const newCascadeId = await client.forkConversation(activeSessionId, targetStepIndex, workspaceDir, selectedProjectId);
      if (newCascadeId) {
        saveSessionWorkspace(newCascadeId, workspaceDir, selectedProjectId);
        const currentConv = conversations.find(c => c.id === activeSessionId);
        const newTitle = currentConv ? `[Branch @#${targetStepIndex}] ${currentConv.title}` : 'Branched Session';

        setConversations(prev => [{
          id: newCascadeId,
          title: newTitle,
          lastModified: new Date().toISOString(),
          stepCount: targetStepIndex + 1,
          workspaceDir,
          projectId: selectedProjectId
        }, ...prev]);

        selectConversation(newCascadeId);
        showToast(`Branched conversation from step #${targetStepIndex}!`, 'success');
      }
    } catch (err) {
      console.error('Failed to branch from turn:', err);
      showToast(`Branch failed: ${err.message}`, 'error');
    }
  };

  // 5. Revert Last Message: removes from chat/daemon and restores text to input box
  const handleRevertLastTurn = async () => {
    if (!activeSessionId) return;

    let lastUserMsg = null;
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMsg = messages[i];
        lastUserIdx = i;
        break;
      }
    }

    if (!lastUserMsg) return;

    const confirm = window.confirm('Revert the last message and restore it to the input box?');
    if (!confirm) return;

    try {
      showToast('Reverting last message...', 'info');

      // 1. Immediately abort active stream so incoming updates do not conflict
      if (streamControllerRef.current) {
        streamControllerRef.current.abort();
        streamControllerRef.current = null;
      }

      // 2. Restore message content and any attachments into input box
      if (lastUserMsg.content) {
        setInputPrompt(lastUserMsg.content);
      }
      if (lastUserMsg.files && lastUserMsg.files.length > 0) {
        setAttachedFiles(lastUserMsg.files);
      }
      if (lastUserMsg.audio) {
        setAttachedAudio(lastUserMsg.audio);
      }

      // 3. Revert on the daemon using client.revertLastUserMessage
      const result = await client.revertLastUserMessage(activeSessionId, selectedModel, autoExecutionPolicy);

      if (result.isReset) {
        // Only 1 user message existed: reset conversation back to initial workspace ready state
        const projObj = projects.find(p => p.id === selectedProjectId);
        const projName = projObj?.name || workspaceDir.split('/').filter(Boolean).pop() || 'Workspace';
        setMessages([
          { role: 'system', content: `Workspace ready: ${workspaceDir} [${projName}]. Type a message to begin.` }
        ]);
        turnStartStepRef.current = 0;
        totalStepsRef.current = 0;
        setIsGenerating(false);
        isGeneratingRef.current = false;
        // Clean up empty trajectory from server & sidebar
        client.deleteCascadeTrajectory(activeSessionId).catch(() => {});
        setConversations(prev => prev.filter(c => c.id !== activeSessionId));
        setActiveSessionId(null);
        updateUrlForSession(null);
        showToast('Message undone and restored to input box!', 'success');
      } else {
        // Prune the undone user message and its assistant response immediately from local UI
        setMessages(prev => prev.slice(0, lastUserIdx));
        turnStartStepRef.current = result.revertedToStep;
        totalStepsRef.current = result.revertedToStep + 1;
        setIsGenerating(false);
        isGeneratingRef.current = false;

        // Reconnect stream cleanly to receive the accurate truncated server state
        startPersistentStream(activeSessionId);
        showToast('Message undone and restored to input box!', 'success');
      }
    } catch (err) {
      console.error('Failed to revert last message:', err);
      showToast(`Revert failed: ${err.message}`, 'error');
      // If error, reconnect stream so chat is restored
      startPersistentStream(activeSessionId);
    }
  };

  // 6. Voice Audio Recording (MediaRecorder + Speech API)
  const startAudioRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        showToast('Microphone access is not supported in this browser.', 'error');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      let mimeType = 'audio/webm;codecs=opus';
      if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/ogg';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Also start speech recognition if supported to get instant live text preview
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';
          rec.onresult = (ev) => {
            let tr = '';
            for (let i = 0; i < ev.results.length; i++) {
              tr += ev.results[i][0].transcript;
            }
            if (tr) setInputPrompt(tr);
          };
          rec.onerror = () => {};
          rec.start();
          recognitionRef.current = rec;
        } catch {}
      }

      recordingStartTimeRef.current = Date.now();
      setRecordingTime(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
        setRecordingTime(secs);
      }, 500);

      recorder.onstop = () => {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch {}
          recognitionRef.current = null;
        }

        const dur = Math.max(1, Math.floor((Date.now() - recordingStartTimeRef.current) / 1000));
        const mins = Math.floor(dur / 60);
        const secs = (dur % 60).toString().padStart(2, '0');
        const formatted = `${mins}:${secs}`;

        const recordedBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const audioUrl = URL.createObjectURL(recordedBlob);

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Data = (reader.result || '').split(',')[1] || '';
          const audioObj = {
            blob: recordedBlob,
            url: audioUrl,
            base64: base64Data,
            duration: dur,
            durationFormatted: formatted,
            mimeType: recordedBlob.type || 'audio/webm',
            transcription: inputPrompt.trim()
          };
          setAttachedAudio(audioObj);

          // Ask backend daemon for transcription if inputPrompt is empty
          if (!inputPrompt.trim() && base64Data) {
            client.getTranscription(base64Data).then(transcribed => {
              if (transcribed) {
                setAttachedAudio(prev => prev ? { ...prev, transcription: transcribed } : null);
                setInputPrompt(transcribed);
              }
            }).catch(() => {});
          }
        };
        reader.readAsDataURL(recordedBlob);

        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(t => t.stop());
          audioStreamRef.current = null;
        }
      };

      recorder.start(100);
      setIsRecording(true);
      showToast('Recording voice note. Speak into microphone.', 'info');
    } catch (err) {
      console.error('Failed to access microphone:', err);
      showToast(`Microphone error: ${err.message}`, 'error');
      setIsRecording(false);
    }
  };

  const stopAudioRecording = () => {
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('Error stopping MediaRecorder:', err);
      }
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    showToast('Voice note recorded & attached. Click Send to submit.', 'success');
  };

  const cancelAudioRecording = () => {
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    audioChunksRef.current = [];
    showToast('Voice recording canceled.', 'info');
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopAudioRecording();
    } else {
      startAudioRecording();
    }
  };

  const handleVoiceSend = (e) => {
    e?.preventDefault();
    if (isRecording) {
      stopAudioRecording();
      setTimeout(() => {
        handleSendMessage(e);
      }, 150);
      return;
    }
    handleSendMessage(e);
  };

  // 7. Multi-File & Image Upload Handlers
  const handleFilesSelected = (filesList) => {
    if (!filesList || filesList.length === 0) return;
    const filesArray = Array.from(filesList);

    filesArray.forEach((file) => {
      const isImg = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?)$/i.test(file.name);
      const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const previewUrl = isImg ? URL.createObjectURL(file) : null;

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Content = (reader.result || '').split(',')[1] || '';
        const isText = file.type.startsWith('text/') || /\.(txt|md|js|jsx|ts|tsx|json|html|css|py|sh|yaml|yml|log|csv)$/i.test(file.name);
        if (isText) {
          const textReader = new FileReader();
          textReader.onloadend = () => {
            setAttachedFiles(prev => [
              ...prev,
              {
                id: fileId,
                file,
                name: file.name,
                size: file.size,
                sizeFormatted: formatFileSize(file.size),
                type: file.type || (isImg ? 'image/png' : 'application/octet-stream'),
                isImage: isImg,
                previewUrl,
                base64: base64Content,
                textContent: textReader.result || ''
              }
            ]);
          };
          textReader.readAsText(file);
        } else {
          setAttachedFiles(prev => [
            ...prev,
            {
              id: fileId,
              file,
              name: file.name,
              size: file.size,
              sizeFormatted: formatFileSize(file.size),
              type: file.type || (isImg ? 'image/png' : 'application/octet-stream'),
              isImage: isImg,
              previewUrl,
              base64: base64Content,
              textContent: null
            }
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachedFile = (id) => {
    setAttachedFiles(prev => {
      const target = prev.find(f => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  };

  const handlePaste = (e) => {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      handleFilesSelected(e.clipboardData.files);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  // Slash Command Input Handlers
  const handlePromptChange = async (e) => {
    const val = e.target.value;
    setInputPrompt(val);

    // If starts with '/' or has a trailing space and '/', open autocomplete
    const match = val.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);
    if (match) {
      setSlashMenuOpen(true);
      setSlashSelectedIndex(0);
      if (!cachedSlashCommands) {
        await fetchSlashCommandsIfNeeded();
      }
    } else {
      setSlashMenuOpen(false);
    }
  };

  const filteredSlashCommands = useMemo(() => {
    if (!cachedSlashCommands) return [];
    const match = inputPrompt.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);
    if (!match) return cachedSlashCommands;
    const filterTerm = match[1].toLowerCase();
    if (!filterTerm) return cachedSlashCommands;
    return cachedSlashCommands.filter(c =>
      c.name.toLowerCase().includes(filterTerm) || c.description.toLowerCase().includes(filterTerm)
    );
  }, [cachedSlashCommands, inputPrompt]);

  const applySlashCommand = (cmdName) => {
    setInputPrompt(prev => {
      const replaced = prev.replace(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/, ` /${cmdName} `);
      return replaced.trimStart();
    });
    setSlashMenuOpen(false);
  };

  const handlePromptKeyDown = (e) => {
    if (slashMenuOpen && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIndex(prev => (prev + 1) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIndex(prev => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const picked = filteredSlashCommands[slashSelectedIndex];
        if (picked) {
          applySlashCommand(picked.name);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenuOpen(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowQuotaModal(false);
        setShowTasksModal(false);
        setShowProjectModal(false);
        setSlashMenuOpen(false);
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

          if (!hasInitialSelectedRef.current && !activeSessionIdRef.current) {
            const urlTarget = getSessionIdFromUrl();
            if (urlTarget === 'new') {
              hasInitialSelectedRef.current = true;
            } else if (urlTarget && sorted.some(s => s.id === urlTarget)) {
              hasInitialSelectedRef.current = true;
              selectConversation(urlTarget, true);
            } else if (sorted.length > 0 && !urlTarget) {
              hasInitialSelectedRef.current = true;
              selectConversation(sorted[0].id, true);
            }
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
    updateUrlForSession(null);
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

          // Only sync messages from init chunk if we are NOT in the middle of sending/generating a message!
          if (!isGeneratingRef.current) {
            if (update.messages && update.messages.length > 0) {
              setMessages(update.messages);
            } else if (update.messages && update.messages.length === 0) {
              const projObj = projects.find(p => p.id === selectedProjectId);
              const projName = projObj?.name || workspaceDir.split('/').filter(Boolean).pop() || 'Workspace';
              setMessages([
                { role: 'system', content: `Workspace ready: ${workspaceDir} [${projName}]. Type a message to begin.` }
              ]);
            }
          }

          setIsLoadingChat(false);
          if (update.isRunning) {
            setIsGenerating(true);
            isGeneratingRef.current = true;
          } else if (!isGeneratingRef.current) {
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
          } else if (update.type === 'generate_image') {
            let genStep = stepObj || last.steps.find(s => s.type === 'generate_image' && (s.stepIndex === update.stepIndex || s.imageName === update.imageName));
            if (!genStep) {
              const newStep = {
                stepIndex: update.stepIndex,
                type: 'generate_image',
                prompt: update.prompt,
                imageName: update.imageName,
                filePath: update.filePath || '',
                previewUrl: update.previewUrl || (update.filePath ? `/api/serve-file?path=${encodeURIComponent(update.filePath.replace(/^file:\/\//, ''))}` : ''),
                status: update.status
              };
              last.steps.push(newStep);
            } else {
              const sIdx = last.steps.indexOf(genStep);
              const mergedFilePath = update.filePath || genStep.filePath || '';
              const mergedPreviewUrl = update.previewUrl || genStep.previewUrl || (mergedFilePath ? `/api/serve-file?path=${encodeURIComponent(mergedFilePath.replace(/^file:\/\//, ''))}` : '');
              last.steps[sIdx] = {
                ...genStep,
                type: 'generate_image',
                prompt: update.prompt || genStep.prompt,
                imageName: update.imageName || genStep.imageName,
                filePath: mergedFilePath,
                previewUrl: mergedPreviewUrl,
                status: update.status || genStep.status
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

  const selectConversation = async (id, updateUrl = true) => {
    if (id === activeSessionId && !isLoadingChat) return;
    setActiveSessionId(id);
    if (updateUrl) {
      updateUrlForSession(id);
    }
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

  const handleDeleteConversation = async (sessionId, e) => {
    e?.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this session?')) return;
    setDeletingSessionId(sessionId);
    try {
      await client.deleteCascadeTrajectory(sessionId);
      setConversations(prev => prev.filter(c => c.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        updateUrlForSession(null);
        setMessages([]);
        if (streamControllerRef.current) {
          streamControllerRef.current.abort();
          streamControllerRef.current = null;
        }
      }
      showToast('Session deleted successfully', 'success');
    } catch (err) {
      console.error('Failed to delete session:', err);
      showToast(`Failed to delete session: ${err.message}`, 'error');
    } finally {
      setDeletingSessionId(null);
    }
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

    let currentAudio = attachedAudio;
    let currentFiles = attachedFiles;

    // If recording voice, stop audio recorder
    if (isRecording) {
      stopAudioRecording();
    }

    const currentPrompt = inputPrompt;

    if ((!currentPrompt.trim() && !currentAudio && currentFiles.length === 0) || isGenerating) return;

    setInputPrompt('');
    setAttachedAudio(null);
    setAttachedFiles([]);
    isGeneratingRef.current = true;
    setIsGenerating(true);

    // 1. Snapshot current step count as the turn boundary for this message.
    turnStartStepRef.current = totalStepsRef.current;

    // 2. Append user message & placeholder assistant turn immediately
    setMessages(prev => [
      ...prev.filter(m => m.role !== 'system'),
      {
        role: 'user',
        content: currentPrompt,
        audio: currentAudio,
        files: currentFiles,
        stepIndex: totalStepsRef.current
      },
      { role: 'assistant', steps: [] }
    ]);

    const modelToUse = selectedModel || models[0]?.modelEnum || 'MODEL_PLACEHOLDER_M319';

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      try {
        targetSessionId = await client.startConversation(modelToUse, workspaceDir, selectedProjectId);
        setActiveSessionId(targetSessionId);
        updateUrlForSession(targetSessionId);
        saveSessionWorkspace(targetSessionId, workspaceDir, selectedProjectId);
        const projObj = projects.find(p => p.id === selectedProjectId);
        const projName = projObj?.name || workspaceDir.split('/').filter(Boolean).pop() || 'Workspace';
        const sessionTitle = currentPrompt.slice(0, 30) || (currentAudio ? `Voice Note (${currentAudio.durationFormatted})` : (currentFiles.length > 0 ? `Files (${currentFiles.length})` : 'New Session'));
        setConversations(prev => [{
          id: targetSessionId,
          title: sessionTitle,
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
        setIsGenerating(false);
        isGeneratingRef.current = false;
        return;
      }
    }

    // Check if user requested planning mode via /plan slash command
    const isPlan = currentPrompt.trim().startsWith('/plan');
    const actualText = isPlan
      ? currentPrompt.trim().replace(/^\/plan\s*/i, '') || 'Create a comprehensive implementation plan'
      : currentPrompt;

    try {
      const imagePayload = currentFiles.filter(f => f.isImage).map(f => ({ value: f.base64 }));
      const fileMediaPayload = currentFiles.map(f => ({
        mimeType: f.type || 'application/octet-stream',
        inlineData: f.base64,
        description: f.name
      }));
      const audioMediaPayload = currentAudio ? [{
        mimeType: currentAudio.mimeType || 'audio/webm',
        inlineData: currentAudio.base64,
        durationSeconds: currentAudio.duration || 0,
        description: currentAudio.transcription || 'Voice note'
      }] : [];
      const allMedia = [...audioMediaPayload, ...fileMediaPayload];

      // For text and code files, append formatted code blocks to actualText so the LLM gets full text access
      let textToSend = actualText;
      const textDocs = currentFiles.filter(f => f.textContent);
      if (textDocs.length > 0) {
        const docSnippets = textDocs.map(f => `\n[Attached File: ${f.name}]\n\`\`\`\n${f.textContent}\n\`\`\``).join('\n');
        textToSend = textToSend ? `${textToSend}\n\n${docSnippets}` : docSnippets;
      }
      if (!textToSend && currentAudio) {
        textToSend = currentAudio.transcription ? `Voice message: "${currentAudio.transcription}"` : 'Voice message';
      } else if (!textToSend && currentFiles.length > 0) {
        textToSend = `Attached ${currentFiles.length} ${currentFiles.length === 1 ? 'file' : 'files'}`;
      }

      await client.sendMessage({
        cascadeId: targetSessionId,
        text: textToSend,
        modelEnum: modelToUse,
        thinkingBudget: parseInt(thinkingBudget, 10),
        autoExecutionPolicy,
        media: allMedia,
        images: imagePayload,
        ...(isPlan ? { planningMode: 'PLANNING_MODE_ON' } : {})
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

        {/* Sidebar Search Bar */}
        <div className="sidebar-search-container">
          <div className="sidebar-search-box">
            <Search size={13} color="#64748b" />
            <input
              type="text"
              className="sidebar-search-input"
              placeholder="Search all conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                title="Clear Search"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {searchQuery.trim() ? (
          <div className="sidebar-search-results">
            {isSearching ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px', color: '#64748b', fontSize: '12px' }}>
                <Loader2 size={14} className="spin" />
                <span>Searching conversations...</span>
              </div>
            ) : searchResults.length === 0 ? (
              <div style={{ padding: '20px 12px', color: '#64748b', fontSize: '12px', textAlign: 'center' }}>
                No matching conversations found
              </div>
            ) : (
              searchResults.map((res) => (
                <div
                  key={res.cascadeId}
                  className={`search-result-item ${res.cascadeId === activeSessionId ? 'active' : ''}`}
                  onClick={() => selectConversation(res.cascadeId)}
                >
                  <div className="search-result-title">{res.title || 'Untitled Session'}</div>
                  {res.snippet && (
                    <div className="search-result-snippet">{res.snippet}</div>
                  )}
                  <div className="search-result-meta">
                    <span>{res.workspaceName || 'Workspace'}</span>
                    <span>{res.lastModifiedTime ? new Date(res.lastModifiedTime).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
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
                            <span>{chat.stepCount} steps</span>
                            <span>{new Date(chat.lastModified).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                          </div>
                          <button
                            type="button"
                            className={`btn-delete-chat ${deletingSessionId === chat.id ? 'deleting' : ''}`}
                            title="Delete session"
                            onClick={(e) => handleDeleteConversation(chat.id, e)}
                          >
                            {deletingSessionId === chat.id ? (
                              <Loader2 size={13} className="spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                          </button>
                        </div>
                      );
                    })}
                    {hasMore && (
                      <button
                        type="button"
                        className="btn-show-more-chats"
                        onClick={() => toggleProjectExpand(group.id)}
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp size={12} /> Show Less
                          </>
                        ) : (
                          <>
                            <ChevronDown size={12} /> Show All ({group.chats.length})
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
        )}
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

            {/* Fork Conversation Branch Button */}
            {activeSessionId && (
              <button
                type="button"
                className="btn-fork-session"
                onClick={handleForkSession}
                title="Branch / Clone this conversation into a new session (/fork)"
              >
                <GitFork size={13} />
                <span>Fork</span>
              </button>
            )}

            {/* Live Git VCS Indicator */}
            {vcsState && (
              <div
                className="git-vcs-badge"
                title={`Git Branch: ${vcsState.currentRef || 'main'} | Upstream: ${vcsState.upstreamBranch || 'None'}`}
              >
                <GitBranch size={13} color="#34d399" />
                <span className="git-vcs-branch">{vcsState.currentRef || 'main'}</span>
                {(vcsState.commitsAhead > 0 || vcsState.commitsBehind > 0) && (
                  <span className="git-vcs-sync">
                    {vcsState.commitsAhead > 0 ? `↑${vcsState.commitsAhead}` : ''}
                    {vcsState.commitsBehind > 0 ? `↓${vcsState.commitsBehind}` : ''}
                  </span>
                )}
              </div>
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
            (() => {
              let lastUserIdx = -1;
              for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'user') {
                  lastUserIdx = i;
                  break;
                }
              }
              return messages.map((msg, idx) => (
            <div key={idx} className="message-row">
              {msg.role === 'system' ? (
                <div className="message-system">
                  <Folder size={14} color="#38bdf8" />
                  <span>{msg.content}</span>
                </div>
              ) : msg.role === 'user' ? (
                <div className="message-user" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {msg.content && <span>{msg.content}</span>}
                    {msg.audio && (
                      <div className="message-audio-player">
                        <div className="audio-player-meta">
                          <Mic size={12} color="#38bdf8" />
                          <span>Voice Note ({msg.audio.durationFormatted})</span>
                        </div>
                        <audio controls src={msg.audio.url} className="chat-audio-element" />
                      </div>
                    )}
                    {msg.files && msg.files.length > 0 && (
                      <div className="message-attached-files-row">
                        {msg.files.map((f, fIdx) => (
                          f.isImage ? (
                            <div key={fIdx} className="message-image-thumb-box">
                              <img src={f.previewUrl} alt={f.name} className="message-user-img" />
                              <span className="message-img-caption" title={f.name}>{f.name}</span>
                            </div>
                          ) : (
                            <div key={fIdx} className="message-file-badge">
                              <FileText size={12} color="#38bdf8" />
                              <span className="message-file-name" title={f.name}>{f.name}</span>
                              <span className="message-file-size">({f.sizeFormatted})</span>
                            </div>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                  {activeSessionId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {idx > 0 && (
                        <button
                          type="button"
                          className="btn-revert-turn"
                          onClick={() => handleForkFromTurn(msg.stepIndex ?? (idx > 0 ? idx - 1 : 0))}
                          title="Branch conversation from this turn into a new session"
                        >
                          <GitBranch size={10} /> Fork
                        </button>
                      )}
                      {idx === lastUserIdx && (
                        <button
                          type="button"
                          className="btn-revert-turn"
                          onClick={handleRevertLastTurn}
                          title="Undo this message and restore it to the input box"
                        >
                          <RotateCcw size={10} /> Revert
                        </button>
                      )}
                    </div>
                  )}
                </div>
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
                        const extractedImages = step.content ? extractImageReferences(step.content) : [];
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
                            {extractedImages.length > 0 && (
                              <div className="generated-images-container">
                                {extractedImages.map((img, iIdx) => {
                                  const isWebUrl = img.path.startsWith('http://') || img.path.startsWith('https://') || img.path.startsWith('data:');
                                  return (
                                    <div key={iIdx} className="generated-image-card">
                                      <div className="generated-image-header">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <ImageIcon size={14} color="#38bdf8" />
                                          <span className="generated-image-title">Generated Image: {img.alt}</span>
                                        </div>
                                        <button
                                          type="button"
                                          className="btn-copy-image-path"
                                          onClick={() => {
                                            navigator.clipboard.writeText(img.path);
                                            showToast('Image path copied to clipboard', 'success');
                                          }}
                                          title="Copy image path"
                                        >
                                          <Copy size={12} /> Copy Path
                                        </button>
                                      </div>
                                      <div className="generated-image-filepath-box">
                                        <code className="image-filepath-text">{img.path}</code>
                                      </div>
                                      <div className="generated-image-preview">
                                        <img
                                          src={img.previewUrl || img.path}
                                          alt={img.alt}
                                          className="response-img"
                                          onError={(e) => {
                                            if (!e.currentTarget.dataset.retried) {
                                              e.currentTarget.dataset.retried = 'true';
                                              const clean = img.path.replace(/^file:\/\//, '');
                                              e.currentTarget.src = `/api/serve-file?path=${encodeURIComponent(clean)}`;
                                            } else {
                                              e.currentTarget.style.display = 'none';
                                            }
                                          }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (step.type === 'generate_image') {
                        return (
                          <div key={sIdx} className="step-block">
                            <div className="generated-image-card">
                              <div className="generated-image-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <ImageIcon size={14} color="#38bdf8" />
                                  <span className="generated-image-title">Generated Image: {step.imageName || 'Image'}</span>
                                </div>
                                {step.filePath && (
                                  <button
                                    type="button"
                                    className="btn-copy-image-path"
                                    onClick={() => {
                                      navigator.clipboard.writeText(step.filePath);
                                      showToast('Image path copied to clipboard', 'success');
                                    }}
                                    title="Copy image path"
                                  >
                                    <Copy size={12} /> Copy Path
                                  </button>
                                )}
                              </div>
                              {step.prompt && (
                                <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', marginBottom: '8px' }}>
                                  "{step.prompt}"
                                </div>
                              )}
                              {step.filePath && (
                                <div className="generated-image-filepath-box">
                                  <code className="image-filepath-text">{step.filePath}</code>
                                </div>
                              )}
                              {(step.previewUrl || step.filePath) ? (
                                <div className="generated-image-preview">
                                  <img
                                    src={step.previewUrl || `/api/serve-file?path=${encodeURIComponent(step.filePath.replace(/^file:\/\//, ''))}`}
                                    alt={step.imageName || 'Generated image'}
                                    className="response-img"
                                    onError={(e) => {
                                      if (step.filePath && !e.currentTarget.dataset.retried) {
                                        e.currentTarget.dataset.retried = 'true';
                                        e.currentTarget.src = `/api/serve-file?path=${encodeURIComponent(step.filePath.replace(/^file:\/\//, ''))}`;
                                      }
                                    }}
                                  />
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '13px', padding: '12px 0' }}>
                                  <Loader2 size={15} className="spin" color="#38bdf8" />
                                  <span>Generating image, please wait...</span>
                                </div>
                              )}
                            </div>
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
          ));
        })()
      )}
          <div ref={messagesEndRef} />
        </div>

        {/* Prompt Input Box */}
        <div className="input-area" onDragOver={handleDragOver} onDrop={handleDrop} style={{ position: 'relative' }}>
          <div className="input-inner-container">
            {/* Slash Command Autocomplete Popover */}
            {slashMenuOpen && filteredSlashCommands.length > 0 && (
              <div className="slash-autocomplete-popover">
                <div className="slash-autocomplete-header">
                  Slash Commands & Skills ({filteredSlashCommands.length})
                </div>
                {filteredSlashCommands.map((cmd, idx) => (
                  <div
                    key={cmd.name}
                    className={`slash-command-item ${idx === slashSelectedIndex ? 'active' : ''}`}
                    onClick={() => applySlashCommand(cmd.name)}
                    onMouseEnter={() => setSlashSelectedIndex(idx)}
                  >
                    <div className="slash-command-left">
                      <span className="slash-command-name">/{cmd.name}</span>
                      <span className="slash-command-desc">{cmd.description}</span>
                    </div>
                    <span className="slash-command-tag">{cmd.type || 'command'}</span>
                  </div>
                ))}
              </div>
            )}

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

            {isRecording && (
              <div className="voice-recording-banner">
                <div className="voice-recording-left">
                  <span className="voice-recording-dot"></span>
                  <span className="voice-recording-label">
                    Recording ({Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')})
                  </span>
                  <div className="voice-wave-container">
                    <span className="voice-wave-bar"></span>
                    <span className="voice-wave-bar"></span>
                    <span className="voice-wave-bar"></span>
                    <span className="voice-wave-bar"></span>
                    <span className="voice-wave-bar"></span>
                  </div>
                  <span className="voice-recording-hint">Speak now — click Stop to review or Send Now to submit</span>
                </div>
                <div className="voice-recording-actions">
                  <button
                    type="button"
                    className="btn-cancel-voice-recording"
                    onClick={cancelAudioRecording}
                    title="Discard recording"
                  >
                    <X size={12} /> Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-stop-voice-recording"
                    onClick={stopAudioRecording}
                    title="Stop recording and keep voice note attached"
                  >
                    <Square size={11} fill="currentColor" /> Stop
                  </button>
                  <button
                    type="button"
                    className="btn-send-voice-recording"
                    onClick={handleVoiceSend}
                    title="Stop and send prompt immediately"
                  >
                    <Send size={12} /> Send Now
                  </button>
                </div>
              </div>
            )}

            {attachedAudio && (
              <div className="attached-audio-card">
                <div className="attached-audio-left">
                  <div className="attached-audio-icon-box">
                    <Mic size={14} color="#38bdf8" />
                  </div>
                  <div className="attached-audio-details">
                    <div className="attached-audio-title-row">
                      <span className="attached-audio-badge">Voice Note</span>
                      <span className="attached-audio-time">{attachedAudio.durationFormatted}</span>
                    </div>
                    {attachedAudio.transcription && (
                      <div className="attached-audio-transcript">
                        "{attachedAudio.transcription}"
                      </div>
                    )}
                  </div>
                </div>
                <audio controls src={attachedAudio.url} className="attached-audio-player" />
                <button
                  type="button"
                  className="btn-remove-audio"
                  onClick={() => setAttachedAudio(null)}
                  title="Discard attached voice note"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}

            {/* Nice compact attachment preview box docked neatly right above chat */}
            {attachedFiles.length > 0 && (
              <div className="attached-files-preview-bar">
                <div className="attached-files-header">
                  <div className="attached-files-title">
                    <Paperclip size={12} color="#38bdf8" />
                    <span>Attachments ({attachedFiles.length})</span>
                  </div>
                  <button
                    type="button"
                    className="btn-clear-all-files"
                    onClick={() => {
                      attachedFiles.forEach(f => {
                        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
                      });
                      setAttachedFiles([]);
                    }}
                    title="Remove all attachments"
                  >
                    Clear all
                  </button>
                </div>
                <div className="attached-files-scroll">
                  {attachedFiles.map((fileItem) => (
                    <div
                      key={fileItem.id}
                      className={`file-preview-card ${fileItem.isImage ? 'is-image' : 'is-doc'}`}
                      title={`${fileItem.name} (${fileItem.sizeFormatted})`}
                    >
                      {fileItem.isImage ? (
                        <div className="image-thumbnail-wrapper">
                          <img
                            src={fileItem.previewUrl}
                            alt={fileItem.name}
                            className="image-preview-thumb"
                          />
                          <div className="file-name-overlay">{fileItem.name}</div>
                        </div>
                      ) : (
                        <div className="doc-preview-content">
                          <FileText size={14} color="#38bdf8" />
                          <div className="doc-preview-meta">
                            <span className="doc-preview-name">{fileItem.name}</span>
                            <span className="doc-preview-size">{fileItem.sizeFormatted}</span>
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        className="btn-remove-attached-file"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAttachedFile(fileItem.id);
                        }}
                        title={`Remove ${fileItem.name}`}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <input
              type="file"
              multiple
              ref={fileInputRef}
              accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,text/*,.txt,.md,.py,.js,.jsx,.ts,.tsx,.json,.html,.css,.sh,.yml,.yaml,.log"
              style={{ display: 'none' }}
              onChange={(e) => {
                handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
            />

            <form className="input-box-wrapper" onSubmit={handleSendMessage}>
              <textarea
                className="chat-input"
                placeholder={isRecording ? "Listening to your voice..." : (attachedAudio ? "Add optional instructions to your voice note..." : (attachedFiles.length > 0 ? "Add message for attached files (or press Send)..." : "Type / for commands & skills, or prompt agy daemon directly..."))}
                value={inputPrompt}
                onChange={handlePromptChange}
                onKeyDown={handlePromptKeyDown}
                onPaste={handlePaste}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  className="btn-attach-files"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach files or images (multiple allowed)"
                >
                  <Paperclip size={15} />
                </button>

                <button
                  type="button"
                  className={`btn-mic ${isRecording ? 'recording' : ''}`}
                  onClick={toggleRecording}
                  title={isRecording ? 'Stop Voice Recording' : 'Record Voice Note'}
                >
                  {isRecording ? (
                    <>
                      <Square size={11} fill="currentColor" />
                      <span style={{ fontSize: '11px', fontWeight: 600, marginLeft: '4px' }}>
                        {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                      </span>
                    </>
                  ) : (
                    <Mic size={15} />
                  )}
                </button>

                {isGenerating ? (
                  <button type="button" className="stop-button" onClick={handleStop}>
                    <Square size={14} /> Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="send-button"
                    disabled={(!inputPrompt.trim() && !attachedAudio && attachedFiles.length === 0 && !isRecording) || isGenerating}
                  >
                    <Send size={14} /> Send
                  </button>
                )}
              </div>
            </form>
          </div>
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
