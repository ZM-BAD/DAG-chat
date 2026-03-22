import { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import { useChat } from './hooks/useChat';
import { useDialogues } from './hooks/useDialogues';
import WelcomeScreen from './components/WelcomeScreen';
import ChatContainer from './components/ChatContainer';
import ChatHeader from './components/ChatHeader';
import ChatInput from './components/ChatInput';
import LanguageSwitcher from './components/LanguageSwitcher';
import { ToastProvider } from './contexts/ToastContext';
import {
  Dag,
  TabsContainer,
  MessageToTabsMap,
  ConversationPath,
} from './utils/dagUtils';
import './styles/App.css';

// 定义对话状态类型
interface DialogueState {
  dag: Dag | null;
  tabsContainers: TabsContainer[];
  tabsMap: MessageToTabsMap;
  path: ConversationPath;
}

// 内部组件，在 ToastProvider 内部调用 hooks
function AppContent() {
  // ========================================
  // 对话状态管理
  // ========================================
  // 为每个对话保存独立的 DAG/Tabs/Path 状态
  const [dialogueStates, setDialogueStates] = useState<
    Map<string | null, DialogueState>
  >(new Map());

  // 处理对话状态变化（使用 useCallback 稳定引用）
  const handleStateChange = useCallback(
    (dialogueId: string | null, state: DialogueState) => {
      setDialogueStates((prev) => {
        const existing = prev.get(dialogueId);

        // ✅ 深度比较 path 内容（通过节点 ID 序列）
        if (existing) {
          const existingPathIds = existing.path.map((n) => n.id).join(',');
          const newPathIds = state.path.map((n) => n.id).join(',');
          if (existingPathIds === newPathIds) {
            // Path 内容相同，不更新
            return prev;
          }
        }

        const next = new Map(prev);
        next.set(dialogueId, state);
        return next;
      });
    },
    [],
  );

  // 获取当前对话的保存状态
  const getSavedState = (dialogueId: string | null): DialogueState | null => {
    return dialogueStates.get(dialogueId) || null;
  };

  const {
    messages,
    inputMessage,
    isLoading,
    currentDialogueId,
    textareaRef,
    shouldShowWelcome,
    handleSendMessage,
    handleKeyPress,
    handleInputChange,
    handleDialogueSelect,
    handleNewDialogue,
    toggleThinkingExpansion,
    copyMessageToClipboard,
    handleInterruptResponse,
    deepThinkingEnabled,
    searchEnabled,
    selectedModel,
    availableModels,
    handleDeepThinkingChange,
    handleSearchChange,
    handleModelChange,
    citations,
    handleBranchClick,
    handleMergeClick,
    removeCitation,
    clearAllCitations,
  } = useChat();

  const { dialogues, refreshDialogues, getCurrentDialogueTitle } =
    useDialogues();

  // 侧边栏展开/收起状态
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 处理对话选择，包含刷新对话列表的逻辑
  const handleDialogueSelectWithRefresh = async (dialogueId: string) => {
    handleDialogueSelect(dialogueId);
    await refreshDialogues();
  };

  // 处理删除对话后的刷新
  const handleDialogueDeleted = () => {
    void refreshDialogues();
    // 如果当前选中的对话被删除，切换到新对话状态
    handleNewDialogue();
  };

  // 处理重命名对话后的刷新
  const handleDialogueRenamed = () => {
    void refreshDialogues();
  };

  const currentTitle = getCurrentDialogueTitle(currentDialogueId);

  return (
    <div className="app">
      <Sidebar
        onDialogueSelect={(id) => void handleDialogueSelectWithRefresh(id)}
        onNewDialogue={handleNewDialogue}
        dialogues={dialogues}
        selectedDialogueId={currentDialogueId}
        onDialogueDeleted={handleDialogueDeleted}
        onDialogueRenamed={handleDialogueRenamed}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => {
          setSidebarCollapsed(!sidebarCollapsed);
        }}
      />
      <div
        className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
      >
        <LanguageSwitcher className="language-switcher-top" />
        {!shouldShowWelcome && (
          <div
            className={`chat-header-wrapper ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
          >
            <ChatHeader title={currentTitle} />
          </div>
        )}
        <ChatContainer
          messages={messages}
          currentDialogueId={currentDialogueId}
          isLoading={isLoading}
          toggleThinkingExpansion={toggleThinkingExpansion}
          copyMessageToClipboard={(text) => void copyMessageToClipboard(text)}
          shouldShowWelcome={shouldShowWelcome}
          onBranchClick={handleBranchClick}
          onMergeClick={handleMergeClick}
          onStateChange={handleStateChange}
          savedState={getSavedState(currentDialogueId)}
          welcomeScreen={
            <WelcomeScreen
              inputMessage={inputMessage}
              isLoading={isLoading}
              textareaRef={textareaRef}
              handleInputChange={handleInputChange}
              handleKeyPress={handleKeyPress}
              handleSendMessage={() => void handleSendMessage()}
              onDeepThinkingChange={handleDeepThinkingChange}
              onSearchChange={handleSearchChange}
              onModelChange={handleModelChange}
              initialDeepThinking={deepThinkingEnabled}
              initialSearch={searchEnabled}
              initialModel={selectedModel}
              availableModels={availableModels}
            />
          }
        />
        {!shouldShowWelcome && (
          <div
            className={`chat-input-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
          >
            <ChatInput
              inputMessage={inputMessage}
              isLoading={isLoading}
              textareaRef={textareaRef}
              handleInputChange={handleInputChange}
              handleKeyPress={handleKeyPress}
              handleSendMessage={() => void handleSendMessage()}
              handleInterruptResponse={handleInterruptResponse}
              onDeepThinkingChange={handleDeepThinkingChange}
              onSearchChange={handleSearchChange}
              onModelChange={handleModelChange}
              initialDeepThinking={deepThinkingEnabled}
              initialSearch={searchEnabled}
              initialModel={selectedModel}
              availableModels={availableModels}
              citations={citations}
              onRemoveCitation={removeCitation}
              onClearAllCitations={clearAllCitations}
            />
          </div>
        )}
        <footer
          className={`footer-wrapper ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
        >
          <p>© {new Date().getFullYear()} DAG-chat. All Rights Reserved.</p>
        </footer>
      </div>
    </div>
  );
}

// 主 App 组件，提供 ToastProvider
function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
