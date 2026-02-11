import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Message } from '../types';
import ChatMessage from './ChatMessage';
import ConversationBranchTabs from './ConversationBranchTabs';
import { ChatScrollAnchor } from './ChatScrollAnchor';
import {
  buildConversationTree,
  findUserMessageGroups,
  getCompleteConversationPath,
  TreeNode
} from '../utils/conversationTree';

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  toggleThinkingExpansion: (messageId: string) => void;
  copyMessageToClipboard: (content: string) => void;
  shouldShowWelcome: boolean;
  welcomeScreen: React.ReactNode;
  onBranchClick?: (parentId: string, parentContent: string) => void;
}

const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  isLoading,
  toggleThinkingExpansion,
  copyMessageToClipboard,
  shouldShowWelcome,
  welcomeScreen,
  onBranchClick
}) => {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState<boolean>(false);

  // 状态管理分支选择
  const [selectedBranches, setSelectedBranches] = useState<Map<string, string>>(new Map());

  // 构建对话树和用户消息分组
  const { userMessageGroups, displayMessages } = useMemo(() => {
    const tree = buildConversationTree(messages);
    const groups = findUserMessageGroups(tree);

    // 默认选择每个用户消息组的分支
    const mergedSelectedBranches = new Map<string, string>(selectedBranches);
    groups.forEach((userMessages, parentId) => {
      if (!selectedBranches.has(parentId) && userMessages.length > 0) {
        // 如果没有选择过这个分支点的分支，选择第一个分支
        mergedSelectedBranches.set(parentId, userMessages[0].id);
      } else if (selectedBranches.has(parentId)) {
        // 如果已经选择过这个分支点的分支，检查该分支是否仍然存在
        const selectedId = selectedBranches.get(parentId)!;
        const branchExists = userMessages.some(msg => msg.id === selectedId);
        if (branchExists) {
          // 如果分支仍然存在，保持选择
          mergedSelectedBranches.set(parentId, selectedId);
        } else {
          // 如果分支不存在了，选择第一个分支
          mergedSelectedBranches.set(parentId, userMessages[0].id);
        }
      }
    });

    // 使用函数获取完整的对话路径
    const displayMsgs = getCompleteConversationPath(tree, mergedSelectedBranches);

    return {
      userMessageGroups: groups,
      displayMessages: displayMsgs
    };
  }, [messages, selectedBranches]);

  // 自动选择新分支的副作用
  useEffect(() => {
    const tree = buildConversationTree(messages);
    const groups = findUserMessageGroups(tree);

    let hasNewBranch = false;
    const updatedBranches = new Map<string, string>(selectedBranches);

    // 检查是否有新的分支消息（最后几条消息中）
    const recentMessages = messages.slice(-10);
    recentMessages.forEach(message => {
      if (message.parent_ids && message.parent_ids.length > 0) {
        message.parent_ids.forEach(parentId => {
          // 检查父节点是否是一个分支点
          if (groups.has(parentId)) {
            const groupMessages = groups.get(parentId)!;
            // 检查当前消息是否是这个分支点的一个分支
            const isBranchInGroup = groupMessages.some(msg => msg.id === message.id);
            if (isBranchInGroup && selectedBranches.get(parentId) !== message.id) {
              // 如果是，自动选择这个新分支
              updatedBranches.set(parentId, message.id);
              hasNewBranch = true;
            }
          }
        });
      }
    });

    // 如果有新分支，更新状态
    if (hasNewBranch) {
      setSelectedBranches(updatedBranches);
    }
  }, [messages]);

  // 用于追踪消息长度的 ref
  const previousMessagesLengthRef = useRef(0);

  // 滚动事件处理：检测用户是否在底部
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    // 使用 1px 的容差，判断用户是否在底部
    const atBottom = scrollHeight - clientHeight <= scrollTop + 1;

    setIsAtBottom(atBottom);
  }, []);

  // 监听滚动事件
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });

    // 初始化时检查一次滚动位置
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  // 新消息开始时，强制滚动到底部
  useEffect(() => {
    // 欢迎模式下不处理滚动
    if (shouldShowWelcome) {
      return;
    }

    const currentLength = messages.length;
    const previousLength = previousMessagesLengthRef.current;

    // 只在有新消息加入时滚动（而不是流式更新时）
    if (currentLength > previousLength) {
      // 使用 setTimeout 确保 DOM 更新后再滚动
      setTimeout(() => {
        if (!messagesContainerRef.current) return;

        const container = messagesContainerRef.current;
        container.scrollTop = container.scrollHeight - container.clientHeight;
        setIsAtBottom(true);
      }, 0);
    }

    previousMessagesLengthRef.current = currentLength;
  }, [messages.length, shouldShowWelcome]);

  // 历史消息加载时，强制滚动到底部（一次性加载多条消息）
  useEffect(() => {
    const currentLength = messages.length;
    const previousLength = previousMessagesLengthRef.current;

    // 判断是否是历史对话加载（从无消息到有多条消息，或者消息数量突然增加很多）
    const isHistoryLoad = (
      (previousLength === 0 && currentLength > 1) ||
      (currentLength > previousLength + 2)
    );

    if (isHistoryLoad && !shouldShowWelcome) {
      setTimeout(() => {
        if (!messagesContainerRef.current) return;

        const container = messagesContainerRef.current;
        container.scrollTop = container.scrollHeight - container.clientHeight;
        setIsAtBottom(true);
      }, 100);
    }
  }, [messages, shouldShowWelcome]);

  // 处理分支选择
  const handleBranchSelect = useCallback((branchingPointId: string, selectedBranchId: string) => {
    console.log('handleBranchSelect called:', { branchingPointId, selectedBranchId });
    setSelectedBranches(prev => {
      const newMap = new Map(prev);
      newMap.set(branchingPointId, selectedBranchId);
      console.log('Selected branches updated:', Array.from(newMap.entries()));
      return newMap;
    });
  }, []);

  return (
    <main className={`chat-container ${shouldShowWelcome ? 'welcome-mode' : ''}`} ref={messagesContainerRef}>
      {shouldShowWelcome ? (
        welcomeScreen
      ) : (
        <div className="chat-messages">
          {displayMessages.map((message, index) => {
            // 检查当前消息是否属于某个用户消息组
            const messageParentIds = message.parent_ids || [];
            let messageGroup: TreeNode[] | null = null;
            let messageGroupId: string | null = null;

            for (const parentId of messageParentIds) {
              if (userMessageGroups.has(parentId)) {
                messageGroup = userMessageGroups.get(parentId)!;
                messageGroupId = parentId;
                break;
              }
            }

            // 获取父消息（对于用户消息，获取上一个AI消息）
            let parentMessage: TreeNode | null = null;
            if (message.role === 'user' && index > 0) {
              parentMessage = displayMessages[index - 1];
              if (parentMessage.role !== 'assistant') {
                parentMessage = null;
              }
            }

            return (
              <div key={message.id}>
                <ChatMessage
                  message={message}
                  toggleThinkingExpansion={toggleThinkingExpansion}
                  copyMessageToClipboard={copyMessageToClipboard}
                  onBranchClick={onBranchClick}
                  parentMessage={parentMessage}
                />
                {/* 如果是用户消息且属于有多个用户消息的组，显示标签页 */}
                {message.role === 'user' && messageGroup && messageGroup.length > 1 && (
                  <ConversationBranchTabs
                    branches={messageGroup}
                    selectedBranchId={selectedBranches.get(messageGroupId!) || messageGroup[0].id}
                    onBranchSelect={(branchId) => handleBranchSelect(messageGroupId!, branchId)}
                  />
                )}
              </div>
            );
          })}
          {/* 滚动锚点 - 使用 Intersection Observer 智能检测是否需要自动滚动 */}
          <ChatScrollAnchor
            trackVisibility={isLoading}
            isAtBottom={isAtBottom}
            scrollAreaRef={messagesContainerRef}
          />
        </div>
      )}
    </main>
  );
};

export default ChatContainer;