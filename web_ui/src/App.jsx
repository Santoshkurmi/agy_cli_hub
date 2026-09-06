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
  X
} from 'lucide-react';
import { AntigravityBrowserClient } from './agyClient';

const client = new AntigravityBrowserClient('http://127.0.0.1:8090');

export default function App() {
  const [hubUrl, setHubUrl] = useState('http://127.0.0.1:8090');
  const [connected, setConnected] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [thinkingBudget, setThinkingBudget] = useState(8192);
  const [autoExecute, setAutoExecute] = useState(true);

  // Projects and Workspace Folders
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('default-cli-project');
  const [workspaceDir, setWorkspaceDir] = useState('/home/cat/agy_cli_hub');
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [modalMode, setModalMode] = useState('new'); // 'new' | 'switch'
  const [tempCustomPath, setTempCustomPath] = useState('/home/cat/agy_cli_hub');
  const [tempSelectedProjectId, setTempSelectedProjectId] = useState('default-cli-project');

  const [messages, setMessages] = useState([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [collapsedThinking, setCollapsedThinking] = useState({});
  const [collapsedTools, setCollapsedTools] = useState({});
  const [showConfig, setShowConfig] = useState(false);

  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

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
      if (convList.length > 0 && !activeSessionId) {
        selectConversation(convList[0].id);
      }
    } catch (err) {
      console.warn('[UI] Connect check failed:', err.message);
      setConnected(false);
    }
  };

  const openNewSessionModal = () => {
    setModalMode('new');
    setTempCustomPath(workspaceDir || '/home/cat/agy_cli_hub');
    setTempSelectedProjectId(selectedProjectId || 'default-cli-project');
    setShowProjectModal(true);
  };

  const openSwitchProjectModal = () => {
    setModalMode('switch');
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

    if (modalMode === 'new') {
      try {
        const modelToUse = selectedModel || models[0]?.modelEnum || 'MODEL_PLACEHOLDER_M319';
        const cascadeId = await client.startConversation(modelToUse, finalPath, finalProjId);
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
      } catch (err) {
        console.error('Failed to start session:', err);
        alert(`Failed to start session: ${err.message}`);
      }
    } else if (modalMode === 'switch') {
      if (activeSessionId) {
        try {
          const modelToUse = selectedModel || models[0]?.modelEnum || 'MODEL_PLACEHOLDER_M319';
          await client.setSessionWorkspace(activeSessionId, finalPath, finalProjId, modelToUse);
          setMessages(prev => [
            ...prev,
            { role: 'system', content: `Workspace switched to: ${finalPath} (${projName})` }
          ]);
        } catch (err) {
          console.error('Failed to update workspace:', err);
          alert(`Failed to switch workspace: ${err.message}`);
        }
      }
    }
  };

  const selectConversation = async (id) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setActiveSessionId(id);
    setIsGenerating(false);
    try {
      const steps = await client.getConversationHistory(id);
      setMessages(steps);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputPrompt.trim() || isGenerating) return;

    const modelToUse = selectedModel || models[0]?.modelEnum || 'MODEL_PLACEHOLDER_M319';

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      targetSessionId = await client.startConversation(modelToUse, workspaceDir, selectedProjectId);
      setActiveSessionId(targetSessionId);
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
    }

    const currentPrompt = inputPrompt;
    setInputPrompt('');

    // 1. Get current step count so streamUpdates ignores prior turns
    let startStepIndex = 0;
    try {
      startStepIndex = await client.getRawStepCount(targetSessionId);
    } catch { }

    // 2. Append user message & placeholder assistant turn
    const userMsg = { role: 'user', content: currentPrompt };
    const assistantMsg = { role: 'assistant', steps: [] };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsGenerating(true);

    try {
      // 3. Send User Cascade Message directly
      await client.sendMessage({
        cascadeId: targetSessionId,
        text: currentPrompt,
        modelEnum: modelToUse,
        thinkingBudget: parseInt(thinkingBudget, 10),
        autoExecute
      });

      // 4. Stream Agent Updates starting strictly after startStepIndex
      const controller = new AbortController();
      abortControllerRef.current = controller;

      await client.streamUpdates(targetSessionId, (update) => {
        if (update.type === 'done') {
          setIsGenerating(false);
          client.listConversations().then(setConversations);
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
            if (!stepObj) {
              stepObj = { stepIndex: update.stepIndex, type: 'planner', thinking: update.delta, content: '' };
              last.steps.push(stepObj);
            } else {
              const sIdx = last.steps.indexOf(stepObj);
              last.steps[sIdx] = { ...stepObj, thinking: (stepObj.thinking || '') + update.delta };
            }
          } else if (update.type === 'content') {
            if (!stepObj) {
              stepObj = { stepIndex: update.stepIndex, type: 'planner', thinking: '', content: update.delta };
              last.steps.push(stepObj);
            } else {
              const sIdx = last.steps.indexOf(stepObj);
              last.steps[sIdx] = { ...stepObj, content: (stepObj.content || '') + update.delta };
            }
          } else if (update.type === 'tool') {
            if (!stepObj) {
              stepObj = { stepIndex: update.stepIndex, ...update };
              last.steps.push(stepObj);
            } else {
              const sIdx = last.steps.indexOf(stepObj);
              last.steps[sIdx] = { ...stepObj, ...update };
            }
          } else if (update.type === 'tool_output') {
            if (stepObj) {
              const sIdx = last.steps.indexOf(stepObj);
              last.steps[sIdx] = { ...stepObj, output: update.output };
            }
          }
          return clone;
        });
      }, controller.signal, startStepIndex);

    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Chat execution error:', err);
      }
      setIsGenerating(false);
    }
  };

  const handleStop = async () => {
    if (activeSessionId) {
      await client.stop(activeSessionId);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
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

            {/* Project / Workspace Switcher Pill */}
            <div
              className="project-pill"
              onClick={openSwitchProjectModal}
              title="Click to switch workspace folder or project (even mid-conversation)"
            >
              <Folder size={14} color="#38bdf8" />
              <span className="project-pill-title">
                {projects.find(p => p.id === selectedProjectId)?.name || workspaceDir.split('/').filter(Boolean).pop() || 'Workspace'}
              </span>
              <span className="project-pill-path">
                {workspaceDir ? workspaceDir.split('/').slice(-2).join('/') : ''}
              </span>
              <ChevronDown size={12} color="#64748b" />
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

            {/* Auto Execute Policy Toggle */}
            <div className="control-group">
              <Terminal size={14} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoExecute}
                  onChange={(e) => setAutoExecute(e.target.checked)}
                />
                <span>Auto-Run Tools</span>
              </label>
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
                              {(step.output || step.diff) && (
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
                              </>
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
    </div>
  );
}
