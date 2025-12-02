import React, { useRef, useEffect } from 'react';
import EnhancedMarkdown from './EnhancedMarkdown';
import { Message } from '../types';

interface ChatMessageProps {
  message: Message;
  toggleThinkingExpansion: (messageId: string) => void;
  copyMessageToClipboard: (content: string) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  toggleThinkingExpansion,
  copyMessageToClipboard
}) => {
  const messageRef = useRef<HTMLDivElement>(null);
  const isTogglingRef = useRef(false);

  // 处理思考内容的展开/收起，保持滚动位置
  const handleToggleThinking = () => {
    if (isTogglingRef.current) return; // 防止重复点击

    // 保存当前滚动位置
    const scrollContainer = document.querySelector('.chat-container');
    let scrollPosition = 0;

    if (scrollContainer) {
      scrollPosition = scrollContainer.scrollTop;
    }

    isTogglingRef.current = true;

    // 执行展开/收起操作
    toggleThinkingExpansion(message.id);

    // 在下一个动画帧中恢复滚动位置
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollPosition;
        }
        isTogglingRef.current = false;
      });
    });
  };

  return (
    <div ref={messageRef} className={`message-wrapper ${message.role}`}>
      <div className={`message ${message.role}`}>
        <div className="message-content">
          {message.role === 'assistant' ? (
            <div className="assistant-content">
              {/* 思考内容区域 */}
              {(message.thinkingContent || message.isWaitingForFirstToken) && (
                <div className="thinking-section">
                  <div className="thinking-header">
                    <button
                      className="thinking-toggle"
                      onClick={handleToggleThinking}
                      aria-label={message.isThinkingExpanded ? "折叠思考内容" : "展开思考内容"}
                    >
                      <span className="thinking-icon">
                        {message.isThinkingExpanded ? '▼' : '▶'}
                      </span>
                      <span className="thinking-label">思考过程</span>
                    </button>
                  </div>
                  <div className={`thinking-content ${!message.isThinkingExpanded && !message.isWaitingForFirstToken ? 'collapsed' : ''}`}>
                      <div className="thinking-border"></div>
                      <div className="thinking-text">
                        {message.isWaitingForFirstToken && !message.thinkingContent ? (
                          <div className="waiting-animation">
                            <span className="waiting-dot"></span>
                            <span className="waiting-dot"></span>
                            <span className="waiting-dot"></span>
                          </div>
                        ) : (
                          <EnhancedMarkdown content={message.thinkingContent || ''} />
                        )}
                      </div>
                    </div>
                </div>
              )}

              {/* 正式回答内容区域 */}
              <div className="answer-content">
                <EnhancedMarkdown content={message.content} />
              </div>
            </div>
          ) : (
            message.content
          )}
        </div>
      </div>
      <div className="message-actions">
        <button
          className="copy-button"
          onClick={() => copyMessageToClipboard(message.content)}
          title="复制消息"
          aria-label="复制消息"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ChatMessage;