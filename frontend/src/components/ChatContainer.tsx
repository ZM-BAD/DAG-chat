/**
 * ChatContainer (重构版本)
 *
 * 使用新的 DAG 架构：
 * - DagNode 包含双向引用（parent_ids 和 children）
 * - 使用 TabsContainer 管理分支和合并
 * - 使用 MessageToTabsMap 快速查找
 * - 使用 ConversationPath 驱动渲染
 * - 使用 DialoguePathsManager 管理多对话路径状态
 */

import {
  FC,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  useLayoutEffect,
} from 'react';
import { flushSync } from 'react-dom';
import { Message } from '../types';
import ChatMessage from './ChatMessage';
import { ChatScrollAnchor } from './ChatScrollAnchor';
import TabsComponent from './TabsContainer';
import {
  Dag,
  DagNode,
  TabsContainer,
  MessageToTabsMap,
  ConversationPath,
  ChildrenTabsContainer,
  ParentTabsContainer,
  isChildrenTabsContainer,
  buildDag,
  buildTabsContainers,
  getContainersByIds,
  buildPath,
  isPathValid,
  handleTabSwitch,
  validatePathContainerConsistency,
  getContainerForMessageByType,
} from '../utils/dagUtils';

interface ChatContainerProps {
  messages: Message[];
  currentDialogueId: string | null; // 当前对话 ID
  isLoading: boolean;
  toggleThinkingExpansion: (messageId: string) => void;
  copyMessageToClipboard: (content: string) => void;
  shouldShowWelcome: boolean;
  welcomeScreen: React.ReactNode;
  onBranchClick?: (parentId: string, parentContent: string) => void;
  // 状态变化通知回调
  onStateChange?: (
    dialogueId: string | null,
    state: {
      dag: Dag | null;
      tabsContainers: TabsContainer[];
      tabsMap: MessageToTabsMap;
      path: ConversationPath;
    },
  ) => void;
  // 保存的状态（用于恢复）
  savedState?: {
    dag: Dag | null;
    tabsContainers: TabsContainer[];
    tabsMap: MessageToTabsMap;
    path: ConversationPath;
  } | null;
}

