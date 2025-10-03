import React from 'react';
import Sidebar from './Sidebar';
import { useChat } from './hooks/useChat';
import { useDialogues } from './hooks/useDialogues';
import WelcomeScreen from './components/WelcomeScreen';
import ChatContainer from './components/ChatContainer';
import ChatHeader from './components/ChatHeader';
import ChatInput from './components/ChatInput';
import './App.css';

function App() {
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
    handleInterruptResponse
  } = useChat();

  const { dialogues, refreshDialogues, getCurrentDialogueTitle } = useDialogues();

  // 处理对话选择，包含刷新对话列表的逻辑
  const handleDialogueSelectWithRefresh = async (dialogueId: string) => {
    await handleDialogueSelect(dialogueId);
    refreshDialogues();
  };

  const currentTitle = getCurrentDialogueTitle(currentDialogueId);

  return (
    <div className="app">
      <Sidebar
        onDialogueSelect={handleDialogueSelectWithRefresh}
        onNewDialogue={handleNewDialogue}
      />
      <div className="main-content">
        {!shouldShowWelcome && (
          <ChatHeader title={currentTitle} />
        )}
        <ChatContainer
          messages={messages}
          isLoading={isLoading}
          toggleThinkingExpansion={toggleThinkingExpansion}
          copyMessageToClipboard={copyMessageToClipboard}
          shouldShowWelcome={shouldShowWelcome}
          welcomeScreen={
            <WelcomeScreen
              inputMessage={inputMessage}
              isLoading={isLoading}
              textareaRef={textareaRef}
              handleInputChange={handleInputChange}
              handleKeyPress={handleKeyPress}
              handleSendMessage={handleSendMessage}
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
          />
        )}
        <footer className="footer">
          <p>© {new Date().getFullYear()} UniformLLM Platform. All Rights Reserved.</p>
        </footer>
      </div>
    </div>
  );
}

export default App;