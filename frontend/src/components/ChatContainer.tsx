import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { Message } from '../types';
import ChatMessage from './ChatMessage';
import ConversationBranchTabs from './ConversationBranchTabs';
import { ChatScrollAnchor } from './ChatScrollAnchor';
import {
  buildConversationTree,
  findUserMessageGroups,
  findParentMessageGroups,
  getCompleteConversationPath,
  TreeNode,
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
  onBranchClick,
}) => {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState<boolean>(false);

  // 状态管理分支选择（children分支）
  const [selectedBranches, setSelectedBranches] = useState<Map<string, string>>(
    new Map(),
  );
  // 状态管理parent分支选择
  const [selectedParents, setSelectedParents] = useState<Map<string, string>>(
    new Map(),
  );

  // 构建对话树和用户消息分组、parent分组
  const { userMessageGroups, parentMessageGroups, displayMessages } =
    useMemo(() => {
      const tree = buildConversationTree(messages);
      const childrenGroups = findUserMessageGroups(tree);
      const parentGroups = findParentMessageGroups(tree);

      // 默认选择每个用户消息组的children分支
      const mergedSelectedBranches = new Map<string, string>(selectedBranches);
      childrenGroups.forEach((userMessages, parentId) => {
        if (!selectedBranches.has(parentId) && userMessages.length > 0) {
          mergedSelectedBranches.set(parentId, userMessages[0].id);
        } else if (selectedBranches.has(parentId)) {
          const selectedId = selectedBranches.get(parentId)!;
          const branchExists = userMessages.some(
            (msg) => msg.id === selectedId,
          );
          if (!branchExists && userMessages.length > 0) {
            mergedSelectedBranches.set(parentId, userMessages[0].id);
          }
        }
      });

      // 默认选择每个有多个parent的user message的第一个parent
      const mergedSelectedParents = new Map<string, string>(selectedParents);
      parentGroups.forEach((parents, userMessageId) => {
        if (!selectedParents.has(userMessageId) && parents.length > 0) {
          mergedSelectedParents.set(userMessageId, parents[0].id);
        } else if (selectedParents.has(userMessageId)) {
          const selectedId = selectedParents.get(userMessageId)!;
          const parentExists = parents.some((p) => p.id === selectedId);
          if (!parentExists && parents.length > 0) {
            mergedSelectedParents.set(userMessageId, parents[0].id);
          }
        }
      });

      // 获取完整的对话路径，考虑children和parent选择
      const displayMsgs = getCompleteConversationPath(
        tree,
        mergedSelectedBranches,
        mergedSelectedParents,
      );

      return {
        userMessageGroups: childrenGroups,
        parentMessageGroups: parentGroups,
        displayMessages: displayMsgs,
      };
    }, [messages, selectedBranches, selectedParents]);

  // 自动选择新分支的副作用
  useEffect(() => {
    const tree = buildConversationTree(messages);
    const childrenGroups = findUserMessageGroups(tree);
    const parentGroups = findParentMessageGroups(tree);

    let hasNewBranch = false;
    const updatedBranches = new Map<string, string>(selectedBranches);
    const updatedParents = new Map<string, string>(selectedParents);

    // 检查是否有新的children分支消息
    const recentMessages = messages.slice(-10);
    recentMessages.forEach((message) => {
      if (message.parent_ids && message.parent_ids.length > 0) {
        message.parent_ids.forEach((parentId) => {
          if (childrenGroups.has(parentId)) {
            const groupMessages = childrenGroups.get(parentId)!;
            const isBranchInGroup = groupMessages.some(
              (msg) => msg.id === message.id,
            );
            if (
              isBranchInGroup &&
              selectedBranches.get(parentId) !== message.id
            ) {
              updatedBranches.set(parentId, message.id);
              hasNewBranch = true;
            }
          }
        });
      }

      // 检查是否有新的parent分支（user消息有新的parent）
      if (
        message.role === 'user' &&
        message.parent_ids &&
        message.parent_ids.length > 1
      ) {
        if (parentGroups.has(message.id) && !selectedParents.has(message.id)) {
          const parents = parentGroups.get(message.id)!;
          if (parents.length > 0) {
            updatedParents.set(message.id, parents[0].id);
            hasNewBranch = true;
          }
        }
      }
    });

    if (hasNewBranch) {
      setSelectedBranches(updatedBranches);
      setSelectedParents(updatedParents);
    }
  }, [messages, selectedBranches, selectedParents]);

  // 用于追踪消息长度的 ref
  const previousMessagesLengthRef = useRef(0);

  // 滚动事件处理：检测用户是否在底部
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } =
      messagesContainerRef.current;
    const atBottom = scrollHeight - clientHeight <= scrollTop + 1;

    setIsAtBottom(atBottom);
  }, []);

  // 监听滚动事件
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  // 新消息开始时，强制滚动到底部
  useEffect(() => {
    if (shouldShowWelcome) {
      return;
    }

    const currentLength = messages.length;
    const previousLength = previousMessagesLengthRef.current;

    if (currentLength > previousLength) {
      setTimeout(() => {
        if (!messagesContainerRef.current) return;

        const container = messagesContainerRef.current;
        container.scrollTop = container.scrollHeight - container.clientHeight;
        setIsAtBottom(true);
      }, 0);
    }

    previousMessagesLengthRef.current = currentLength;
  }, [messages.length, shouldShowWelcome]);

  // 历史消息加载时，强制滚动到底部
  useEffect(() => {
    const currentLength = messages.length;
    const previousLength = previousMessagesLengthRef.current;

    const isHistoryLoad =
      (previousLength === 0 && currentLength > 1) ||
      currentLength > previousLength + 2;

    if (isHistoryLoad && !shouldShowWelcome) {
      setTimeout(() => {
        if (!messagesContainerRef.current) return;

        const container = messagesContainerRef.current;
        container.scrollTop = container.scrollHeight - container.clientHeight;
        setIsAtBottom(true);
      }, 100);
    }
  }, [messages, shouldShowWelcome]);

  // 处理children分支选择
  const handleBranchSelect = useCallback(
    (branchingPointId: string, selectedBranchId: string) => {
      setSelectedBranches((prev) => {
        const newMap = new Map(prev);
        newMap.set(branchingPointId, selectedBranchId);
        return newMap;
      });
    },
    [],
  );

  // 处理parent分支选择
  const handleParentSelect = useCallback(
    (userMessageId: string, selectedParentId: string) => {
      setSelectedParents((prev) => {
        const newMap = new Map(prev);
        newMap.set(userMessageId, selectedParentId);
        return newMap;
      });
    },
    [],
  );

  return (
    <main
      className={`chat-container ${shouldShowWelcome ? 'welcome-mode' : ''}`}
      ref={messagesContainerRef}
    >
      {shouldShowWelcome ? (
        welcomeScreen
      ) : (
        <div className="chat-messages">
          {displayMessages.map((message, index) => {
            // 获取父消息（对于用户消息，获取上一个AI消息）
            let parentMessage: TreeNode | null = null;
            if (message.role === 'user' && index > 0) {
              parentMessage = displayMessages[index - 1];
              if (parentMessage.role !== 'assistant') {
                parentMessage = null;
              }
            }

            const isParentOfMultiParentUser =
              message.role === 'assistant' &&
              Array.from(parentMessageGroups.values()).some((parents) =>
                parents.some((p) => p.id === message.id),
              );

            // 找到这个assistant对应的多parent user消息
            let parentUserId: string | null = null;
            if (isParentOfMultiParentUser) {
              parentMessageGroups.forEach((parents, userId) => {
                if (parents.some((p) => p.id === message.id)) {
                  parentUserId = userId;
                }
              });
            }

            let prevAssistantHasBranch = false;
            if (message.role === 'user' && index > 0) {
              const prevMsg = displayMessages[index - 1];
              if (
                prevMsg.role === 'assistant' &&
                userMessageGroups.has(prevMsg.id)
              ) {
                const branches = userMessageGroups.get(prevMsg.id)!;
                if (branches.length > 1) {
                  prevAssistantHasBranch = true;
                }
              }
            }

            if (
              message.role === 'assistant' &&
              isParentOfMultiParentUser &&
              parentUserId
            ) {
              return (
                <div key={`merge-${message.id}`} className="merge-unit">
                  <ChatMessage
                    message={message}
                    toggleThinkingExpansion={toggleThinkingExpansion}
                    copyMessageToClipboard={copyMessageToClipboard}
                    onBranchClick={onBranchClick}
                    parentMessage={null}
                  />
                  <ConversationBranchTabs
                    branches={parentMessageGroups.get(parentUserId)!}
                    selectedBranchId={
                      selectedParents.get(parentUserId) ||
                      parentMessageGroups.get(parentUserId)![0].id
                    }
                    onBranchSelect={(parentId) =>
                      handleParentSelect(parentUserId!, parentId)
                    }
                    iconType="merge"
                  />
                </div>
              );
            }

            if (message.role === 'user' && prevAssistantHasBranch) {
              const prevAssistant = displayMessages[index - 1] as TreeNode;
              return (
                <div key={`branch-${message.id}`} className="branch-unit">
                  <ConversationBranchTabs
                    branches={userMessageGroups.get(prevAssistant.id)!}
                    selectedBranchId={
                      selectedBranches.get(prevAssistant.id) ||
                      userMessageGroups.get(prevAssistant.id)![0].id
                    }
                    onBranchSelect={(branchId) =>
                      handleBranchSelect(prevAssistant.id, branchId)
                    }
                    iconType="branch"
                  />
                  <ChatMessage
                    message={message}
                    toggleThinkingExpansion={toggleThinkingExpansion}
                    copyMessageToClipboard={copyMessageToClipboard}
                    onBranchClick={onBranchClick}
                    parentMessage={parentMessage}
                  />
                </div>
              );
            }

            if (message.role === 'assistant' && !isParentOfMultiParentUser) {
              return (
                <div key={message.id}>
                  <ChatMessage
                    message={message}
                    toggleThinkingExpansion={toggleThinkingExpansion}
                    copyMessageToClipboard={copyMessageToClipboard}
                    onBranchClick={onBranchClick}
                    parentMessage={parentMessage}
                  />
                </div>
              );
            }

            if (message.role === 'user' && !prevAssistantHasBranch) {
              return (
                <div key={message.id}>
                  <ChatMessage
                    message={message}
                    toggleThinkingExpansion={toggleThinkingExpansion}
                    copyMessageToClipboard={copyMessageToClipboard}
                    onBranchClick={onBranchClick}
                    parentMessage={parentMessage}
                  />
                </div>
              );
            }

            return null;
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
