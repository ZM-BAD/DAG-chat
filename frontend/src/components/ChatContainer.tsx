import React, { useEffect, useRef, useState, useCallback, useMemo, useTransition } from 'react';
import { Message } from '../types';
import ChatMessage from './ChatMessage';
import ConversationBranchTabs from './ConversationBranchTabs';
import { ChatScrollAnchor } from './ChatScrollAnchor';
import { BranchQuestionInfo } from '../hooks/chat/useChatMessages';

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  toggleThinkingExpansion: (messageId: string) => void;
  copyMessageToClipboard: (content: string) => void;
  shouldShowWelcome: boolean;
  welcomeScreen: React.ReactNode;
  onBranchClick?: (parentId: string, parentContent: string) => void;
  branchQuestionInfo: BranchQuestionInfo;
}

// 用户消息分组信息
interface UserMessageGroup {
  parentId: string;
  messages: Message[];
}

const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  isLoading,
  toggleThinkingExpansion,
  copyMessageToClipboard,
  shouldShowWelcome,
  welcomeScreen,
  onBranchClick,
  branchQuestionInfo
}) => {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState<boolean>(false);

  // 状态管理分支选择：key 是 parentId，value 是选中的 user message id
  const [selectedBranches, setSelectedBranches] = useState<Map<string, string>>(new Map());
  
  // 使用 useTransition 来优化分支切换的渲染性能
  const [, startTransition] = useTransition();

  // 计算用户消息分组（用于显示 tabs-container）
  const userMessageGroups = useMemo((): UserMessageGroup[] => {
    const groups = new Map<string, Message[]>();
    
    // 遍历所有消息，按 parent_id 分组
    messages.forEach(msg => {
      if (msg.role === 'user' && msg.parent_ids && msg.parent_ids.length > 0) {
        const parentId = msg.parent_ids[0]; // 分支提问只有一个 parent
        if (!groups.has(parentId)) {
          groups.set(parentId, []);
        }
        groups.get(parentId)!.push(msg);
      }
    });
    
    // 转换为数组，只保留有 >=2 条消息的组
    const result: UserMessageGroup[] = [];
    groups.forEach((msgs, parentId) => {
      if (msgs.length >= 2) {
        result.push({ parentId, messages: msgs });
      }
    });
    
    return result;
  }, [messages]);

  // 检查是否是首次分支提问（pending 状态且该 parent 下在分支前只有 1 条消息）
  // 注意：这个检查必须在 userMessageGroups 形成之前（即 <2 条消息时）
  const isFirstBranchPending = useMemo(() => {
    if (!branchQuestionInfo.isPending || !branchQuestionInfo.parentId) return false;
    
    const parentId = branchQuestionInfo.parentId;
    
    // 直接统计该 parent 下的 user 消息数量
    const userMsgCount = messages.filter(m => 
      m.role === 'user' && m.parent_ids?.includes(parentId)
    ).length;
    
    // 如果只有 1 条或 2 条（新分支刚刚添加），说明是首次分支
    // 实际上，在 pending 状态时，新消息已经添加，所以应该是 2 条
    return userMsgCount >= 1 && userMsgCount <= 2;
  }, [branchQuestionInfo, messages]);

  // 计算需要显示的消息列表
  const displayMessages = useMemo((): Message[] => {
    // 只有在完全没有分支提问的情况下，才直接显示所有消息
    // 如果有 branchQuestionInfo.parentId（分支提问）或有 userMessageGroups（已有分支），都需要过滤
    const hasBranching = branchQuestionInfo.parentId !== null || userMessageGroups.length > 0;

    if (!hasBranching) {
      return messages;
    }

    // 收集所有需要显示的消息
    const result: Message[] = [];
    const processedParentIds = new Set<string>();

    // 收集所有不应显示的user消息ID（已被选中分支替代的消息）
    const excludedUserIds = new Set<string>();

    // 在pending状态下，需要排除非选中的分支消息
    if (branchQuestionInfo.isPending && branchQuestionInfo.parentId && branchQuestionInfo.originalMessageId) {
      excludedUserIds.add(branchQuestionInfo.originalMessageId);
    }

    // 对于已完成的分支，排除未被选中的分支消息
    selectedBranches.forEach((selectedUserId, parentId) => {
      // 找到该parent下所有的user消息
      const allUserMsgs = messages.filter(m =>
        m.role === 'user' && m.parent_ids?.includes(parentId)
      );
      // 排除未被选中的消息
      allUserMsgs.forEach(userMsg => {
        if (userMsg.id !== selectedUserId) {
          excludedUserIds.add(userMsg.id);
        }
      });
    });

    console.log('displayMessages 过滤:', {
      hasParentId: !!branchQuestionInfo.parentId,
      parentId: branchQuestionInfo.parentId,
      isPending: branchQuestionInfo.isPending,
      userMessageGroupsLength: userMessageGroups.length,
      selectedBranches: Array.from(selectedBranches.entries()),
      excludedUserIds: Array.from(excludedUserIds)
    });

    // 获取某个 parent 下选中的 user message
    const getSelectedUserMessage = (parentId: string): Message | null => {
      // 检查是否有选中的分支
      const selectedId = selectedBranches.get(parentId);
      if (selectedId) {
        const selected = messages.find(m => m.id === selectedId);
        if (selected) {
          console.log('getSelectedUserMessage: 使用选中的分支', {
            parentId,
            selectedId,
            selectedContent: selected.content.substring(0, 30)
          });
          return selected;
        }
      }

      // 首次分支提问且正在 pending 状态：选择最新的 user 消息（即新创建的分支）
      if (branchQuestionInfo.isPending && branchQuestionInfo.parentId === parentId) {
        // 找到该 parent 下最新的 user 消息
        const userMsgs = messages.filter(m =>
          m.role === 'user' && m.parent_ids?.includes(parentId)
        );
        if (userMsgs.length > 0) {
          const latest = userMsgs[userMsgs.length - 1];
          console.log('getSelectedUserMessage: pending 状态，选择最新消息', {
            parentId,
            latestId: latest.id,
            latestContent: latest.content.substring(0, 30),
            totalUserMsgs: userMsgs.length
          });
          return latest;
        }
      }

      // 默认选择该 parent 下的第一条 user 消息
      const group = userMessageGroups.find(g => g.parentId === parentId);
      if (group && group.messages.length > 0) {
        console.log('getSelectedUserMessage: 使用默认第一条消息', {
          parentId,
          firstId: group.messages[0].id,
          firstContent: group.messages[0].content.substring(0, 30),
          groupSize: group.messages.length
        });
        return group.messages[0];
      }

      console.warn('getSelectedUserMessage: 未找到任何消息', { parentId });
      return null;
    };
    
    // 第一步：收集所有作为 user 消息 parent 的 assistant 消息
    const assistantParents = new Set<string>();
    messages.forEach(msg => {
      if (msg.role === 'user' && msg.parent_ids && msg.parent_ids.length > 0) {
        assistantParents.add(msg.parent_ids[0]);
      }
    });
    
    // 第二步：遍历所有消息，构建显示列表
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // 跳过被排除的user消息
      if (msg.role === 'user' && excludedUserIds.has(msg.id)) {
        continue;
      }

      // 跳过被排除的user消息的assistant回复
      if (msg.role === 'assistant' && msg.parent_ids) {
        const hasExcludedParent = msg.parent_ids.some(parentId => excludedUserIds.has(parentId));
        if (hasExcludedParent) {
          continue;
        }
      }

      // 如果是 user 消息且有 parent_id
      if (msg.role === 'user' && msg.parent_ids && msg.parent_ids.length > 0) {
        const parentId = msg.parent_ids[0];

        // 如果这个 parent 已经处理过了，跳过（避免重复处理同一 parent 下的其他 user 消息）
        if (processedParentIds.has(parentId)) continue;
        processedParentIds.add(parentId);
        
        // 找到该 parent 对应的 assistant 消息
        const parentAssistantMsg = messages.find(m => m.id === parentId);
        
        // 添加 parent assistant 消息
        if (parentAssistantMsg && !result.find(m => m.id === parentAssistantMsg.id)) {
          result.push(parentAssistantMsg);
        }
        
        // 添加选中的 user 消息
        const selectedUserMsg = getSelectedUserMessage(parentId);
        if (selectedUserMsg && !result.find(m => m.id === selectedUserMsg.id)) {
          result.push(selectedUserMsg);
          
          // 添加该 user 消息的 assistant 回复
          const assistantReplies = messages.filter(m => 
            m.role === 'assistant' && 
            m.parent_ids?.includes(selectedUserMsg.id)
          );
          assistantReplies.forEach(reply => {
            if (!result.find(m => m.id === reply.id)) {
              result.push(reply);
            }
          });
        }
      } else if (msg.role === 'user') {
        // 处理首次提问的 user 消息（parent_ids 为空）
        if (!result.find(m => m.id === msg.id)) {
          result.push(msg);
        }

        // 添加该 user 消息的 assistant 回复
        const assistantReplies = messages.filter(m =>
          m.role === 'assistant' &&
          m.parent_ids?.includes(msg.id)
        );
        assistantReplies.forEach(reply => {
          if (!result.find(m => m.id === reply.id)) {
            result.push(reply);
          }
        });
      } else if (msg.role === 'assistant') {
        // 只添加不是任何 user 消息 parent 的 assistant 消息
        // （作为 parent 的 assistant 消息已经在上面处理了）
        if (!assistantParents.has(msg.id) && (!msg.parent_ids || msg.parent_ids.length === 0)) {
          if (!result.find(m => m.id === msg.id)) {
            result.push(msg);
          }
        }
      }
    }
    
    // 如果结果为空（首次对话等情况），返回原始消息
    if (result.length === 0) {
      return messages;
    }

    // 按原始顺序排序
    const messageOrder = new Map(messages.map((m, i) => [m.id, i]));
    result.sort((a, b) => {
      const orderA = messageOrder.get(a.id) ?? Infinity;
      const orderB = messageOrder.get(b.id) ?? Infinity;
      return orderA - orderB;
    });

    console.log('displayMessages 最终结果:', {
      originalLength: messages.length,
      filteredLength: result.length,
      resultIds: result.map(m => ({ id: m.id, role: m.role, content: m.content.substring(0, 20) }))
    });

    return result;
  }, [messages, selectedBranches, userMessageGroups, branchQuestionInfo]);

  // 处理分支提问：自动切换到新创建的分支
  useEffect(() => {
    // 只要有 parentId，说明这是分支提问（无论是否 pending）
    if (!branchQuestionInfo.parentId) return;

    const { parentId } = branchQuestionInfo;

    // 查找该 parent 下最新的 user 消息
    const userMsgs = messages.filter(msg =>
      msg.role === 'user' &&
      msg.parent_ids?.includes(parentId)
    );

    if (userMsgs.length === 0) {
      console.warn('未找到该 parent 下的 user 消息');
      return;
    }

    // 获取最新的消息（最后一条）
    const latestMessage = userMsgs[userMsgs.length - 1];

    console.log('更新分支选择:', {
      parentId,
      latestMessageId: latestMessage.id,
      isPending: branchQuestionInfo.isPending
    });

    // 立即同步更新，避免渲染时延迟导致显示旧消息
    // 不使用 startTransition，确保 selectedBranches 在 displayMessages 计算之前就更新完成
    setSelectedBranches(prev => {
      // 避免重复设置相同的值
      if (prev.get(parentId) === latestMessage.id) return prev;
      const newMap = new Map(prev);
      newMap.set(parentId, latestMessage.id);
      return newMap;
    });
  }, [branchQuestionInfo, messages]);

  // 用于追踪消息长度和消息ID映射的 ref
  const previousMessagesLengthRef = useRef(0);
  const previousMessagesRef = useRef<Message[]>([]);

  // 滚动事件处理
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const atBottom = scrollHeight - clientHeight <= scrollTop + 1;
    setIsAtBottom(atBottom);
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // 监听消息ID变化，同步更新 selectedBranches
  useEffect(() => {
    const prevMessages = previousMessagesRef.current;
    
    // 构建旧ID到新ID的映射
    const idMapping = new Map<string, string>();
    
    // 遍历当前消息，查找ID变化的情况
    messages.forEach(currentMsg => {
      // 查找具有相同 parent_ids 和内容的消息（认为是同一条消息）
      const matchingOldMsg = prevMessages.find(oldMsg => 
        oldMsg.role === currentMsg.role &&
        oldMsg.content === currentMsg.content &&
        oldMsg.id !== currentMsg.id &&
        JSON.stringify(oldMsg.parent_ids) === JSON.stringify(currentMsg.parent_ids)
      );
      
      if (matchingOldMsg) {
        idMapping.set(matchingOldMsg.id, currentMsg.id);
      }
    });
    
    // 如果有ID变化，更新 selectedBranches
    if (idMapping.size > 0) {
      setSelectedBranches(prev => {
        let updated = false;
        const newMap = new Map(prev);
        
        newMap.forEach((selectedId, parentId) => {
          // 检查 parentId 是否需要更新
          const newParentId = idMapping.get(parentId);
          if (newParentId) {
            newMap.delete(parentId);
            newMap.set(newParentId, selectedId);
            updated = true;
          }
          
          // 检查 selectedId 是否需要更新
          const newSelectedId = idMapping.get(selectedId);
          if (newSelectedId) {
            newMap.set(parentId, newSelectedId);
            updated = true;
          }
        });
        
        return updated ? newMap : prev;
      });
    }
    
    previousMessagesRef.current = messages;
  }, [messages, setSelectedBranches]);

  // 新消息开始时，强制滚动到底部
  useEffect(() => {
    if (shouldShowWelcome) return;
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
    if (isLoading) {
      console.log('SSE 流式输出期间，禁止切换 tab');
      return;
    }
    console.log('切换分支:', { branchingPointId, selectedBranchId });
    startTransition(() => {
      setSelectedBranches(prev => {
        const newMap = new Map(prev);
        newMap.set(branchingPointId, selectedBranchId);
        return newMap;
      });
    });
  }, [isLoading, startTransition]);

  // 获取某个消息的 tabs 分组信息
  const getMessageTabsInfo = (message: Message): { group: Message[] | null; groupId: string | null } => {
    if (message.role !== 'user' || !message.parent_ids || message.parent_ids.length === 0) {
      return { group: null, groupId: null };
    }
    
    const parentId = message.parent_ids[0];
    
    // 检查是否是常规分组（已有 2+ 个分支）
    const regularGroup = userMessageGroups.find(g => g.parentId === parentId);
    if (regularGroup) {
      return { group: regularGroup.messages, groupId: parentId };
    }
    
    // 检查是否是首次分支提问的 pending 状态或已完成的分支
    // 即使 isPending 为 false，只要我们有 parentId（表示这是分支提问），就应该构建分组
    if (branchQuestionInfo.parentId === parentId &&
        (isFirstBranchPending || branchQuestionInfo.originalMessageId)) {
      // 构建临时分组：原始消息 + 该 parent 下的所有分支消息
      const groupMessages: Message[] = [];

      // 添加原始消息（被分支的消息）
      // 首先尝试通过 originalMessageId 查找
      if (branchQuestionInfo.originalMessageId) {
        const originalMsg = messages.find(m => m.id === branchQuestionInfo.originalMessageId);
        if (originalMsg) {
          groupMessages.push(originalMsg);
        }
      }

      // 如果没找到，通过消息顺序查找（parent 消息之后的第一个 user 消息）
      if (groupMessages.length === 0) {
        const parentIndex = messages.findIndex(m => m.id === parentId);
        if (parentIndex >= 0) {
          const originalMsg = messages.slice(parentIndex + 1).find(m => m.role === 'user');
          if (originalMsg) {
            groupMessages.push(originalMsg);
          }
        }
      }

      // 添加该 parent 下的所有分支消息（parent_ids 匹配的消息）
      const branchMessages = messages.filter(m =>
        m.role === 'user' &&
        m.parent_ids?.includes(parentId)
      );
      branchMessages.forEach(m => {
        if (!groupMessages.find(gm => gm.id === m.id)) {
          groupMessages.push(m);
        }
      });

      // 确保包含当前消息（可能还没被加入到 messages 中）
      if (!groupMessages.find(m => m.id === message.id)) {
        groupMessages.push(message);
      }

      if (groupMessages.length >= 2) {
        return { group: groupMessages, groupId: parentId };
      }
    }
    
    return { group: null, groupId: null };
  };

  return (
    <main className={`chat-container ${shouldShowWelcome ? 'welcome-mode' : ''}`} ref={messagesContainerRef}>
      {shouldShowWelcome ? (
        welcomeScreen
      ) : (
        <div className="chat-messages">
          {displayMessages.map((message, index) => {
            const { group: messageGroup, groupId: messageGroupId } = getMessageTabsInfo(message);

            // 获取父消息（对于用户消息，获取上一个AI消息）
            let parentMessage: Message | null = null;
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
                {message.role === 'user' && messageGroup && messageGroupId && messageGroup.length >= 2 && (
                  <ConversationBranchTabs
                    branches={messageGroup.map(m => ({ ...m, children: [] }))}
                    selectedBranchId={selectedBranches.get(messageGroupId) || messageGroup[0].id}
                    onBranchSelect={(branchId) => handleBranchSelect(messageGroupId, branchId)}
                    isLoading={isLoading}
                  />
                )}
              </div>
            );
          })}
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
