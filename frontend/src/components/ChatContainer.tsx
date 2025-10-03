import React, { useEffect, useRef, useState } from 'react';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // 滚动到底部
  const scrollToBottom = () => {
    if (messagesEndRef.current && shouldAutoScroll) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // 监听滚动事件，判断用户是否手动滚动
  useEffect(() => {
    const handleScroll = () => {
      if (!messagesContainerRef.current) return;
      
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      // 当用户滚动到距离底部100px以内时，启用自动滚动
      if (scrollHeight - scrollTop - clientHeight < 100) {
        setShouldAutoScroll(true);
      } else {
        setShouldAutoScroll(false);
      }
    };

    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      // 初始检查一下滚动位置
      handleScroll();
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  // 当消息更新时，滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  return (
    <main className={`chat-container ${shouldShowWelcome ? 'welcome-mode' : ''}`}>
      {shouldShowWelcome ? (
        welcomeScreen
      ) : (
        <div className="chat-messages" ref={messagesContainerRef}>
          {messages.map(message => (
            <ChatMessage
              key={message.id}
              message={message}
              toggleThinkingExpansion={toggleThinkingExpansion}
              copyMessageToClipboard={copyMessageToClipboard}
            />
          ))}
          {/* 添加一个占位元素用于滚动到最底部 */}
          <div ref={messagesEndRef} />
        </div>
      )}
    </main>
  );
};

export default ChatContainer;