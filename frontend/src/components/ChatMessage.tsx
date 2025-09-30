import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
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
  return (
    <div className={`message-wrapper ${message.role}`}>
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
                      onClick={() => toggleThinkingExpansion(message.id)}
                      aria-label={message.isThinkingExpanded ? "折叠思考内容" : "展开思考内容"}
                    >
                      <span className="thinking-icon">
                        {message.isThinkingExpanded ? '▼' : '▶'}
                      </span>
                      <span className="thinking-label">思考过程</span>
                    </button>
                  </div>
                  {(message.isThinkingExpanded || message.isWaitingForFirstToken) && (
                    <div className="thinking-content">
                      <div className="thinking-border"></div>
                      <div className="thinking-text">
                        {message.isWaitingForFirstToken && !message.thinkingContent ? (
                          <div className="waiting-animation">
                            <span className="waiting-dot"></span>
                            <span className="waiting-dot"></span>
                            <span className="waiting-dot"></span>
                          </div>
                        ) : (
                          <ReactMarkdown
                            rehypePlugins={[rehypeRaw]}
                            remarkPlugins={[remarkGfm]}
                          >
                            {message.thinkingContent || '正在思考...'}
                          </ReactMarkdown>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 正式回答内容区域 */}
              <div className="answer-content">
                <ReactMarkdown
                  rehypePlugins={[rehypeRaw]}
                  remarkPlugins={[remarkGfm]}
                >
                  {message.content}
                </ReactMarkdown>
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