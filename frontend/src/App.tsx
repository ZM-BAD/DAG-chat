import React from 'react';
import Sidebar from './Sidebar';
import { useChat } from './hooks/useChat';
import { useDialogues } from './hooks/useDialogues';
import WelcomeScreen from './components/WelcomeScreen';
import ChatContainer from './components/ChatContainer';
import ChatHeader from './components/ChatHeader';
import ChatInput from './components/ChatInput';
import LanguageSwitcher from './components/LanguageSwitcher';
import { ToastProvider } from './contexts/ToastContext';
import './App.css';

// 内部组件，在 ToastProvider 内部调用 hooks
function AppContent() {
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
    branchParentId,
    branchParentContent,
    handleBranchClick,
    clearBranchState
  } = useChat();

  const { dialogues, refreshDialogues, getCurrentDialogueTitle } = useDialogues();

  // 处理对话选择，包含刷新对话列表的逻辑
  const handleDialogueSelectWithRefresh = async (dialogueId: string) => {
    await handleDialogueSelect(dialogueId);
    refreshDialogues();
  };

  // 处理删除对话后的刷新
  const handleDialogueDeleted = () => {
    refreshDialogues();
    // 如果当前选中的对话被删除，切换到新对话状态
    handleNewDialogue();
  };

  // 处理重命名对话后的刷新
  const handleDialogueRenamed = () => {
    refreshDialogues();
  };

  const currentTitle = getCurrentDialogueTitle(currentDialogueId);

  return (
    <div className="app">
      <Sidebar
        onDialogueSelect={handleDialogueSelectWithRefresh}
        onNewDialogue={handleNewDialogue}
        dialogues={dialogues}
        selectedDialogueId={currentDialogueId}
        onDialogueDeleted={handleDialogueDeleted}
        onDialogueRenamed={handleDialogueRenamed}
      />
      <div className="main-content">
        <LanguageSwitcher className="language-switcher-top" />
        {!shouldShowWelcome && (
          <ChatHeader title={currentTitle} />
        )}
        <ChatContainer
          messages={messages}
          isLoading={isLoading}
          toggleThinkingExpansion={toggleThinkingExpansion}
          copyMessageToClipboard={copyMessageToClipboard}
          shouldShowWelcome={shouldShowWelcome}
          onBranchClick={handleBranchClick}
          welcomeScreen={
            <WelcomeScreen
              inputMessage={inputMessage}
              isLoading={isLoading}
              textareaRef={textareaRef}
              handleInputChange={handleInputChange}
              handleKeyPress={handleKeyPress}
              handleSendMessage={handleSendMessage}
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
          <ChatInput
            inputMessage={inputMessage}
            isLoading={isLoading}
            textareaRef={textareaRef}
            handleInputChange={handleInputChange}
            handleKeyPress={handleKeyPress}
            handleSendMessage={handleSendMessage}
            handleInterruptResponse={handleInterruptResponse}
            onDeepThinkingChange={handleDeepThinkingChange}
            onSearchChange={handleSearchChange}
            onModelChange={handleModelChange}
            initialDeepThinking={deepThinkingEnabled}
            initialSearch={searchEnabled}
            initialModel={selectedModel}
            availableModels={availableModels}
            branchParentId={branchParentId}
            branchParentContent={branchParentContent}
            onClearBranch={clearBranchState}
          />
        )}
        <footer className="footer">
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