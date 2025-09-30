import React from 'react';
import { Message } from '../types';
import ChatMessage from './ChatMessage';

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  toggleThinkingExpansion: (messageId: string) => void;
  copyMessageToClipboard: (content: string) => void;
  shouldShowWelcome: boolean;
  welcomeScreen: React.ReactNode;
}

const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  isLoading,
  toggleThinkingExpansion,
  copyMessageToClipboard,
  shouldShowWelcome,
  welcomeScreen
}) => {
  return (
    <main className={`chat-container ${shouldShowWelcome ? 'welcome-mode' : ''}`}>
      {shouldShowWelcome ? (
        welcomeScreen
      ) : (
        <div className="chat-messages">
          {messages.map(message => (
            <ChatMessage
              key={message.id}
              message={message}
              toggleThinkingExpansion={toggleThinkingExpansion}
              copyMessageToClipboard={copyMessageToClipboard}
            />
          ))}
          {isLoading && (
            <div className="message assistant">
              <div className="message-content">
                <span className="typing-indicator">正在输入...</span>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
};

export default ChatContainer;