const ChatContainerNew: FC<ChatContainerProps> = ({
  messages,
  currentDialogueId,
  isLoading,
  toggleThinkingExpansion,
  copyMessageToClipboard,
  shouldShowWelcome,
  welcomeScreen,
  onBranchClick,
  onStateChange,
  savedState,
}) => {
  // ========================================
  // State
  // ========================================
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState<boolean>(false);

  // Tab 切换滚动锁：记录 cleanup 函数，用于取消锁定
  const scrollLockCleanupRef = useRef<(() => void) | null>(null);

  // DAG 相关 state
  const [dag, setDag] = useState<Dag | null>(null);
  const [tabsContainers, setTabsContainers] = useState<TabsContainer[]>([]);
  const [tabsMap, setTabsMap] = useState<MessageToTabsMap>(new Map());
  const [path, setPath] = useState<ConversationPath>([]);

  // 使用 ref 保存最新的状态，用于在 useCallback 回调中访问最新值
  const stateRef = useRef({
    dag: null as Dag | null,
    tabsContainers,
    tabsMap,
    path,
    currentDialogueId,
  });

  // 使用 useLayoutEffect 同步更新 ref，避免在渲染期间访问 ref
  useLayoutEffect(() => {
    stateRef.current = {
      dag,
      tabsContainers,
      tabsMap,
      path,
      currentDialogueId,
    };
  });

  // ✅ 保存上一次实际通知给父组件的状态
  // 用于避免重复通知相同的状态
  const lastNotifiedStateRef = useRef<{
    dialogueId: string | null;
    path: ConversationPath;
  } | null>(null);

  // ========================================
  // 辅助函数：构建所有状态
  // ========================================
  const buildAllStates = useCallback((msgs: Message[]) => {
    const newDag = buildDag(msgs);

    if (!newDag) {
      setTabsContainers([]);
      setTabsMap(new Map());
      setPath([]);
      return;
    }

    const { containers: newContainers, map: newMap } =
      buildTabsContainers(newDag);

    const newPath = buildPath(newDag, newMap, newContainers);

    // 仅在开发模式下验证路径连通性
    if (import.meta.env.DEV && newPath.length > 0 && !isPathValid(newPath)) {
      console.error('[ChatContainer] 路径不连通');
    }

    setDag(newDag);
    setTabsContainers(newContainers);
    setTabsMap(newMap);
    setPath(newPath);
  }, []);

  // ========================================
  // Effect: 状态构建
  // ========================================
  useEffect(() => {
    if (messages.length === 0) {
      setDag(null);
      setTabsContainers([]);
      setTabsMap(new Map());
      setPath([]);
      // ✅ 重置通知状态标记，避免空消息场景下的边缘情况
      lastNotifiedStateRef.current = null;
      return;
    }

    // 检查是否有有效的保存状态
    if (savedState?.dag?.rootId) {
      const hasRootNode = messages.some(
        (msg) => msg.id === savedState.dag?.rootId,
      );

      if (hasRootNode) {
        // 状态恢复时的一致性校验
        const validationResult = validatePathContainerConsistency(
          savedState.path,
          savedState.tabsMap,
          savedState.tabsContainers,
          savedState.dag,
        );

        if (!validationResult.valid) {
          // 不一致时，重新构建所有状态
          buildAllStates(messages);
          return;
        }

        setDag(savedState.dag);
        setTabsContainers(savedState.tabsContainers);
        setTabsMap(savedState.tabsMap);
        setPath(savedState.path);
        return;
      }
    }

    // 检测是否只是内容更新（流式响应），而不是结构变化
    const prevDag = stateRef.current.dag;
    if (prevDag && prevDag.nodes.size === messages.length) {
      const prevIds = new Set(prevDag.nodes.keys());
      const newIds = new Set(messages.map((m) => m.id));

      let idsMatch = true;
      for (const id of newIds) {
        if (!prevIds.has(id)) {
          idsMatch = false;
          break;
        }
      }

      if (idsMatch) {
        // 只是内容更新，更新现有节点的属性
        const hasContentUpdate = stateRef.current.path.some((node) => {
          const msg = messages.find((m) => m.id === node.id);
          return (
            msg &&
            (msg.content !== node.content ||
              msg.thinkingContent !== node.thinkingContent ||
              msg.isWaitingForFirstToken !== node.isWaitingForFirstToken ||
              msg.isThinkingExpanded !== node.isThinkingExpanded)
          );
        });

        // 更新 path 中节点的属性
        stateRef.current.path.forEach((node) => {
          const msg = messages.find((m) => m.id === node.id);
          if (msg) {
            node.content = msg.content;
            node.thinkingContent = msg.thinkingContent;
            node.isWaitingForFirstToken = msg.isWaitingForFirstToken;
            node.isThinkingExpanded = msg.isThinkingExpanded;
            node.deepThinkingEnabled = msg.deepThinkingEnabled;
          }
        });

        // 同时更新 DAG 中所有节点的属性
        prevDag.nodes.forEach((node, id) => {
          const msg = messages.find((m) => m.id === id);
          if (msg) {
            node.content = msg.content;
            node.thinkingContent = msg.thinkingContent;
            node.isWaitingForFirstToken = msg.isWaitingForFirstToken;
            node.isThinkingExpanded = msg.isThinkingExpanded;
            node.deepThinkingEnabled = msg.deepThinkingEnabled;
          }
        });

        if (hasContentUpdate) {
          setPath([...stateRef.current.path]);
        }
        return;
      }
    }

    // 构建所有状态
    buildAllStates(messages);
  }, [messages, currentDialogueId, buildAllStates]);

  // ========================================
  // Effect: 通知父组件状态变化
  // ========================================
  useEffect(() => {
    if (!onStateChange || !currentDialogueId || !dag) return;

    const currentState = stateRef.current;
    const lastNotified = lastNotifiedStateRef.current;

    // 检查是否需要通知
    const shouldNotify =
      !lastNotified ||
      lastNotified.dialogueId !== currentDialogueId ||
      lastNotified.path !== currentState.path;

    if (!shouldNotify) return;

    // 保存本次通知的状态
    lastNotifiedStateRef.current = {
      dialogueId: currentDialogueId,
      path: currentState.path,
    };

    // 通知父组件
    onStateChange(currentDialogueId, {
      dag: currentState.dag,
      tabsContainers: currentState.tabsContainers,
      tabsMap: currentState.tabsMap,
      path: currentState.path,
    });
  }, [dag, tabsContainers, tabsMap, path, currentDialogueId, onStateChange]);

  // ========================================
  // Handler: Tab 切换
  // ========================================
  const handleTabClick = useCallback(
    (containerId: string, newTabId: string) => {
      const latestState = stateRef.current;
      const currentDag = latestState.dag;
      const currentTabsContainers = latestState.tabsContainers;
      const currentTabsMap = latestState.tabsMap;
      const currentPath = latestState.path;

      if (!currentDag) return;

      const container = currentTabsContainers.find((c) => c.id === containerId);
      if (!container) {
        console.error('[ChatContainer] 找不到 Container:', containerId);
        return;
      }

      const newTabNode = currentDag.nodes.get(newTabId);
      if (!newTabNode) {
        console.error('[ChatContainer] 找不到 Tab 节点:', newTabId);
        return;
      }

      const result = handleTabSwitch(
        containerId,
        newTabId,
        currentTabsContainers,
        currentDag,
        currentTabsMap,
        currentPath,
      );

      // 滚动锁定：保持 tab 容器视口位置不变
      const tabEl = document.getElementById(containerId);
      if (tabEl && messagesContainerRef.current) {
        scrollLockCleanupRef.current?.();

        const savedTop = tabEl.getBoundingClientRect().top;
        const scrollContainer = messagesContainerRef.current;
        let rafId = 0;
        let done = false;

        const correct = () => {
          if (done) return;
          const el = document.getElementById(containerId);
          if (el) {
            const drift = el.getBoundingClientRect().top - savedTop;
            if (Math.abs(drift) > 1) {
              scrollContainer.scrollTop += drift;
            }
          }
          rafId = requestAnimationFrame(correct);
        };
        rafId = requestAnimationFrame(correct);

        const timerId = setTimeout(() => {
          done = true;
          cancelAnimationFrame(rafId);
          scrollLockCleanupRef.current = null;
        }, 200);

        scrollLockCleanupRef.current = () => {
          done = true;
          cancelAnimationFrame(rafId);
          clearTimeout(timerId);
          scrollLockCleanupRef.current = null;
        };
      }

      // 更新 state
      flushSync(() => {
        setTabsContainers(result.updatedContainers);
        setTabsMap(result.updatedTabsMap);
        setPath(result.newPath);
      });
    },
    [],
  );

  // ========================================
  // 辅助函数：根据路径判断应该渲染哪个 container
  // ========================================

  /**
   * 判断当前 user.message 应该渲染哪个 children-tabs-container
   */
  const getChildrenContainerForUser = useCallback(
    (
      userNode: DagNode,
      path: ConversationPath,
      currentTabsMap: MessageToTabsMap,
      currentTabsContainers: TabsContainer[],
    ): ChildrenTabsContainer | null => {
      const userIndex = path.findIndex((n) => n.id === userNode.id);
      if (userIndex === -1 || userIndex === 0) return null;

      const prevNode = path[userIndex - 1];
      if (prevNode.role !== 'assistant') return null;

      const containerIds = currentTabsMap.get(prevNode.id) || [];
      const container = getContainerForMessageByType(
        prevNode.id,
        containerIds,
        currentTabsContainers,
        'children',
      );

      if (!container || !isChildrenTabsContainer(container)) return null;

      // 降级处理：确保 path 与 container activeTab 一致
      if (container.activeTab !== userNode.id) {
        return { ...container, activeTab: userNode.id };
      }

      return container;
    },
    [],
  );

  /**
   * 判断当前 assistant.message 应该渲染哪个 parent-tabs-container
   */
  const getParentContainerForAssistant = useCallback(
    (
      assistantNode: DagNode,
      path: ConversationPath,
      currentTabsMap: MessageToTabsMap,
      currentTabsContainers: TabsContainer[],
    ): ParentTabsContainer | null => {
      const assistantIndex = path.findIndex((n) => n.id === assistantNode.id);
      if (assistantIndex === -1 || assistantIndex === path.length - 1) {
        return null;
      }

      const nextNode = path[assistantIndex + 1];
      if (nextNode.role !== 'user') return null;

      const containerIds = currentTabsMap.get(assistantNode.id);
      if (!containerIds || containerIds.length === 0) return null;

      const containers = getContainersByIds(
        containerIds,
        currentTabsContainers,
      );
      if (containers.length === 0) return null;

      // 找到 assistant 所属的 ParentTabsContainer
      const parentContainer = containers.find(
        (c): c is ParentTabsContainer =>
          c.type === 'parent' && c.userMessageId === nextNode.id,
      );

      if (!parentContainer) return null;

      // 降级处理：确保 path 与 container activeTab 一致
      if (parentContainer.activeTab !== assistantNode.id) {
        return { ...parentContainer, activeTab: assistantNode.id };
      }

      return parentContainer;
    },
    [],
  );

  // ========================================
  // 预计算每个节点的 container 信息
  // ========================================
  const nodesContainerInfo = useMemo(() => {
    const info: Map<
      string,
      {
        childrenContainer: ChildrenTabsContainer | null;
        parentContainer: ParentTabsContainer | null;
      }
    > = new Map();

    for (const node of path) {
      let childrenContainer: ChildrenTabsContainer | null = null;
      let parentContainer: ParentTabsContainer | null = null;

      if (node.role === 'user') {
        childrenContainer = getChildrenContainerForUser(
          node,
          path,
          tabsMap,
          tabsContainers,
        );
      }

      if (node.role === 'assistant') {
        parentContainer = getParentContainerForAssistant(
          node,
          path,
          tabsMap,
          tabsContainers,
        );
      }

      info.set(node.id, { childrenContainer, parentContainer });
    }

    return info;
  }, [
    path,
    tabsMap,
    tabsContainers,
    getChildrenContainerForUser,
    getParentContainerForAssistant,
  ]);

  // ========================================
  // 滚动处理
  // ========================================
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } =
      messagesContainerRef.current;
    const atBottom = scrollHeight - clientHeight <= scrollTop + 1;

    setIsAtBottom(atBottom);
  }, []);

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
    if (shouldShowWelcome) return;

    const currentLength = path.length;

    if (currentLength > 0) {
      const timerId = setTimeout(() => {
        if (!messagesContainerRef.current) return;

        const container = messagesContainerRef.current;
        container.scrollTop = container.scrollHeight - container.clientHeight;
        setIsAtBottom(true);
      }, 0);
      void timerId;
    }
  }, [path.length, shouldShowWelcome]);

  // 历史消息加载时，强制滚动到底部
  useEffect(() => {
    const currentLength = path.length;
    const isHistoryLoad = currentLength > 1;

    if (isHistoryLoad && !shouldShowWelcome) {
      const timerId = setTimeout(() => {
        if (!messagesContainerRef.current) return;

        const container = messagesContainerRef.current;
        container.scrollTop = container.scrollHeight - container.clientHeight;
        setIsAtBottom(true);
      }, 100);
      void timerId;
    }
  }, [path, shouldShowWelcome]);

  // ========================================
  // 渲染
  // ========================================
  return (
    <main
      className={`chat-container ${shouldShowWelcome ? 'welcome-mode' : ''}`}
      ref={messagesContainerRef}
    >
      {shouldShowWelcome ? (
        welcomeScreen
      ) : (
        <div className="chat-messages">
          {path.map((node, index) => {
            // 获取父消息（对于用户消息，获取上一个AI消息）
            const parentMessage: DagNode | null =
              node.role === 'user' && index > 0 ? path[index - 1] : null;

            // 从预计算的信息中获取 container
            const containerInfo = nodesContainerInfo.get(node.id);
            const childrenContainer = containerInfo?.childrenContainer ?? null;
            const parentContainer = containerInfo?.parentContainer ?? null;

            // 渲染 ParentTabsContainer (在 assistant 消息之后)
            if (parentContainer) {
              return (
                <div
                  key={`parent-${parentContainer.id}`}
                  className="parent-tabs-unit"
                >
                  <ChatMessage
                    message={node}
                    toggleThinkingExpansion={toggleThinkingExpansion}
                    copyMessageToClipboard={copyMessageToClipboard}
                    onBranchClick={onBranchClick}
                    parentMessage={null}
                  />
                  <TabsComponent
                    container={parentContainer}
                    onTabClick={handleTabClick}
                  />
                </div>
              );
            }

            // 渲染 ChildrenTabsContainer + User Message
            if (childrenContainer) {
              return (
                <div
                  key={`children-${childrenContainer.id}`}
                  className="children-tabs-unit"
                >
                  <TabsComponent
                    container={childrenContainer}
                    onTabClick={handleTabClick}
                  />
                  <ChatMessage
                    message={node}
                    toggleThinkingExpansion={toggleThinkingExpansion}
                    copyMessageToClipboard={copyMessageToClipboard}
                    onBranchClick={onBranchClick}
                    parentMessage={parentMessage}
                  />
                </div>
              );
            }

            // 渲染普通消息（无 container）
            return (
              <div key={node.id}>
                <ChatMessage
                  message={node}
                  toggleThinkingExpansion={toggleThinkingExpansion}
                  copyMessageToClipboard={copyMessageToClipboard}
                  onBranchClick={onBranchClick}
                  parentMessage={parentMessage}
                />
              </div>
            );
          })}

          {/* 滚动锚点 */}
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

export default ChatContainerNew;
