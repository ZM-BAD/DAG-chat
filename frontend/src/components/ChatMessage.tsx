import { useRef, FC, memo } from 'react';
import EnhancedMarkdown from './EnhancedMarkdown';
import ModelLogo from './common/ModelLogo';
import { Message } from '../types';
import { DagNode } from '../utils/conversationDag';
import { useTranslation } from 'react-i18next';

interface ChatMessageProps {
  message: Message | DagNode;
  toggleThinkingExpansion: (messageId: string) => void;
  copyMessageToClipboard: (content: string) => void;
  onBranchClick?: (parentId: string, parentContent: string) => void;
  onMergeClick?: (parentId: string, parentContent: string) => void;
  parentMessage?: Message | DagNode | null;
}

const ChatMessage: FC<ChatMessageProps> = ({
  message,
  toggleThinkingExpansion,
  copyMessageToClipboard,
  onBranchClick,
  onMergeClick,
  parentMessage,
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
      const parentId = parentMessage.id;
      const parentContent = parentMessage.content.substring(0, 10);
      onBranchClick(parentId, parentContent);
    }
  };

  // 处理合并问按钮点击
  const handleMergeClick = () => {
    if (onMergeClick) {
      const messageId = message.id;
      const messageContent = message.content.substring(0, 10);
      onMergeClick(messageId, messageContent);
    }
  };

  return (
    <div ref={messageRef} className={`message-wrapper ${message.role}`}>
      {/* user 消息的 branch 按钮 - 放在 wrapper 层，message 之前 */}
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
      {/* assistant 消息的 avatar */}
      {message.role === 'assistant' && message.model && (
        <div className="message-avatar-wrapper">
          <ModelLogo model={message.model} size={32} />
        </div>
      )}
      {/* 消息内容 */}
      <div className={`message ${message.role}`}>
        <div className="message-content">
          {message.role === 'assistant' ? (
            <div className="assistant-content">
              {/* 思考内容区域 - 只有在启用了深度思考且有思考内容或等待首token时才显示 */}
              {message.deepThinkingEnabled &&
                (message.thinkingContent || message.isWaitingForFirstToken) && (
                  <div className="thinking-section">
                    <div className="thinking-header">
                      <button
                        className="thinking-toggle"
                        onClick={handleToggleThinking}
                        aria-label={
                          message.isThinkingExpanded
                            ? t('chat.collapseThinking')
                            : t('chat.expandThinking')
                        }
                      >
                        <span className="thinking-icon">
                          {message.isThinkingExpanded ? '▼' : '▶'}
                        </span>
                        <span className="thinking-label">
                          {t('chat.thinkingProcess')}
                        </span>
                      </button>
                    </div>
                    <div
                      className={`thinking-content ${!message.isThinkingExpanded && !message.isWaitingForFirstToken ? 'collapsed' : ''}`}
                    >
                      <div className="thinking-border"></div>
                      <div className="thinking-text">
                        {message.isWaitingForFirstToken &&
                        !message.thinkingContent ? (
                          <div className="waiting-animation">
                            <span className="waiting-dot"></span>
                            <span className="waiting-dot"></span>
                            <span className="waiting-dot"></span>
                          </div>
                        ) : (
                          <EnhancedMarkdown
                            content={message.thinkingContent || ''}
                          />
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
      {/* assistant 消息的 merge 按钮 - 放在 wrapper 层，message 之后 */}
      {message.role === 'assistant' && onMergeClick && (
        <button
          className="merge-button"
          onClick={handleMergeClick}
          title="创建合并问"
          aria-label="创建合并问"
        >
          <img src="/assets/merge.svg" alt="合并" className="merge-icon" />
        </button>
      )}
      <div className="message-actions">
        <button
          className="copy-button"
          onClick={() => {
            copyMessageToClipboard(message.content);
          }}
          title="复制消息"
          aria-label="复制消息"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
    </div>
  );
};

// 使用React.memo优化组件渲染，避免不必要的重渲染
export default memo(ChatMessage, (prevProps, nextProps) => {
  // 比较 message 的关键内容属性，而不是引用
  // 这样在流式响应时，即使节点引用相同，内容变化也会触发重新渲染
  const prevMsg = prevProps.message;
  const nextMsg = nextProps.message;

  // 如果引用相同，不需要重新渲染
  if (
    prevMsg === nextMsg &&
    prevProps.parentMessage === nextProps.parentMessage
  ) {
    return true;
  }

  // 比较关键内容属性
  const contentChanged = prevMsg.content !== nextMsg.content;
  const thinkingChanged = prevMsg.thinkingContent !== nextMsg.thinkingContent;
  const waitingChanged =
    prevMsg.isWaitingForFirstToken !== nextMsg.isWaitingForFirstToken;
  const expandedChanged =
    prevMsg.isThinkingExpanded !== nextMsg.isThinkingExpanded;
  const parentChanged = prevProps.parentMessage !== nextProps.parentMessage;

  // 如果任何关键属性变化，需要重新渲染
  if (
    contentChanged ||
    thinkingChanged ||
    waitingChanged ||
    expandedChanged ||
    parentChanged
  ) {
    return false; // 需要重新渲染
  }

  return true; // 不需要重新渲染
});
