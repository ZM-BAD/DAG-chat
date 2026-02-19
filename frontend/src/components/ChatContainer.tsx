import {
  FC,
  useEffect,
  useLayoutEffect,
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
  buildConversationDag,
  findUserMessageGroups,
  findParentMessageGroups,
  getCompleteConversationPath,
  DagNode,
} from '../utils/conversationDag';

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  toggleThinkingExpansion: (messageId: string) => void;
  copyMessageToClipboard: (content: string) => void;
  shouldShowWelcome: boolean;
  welcomeScreen: React.ReactNode;
  onBranchClick?: (parentId: string, parentContent: string) => void;
}

const ChatContainer: FC<ChatContainerProps> = ({
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

  // 构建对话DAG和用户消息分组、parent分组
  const {
    userMessageGroups,
    parentMessageGroups,
    displayMessages,
  }: {
    userMessageGroups: Map<string, DagNode[]>;
    parentMessageGroups: Map<string, DagNode[]>;
    displayMessages: DagNode[];
  } = useMemo(() => {
    const dag = buildConversationDag(messages);
    if (!dag) {
      return {
        userMessageGroups: new Map<string, DagNode[]>(),
        parentMessageGroups: new Map<string, DagNode[]>(),
        displayMessages: [],
      };
    }

    const childrenGroups = findUserMessageGroups(dag);
    const parentGroups = findParentMessageGroups(dag);

    // 默认选择每个用户消息组的children分支
    const mergedSelectedBranches = new Map<string, string>(selectedBranches);
    childrenGroups.forEach((userNodes, parentId) => {
      if (!selectedBranches.has(parentId) && userNodes.length > 0) {
        const firstNode = userNodes[0];
        mergedSelectedBranches.set(parentId, firstNode.id);
      } else if (selectedBranches.has(parentId)) {
        const selectedId = selectedBranches.get(parentId);
        if (selectedId) {
          const branchExists = userNodes.some((node) => node.id === selectedId);
          if (!branchExists && userNodes.length > 0) {
            const firstNode = userNodes[0];
            mergedSelectedBranches.set(parentId, firstNode.id);
          }
        }
      }
    });

    // 默认选择每个有多个parent的user message的第一个parent
    const mergedSelectedParents = new Map<string, string>(selectedParents);
    parentGroups.forEach((parents, userMessageId) => {
      if (!selectedParents.has(userMessageId) && parents.length > 0) {
        const firstParent = parents[0];
        mergedSelectedParents.set(userMessageId, firstParent.id);
      } else if (selectedParents.has(userMessageId)) {
        const selectedId = selectedParents.get(userMessageId);
        if (selectedId) {
          const parentExists = parents.some((p) => p.id === selectedId);
          if (!parentExists && parents.length > 0) {
            const firstParent = parents[0];
            mergedSelectedParents.set(userMessageId, firstParent.id);
          }
        }
      }
    });

    // 获取完整的对话路径，考虑children和parent选择
    const displayMsgs = getCompleteConversationPath(
      dag,
      mergedSelectedBranches,
      mergedSelectedParents,
    );

    return {
      userMessageGroups: childrenGroups,
      parentMessageGroups: parentGroups,
      displayMessages: displayMsgs,
    };
  }, [messages, selectedBranches, selectedParents]);

  // 用于追踪消息长度的 ref，用于检测是否有新消息添加
  const previousMessagesLengthRef = useRef<number>(0);

  // 自动选择新分支的副作用
  // 只在消息数量变化时触发，避免循环更新
  // 使用 useLayoutEffect 避免级联渲染

  useLayoutEffect(() => {
    const currentLength = messages.length;
    const previousLength = previousMessagesLengthRef.current;

    // 只在消息数量增加时才自动选择分支
    if (currentLength <= previousLength) {
      previousMessagesLengthRef.current = currentLength;
      return;
    }

    const dag = buildConversationDag(messages);
    if (!dag) {
      previousMessagesLengthRef.current = currentLength;
      return;
    }

    const childrenGroups = findUserMessageGroups(dag);
    const parentGroups = findParentMessageGroups(dag);

    let hasNewBranch = false;
    const updatedBranches = new Map<string, string>(selectedBranches);
    const updatedParents = new Map<string, string>(selectedParents);

    // 只检查新增的消息（最后一条）
    if (currentLength === 0) {
      previousMessagesLengthRef.current = currentLength;
      return;
    }
    const newMessage = messages[currentLength - 1];

    // 检查新增的消息是否是新的 children 分支
    if (newMessage.parent_ids && newMessage.parent_ids.length > 0) {
      newMessage.parent_ids.forEach((parentId) => {
        const groupNodes = childrenGroups.get(parentId);
        if (groupNodes && groupNodes.length > 0) {
          const isBranchInGroup = groupNodes.some(
            (node) => node.id === newMessage.id,
          );
          if (isBranchInGroup && !selectedBranches.has(parentId)) {
            // 只在没有选中分支时才自动选择第一个
            const firstNode = groupNodes[0];
            updatedBranches.set(parentId, firstNode.id);
            hasNewBranch = true;
          }
        }
      });
    }

    // 检查新增的消息是否是需要 parent 分支的 user 消息
    if (
      newMessage.role === 'user' &&
      newMessage.parent_ids &&
      newMessage.parent_ids.length > 1
    ) {
      const parents = parentGroups.get(newMessage.id);
      if (
        parents &&
        parents.length > 0 &&
        parentGroups.has(newMessage.id) &&
        !selectedParents.has(newMessage.id)
      ) {
        const firstParent = parents[0];
        updatedParents.set(newMessage.id, firstParent.id);
        hasNewBranch = true;
      }
    }

    if (hasNewBranch) {
      setSelectedBranches(updatedBranches);
      setSelectedParents(updatedParents);
    }

    previousMessagesLengthRef.current = currentLength;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]); // 只依赖 messages.length，而不是整个 messages 数组

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
      const timerId = setTimeout(() => {
        if (!messagesContainerRef.current) return;

        const container = messagesContainerRef.current;
        container.scrollTop = container.scrollHeight - container.clientHeight;
        setIsAtBottom(true);
      }, 0);
      // Timer is self-cleaning, no cleanup needed
      void timerId;
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
      const timerId = setTimeout(() => {
        if (!messagesContainerRef.current) return;

        const container = messagesContainerRef.current;
        container.scrollTop = container.scrollHeight - container.clientHeight;
        setIsAtBottom(true);
      }, 100);
      // Timer is self-cleaning, no cleanup needed
      void timerId;
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

  // 处理parent分支选择（添加防抖处理）
  const handleParentSelect = useCallback(
    (userMessageId: string, selectedParentId: string) => {
      // 立即更新状态以获得快速响应
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
            let parentMessage: DagNode | null = null;
            if (message.role === 'user' && index > 0) {
              const prevMsg = displayMessages[index - 1];
              if (prevMsg.role === 'assistant') {
                parentMessage = prevMsg;
              }
            }

            const isParentOfMultiParentUser =
              message.role === 'assistant' &&
              Array.from(parentMessageGroups.values()).some(
                (parents: DagNode[]) =>
                  parents.some((p: DagNode) => p.id === message.id),
              );

            // 找到这个assistant对应的多parent user消息
            let parentUserId: string | null = null;
            if (isParentOfMultiParentUser) {
              for (const [userId, parents] of parentMessageGroups.entries()) {
                if (parents.some((p: DagNode) => p.id === message.id)) {
                  parentUserId = userId;
                  break;
                }
              }
            }

            let prevAssistantHasBranch = false;
            if (message.role === 'user' && index > 0) {
              const prevMsg = displayMessages[index - 1];
              if (
                prevMsg.role === 'assistant' &&
                userMessageGroups.has(prevMsg.id)
              ) {
                const branches = userMessageGroups.get(prevMsg.id);
                if (branches && branches.length > 1) {
                  prevAssistantHasBranch = true;
                }
              }
            }

            if (
              message.role === 'assistant' &&
              isParentOfMultiParentUser &&
              parentUserId
            ) {
              const branches = parentMessageGroups.get(parentUserId);
              if (!branches || branches.length === 0) {
                return null;
              }
              const selectedParentId =
                selectedParents.get(parentUserId) ?? branches[0].id;
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
                    branches={branches}
                    selectedBranchId={selectedParentId}
                    onBranchSelect={(parentId) => {
                      handleParentSelect(parentUserId, parentId);
                    }}
                    iconType="merge"
                  />
                </div>
              );
            }

            if (message.role === 'user' && prevAssistantHasBranch) {
              const prevAssistant = displayMessages[index - 1];
              if (prevAssistant.role !== 'assistant') {
                return null;
              }
              const branches = userMessageGroups.get(prevAssistant.id);
              if (!branches || branches.length === 0) {
                return null;
              }
              const selectedBranchId =
                selectedBranches.get(prevAssistant.id) ?? branches[0].id;
              return (
                <div key={`branch-${message.id}`} className="branch-unit">
                  <ConversationBranchTabs
                    branches={branches}
                    selectedBranchId={selectedBranchId}
                    onBranchSelect={(branchId) => {
                      handleBranchSelect(prevAssistant.id, branchId);
                    }}
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
