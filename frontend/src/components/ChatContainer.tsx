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
  const previousMessagesLength = useRef(0);

  // 滚动到底部
  const scrollToBottom = (instant = false) => {
    if (messagesEndRef.current && shouldAutoScroll) {
      messagesEndRef.current.scrollIntoView({
        behavior: instant ? 'auto' : 'smooth'
      });
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
    const currentLength = messages.length;
    const previousLength = previousMessagesLength.current;

    if (currentLength === 0) {
      // 没有消息时不滚动
      previousMessagesLength.current = 0;
      return;
    }

    // 判断是否是历史对话加载（从无消息到有多条消息，或者消息数量大幅增加）
    const isHistoryLoad = (
      (previousLength === 0 && currentLength > 1) || // 从无消息到多条消息
      (currentLength > previousLength + 2) // 消息数量突然增加很多
    );

    // 历史对话加载时直接跳转，新消息时平滑滚动
    if (isHistoryLoad || isLoading) {
      // 延迟一帧确保DOM更新完成
      requestAnimationFrame(() => {
        scrollToBottom(true);
      });
    } else if (currentLength > previousLength) {
      // 新增消息时平滑滚动
      scrollToBottom(false);
    }

    previousMessagesLength.current = currentLength;
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