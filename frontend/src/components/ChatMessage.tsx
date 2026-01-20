import React, { useRef } from 'react';
import EnhancedMarkdown from './EnhancedMarkdown';
import { Message } from '../types';
import { useTranslation } from 'react-i18next';

// 模型Logo映射组件
const ModelLogo: React.FC<{ model: string; size?: number }> = ({ model, size = 32 }) => {
  const getLogoPath = (modelName: string): string => {
    const modelMap: { [key: string]: string } = {
      'deepseek': 'deepseek',
      'kimi': 'kimi',
      'qwen': 'qwen',
      'glm': 'zai'  // GLM模型对应zai.svg
    };

    const normalizedModel = modelName.toLowerCase();
    const logoName = modelMap[normalizedModel] || 'deepseek'; // 默认使用deepseek logo

    return `/assets/logo/${logoName}.svg`;
  };

  return (
    <img
      src={getLogoPath(model)}
      alt={model}
      style={{
        width: size,
        height: size,
        objectFit: 'contain'
      }}
      className="message-avatar"
    />
  );
};

interface ChatMessageProps {
  message: Message;
  toggleThinkingExpansion: (messageId: string) => void;
  copyMessageToClipboard: (content: string) => void;
  onBranchClick?: (parentId: string, parentContent: string) => void;
  parentMessage?: Message | null;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  toggleThinkingExpansion,
  copyMessageToClipboard,
  onBranchClick,
  parentMessage
}) => {
  const { t } = useTranslation();
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

  // 处理分支问按钮点击
  const handleBranchClick = () => {
    if (onBranchClick && parentMessage) {
      const parentId = parentMessage._id || parentMessage.id;
      const parentContent = parentMessage.content.substring(0, 10);
      onBranchClick(parentId, parentContent);
    }
  };

  return (
    <div ref={messageRef} className={`message-wrapper ${message.role}`}>
      {message.role === 'assistant' && message.model && (
        <div className="message-avatar-wrapper">
          <ModelLogo model={message.model} size={32} />
        </div>
      )}
      <div className={`message ${message.role}`}>
        {message.role === 'user' && onBranchClick && parentMessage && (
          <button
            className="branch-button"
            onClick={handleBranchClick}
            title="创建分支问"
            aria-label="创建分支问"
          >
            <img src="/assets/branch.svg" alt="分支" className="branch-icon" />
          </button>
        )}
        <div className="message-content">
          {message.role === 'assistant' ? (
            <div className="assistant-content">
              {/* 思考内容区域 - 只有在启用了深度思考且有思考内容或等待首token时才显示 */}
              {message.deepThinkingEnabled && (message.thinkingContent || message.isWaitingForFirstToken) && (
                <div className="thinking-section">
                  <div className="thinking-header">
                    <button
                      className="thinking-toggle"
                      onClick={handleToggleThinking}
                      aria-label={message.isThinkingExpanded ? t('chat.collapseThinking') : t('chat.expandThinking')}
                    >
                      <span className="thinking-icon">
                        {message.isThinkingExpanded ? '▼' : '▶'}
                      </span>
                      <span className="thinking-label">{t('chat.thinkingProcess')}</span>
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

// 使用React.memo优化组件渲染，避免不必要的重渲染
export default React.memo(ChatMessage, (prevProps, nextProps) => {
  // 只有当message或相关props发生变化时，才重新渲染
  return (
    prevProps.message === nextProps.message &&
    prevProps.parentMessage === nextProps.parentMessage
  );
});