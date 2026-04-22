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
  // 新增：增量更新相关
  incrementallyUpdateDag,
  type QuestionType,
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
  onMergeClick?: (parentId: string, parentContent: string) => void;
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
  toggleThinkingExpansion: _toggleThinkingExpansion,
  copyMessageToClipboard,
  shouldShowWelcome,
  welcomeScreen,
  onBranchClick,
  onMergeClick,
  onStateChange,
  savedState,
}) => {
  // ========================================
  // State
  // ========================================
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(false);

  // DAG 相关 state
  const [dag, setDag] = useState<Dag | null>(null);
  const [tabsContainers, setTabsContainers] = useState<TabsContainer[]>([]);
  const emptyTabsMap: MessageToTabsMap = new Map();
  const [tabsMap, setTabsMap] = useState(emptyTabsMap);
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
  // 辅助函数：推断提问类型
  // ========================================
  /**
   * 根据新增的消息推断提问类型
   *
   * @param newMessages - 新增的消息 (user + assistant)
   * @param prevDag - 之前的 DAG
   * @returns 提问类型
   */
  const inferQuestionType = useCallback(
    (newMessages: Message[], prevDag: Dag): QuestionType => {
      const userMessage = newMessages.find((m) => m.role === 'user');
      if (!userMessage) return 'normal';

      const parentIds = userMessage.parent_ids || [];

      // 没有父节点 → 普通提问
      if (parentIds.length === 0) return 'normal';

      // 多个父节点 → 合并提问
      if (parentIds.length >= 2) return 'merge';

      // 单个父节点
      const parentId = parentIds[0];
      const parent = prevDag.nodes.get(parentId);

      // 父节点不存在 → 普通提问
      if (!parent) return 'normal';

      // 父节点是 user → 普通提问（理论上不应该发生）
      if (parent.role === 'user') return 'normal';

      // 父节点是 assistant
      // 检查该 assistant 是否有其他 user 子节点
      const existingUserChildren = parent.children.filter(
        (c: DagNode) => c.role === 'user',
      );

      // 有其他 user 子节点 → 分支提问
      if (existingUserChildren.length > 0) return 'branch';

      // 没有其他 user 子节点 → 普通提问
      return 'normal';
    },
    [],
  );

  // ========================================
  // 辅助函数：保留 activeTab
  // ========================================
  /**
   * 全量重建 containers 时，保留之前用户选择的 activeTab
   *
   * 对于每个新 container，如果之前存在同 ID 的 container，
   * 且之前的 activeTab 仍然在新 container 的 tab 列表中，则继承。
   * 否则使用新 container 的默认值（最新 tab）。
   */
  const preserveActiveTabs = useCallback(
    (
      newContainers: TabsContainer[],
      prevContainers?: TabsContainer[],
    ): TabsContainer[] => {
      if (!prevContainers || prevContainers.length === 0) {
        return newContainers;
      }

      return newContainers.map((container) => {
        const prev = prevContainers.find((c) => c.id === container.id);
        if (!prev) return container;

        // 检查之前的 activeTab 是否仍然存在于新 container 的 tab 列表中
        let tabExists = false;
        if (container.type === 'children') {
          tabExists = container.userMessages.some(
            (u) => u.id === prev.activeTab,
          );
        } else {
          tabExists = container.assistantMessages.some(
            (a) => a.id === prev.activeTab,
          );
        }

        if (tabExists) {
          return { ...container, activeTab: prev.activeTab };
        }
        return container;
      });
    },
    [],
  );

  // ========================================
  // 辅助函数：构建所有状态
  // ========================================
  const buildAllStates = useCallback(
    (msgs: Message[], prevContainers?: TabsContainer[]) => {
      const newDag = buildDag(msgs);
      if (!newDag) {
        setTabsContainers([]);
        setTabsMap(new Map());
        setPath([]);
        return;
      }

      const { containers: newContainers, map: newMap } =
        buildTabsContainers(newDag);

      // 保留之前 container 的 activeTab 选择（全量重建时继承用户的选择）
      const finalContainers = preserveActiveTabs(newContainers, prevContainers);

      const newPath = buildPath(newDag, newMap, finalContainers);

      // 仅在开发模式下验证路径连通性
      if (import.meta.env.DEV && newPath.length > 0 && !isPathValid(newPath)) {
        console.error('[ChatContainer] Path is not connected');
      }

      setDag(newDag);
      setTabsContainers(finalContainers);
      setTabsMap(newMap);
      setPath(newPath);
    },
    [preserveActiveTabs],
  );

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

      // FIX: 检查 savedState 是否包含所有当前消息（避免新消息被忽略）
      const savedNodeCount = savedState.dag.nodes.size || 0;
      const hasAllMessages = savedNodeCount === messages.length;

      // FIX: 检查是否有临时ID消息（流式响应中），如果有则不使用 savedState
      const hasTempIdMessage = messages.some((m) => m.id.startsWith('temp-'));

      // FIX: 检查 savedState 自身是否包含 temp-ID（ID 替换后 messages 已无 temp-ID，
      // 但 savedState 可能是在流式阶段保存的，仍含 temp-ID + 空内容）
      const savedStateHasTempIds = Array.from(savedState.dag.nodes.keys()).some(
        (id) => id.startsWith('temp-'),
      );

      if (
        hasRootNode &&
        hasAllMessages &&
        !hasTempIdMessage &&
        !savedStateHasTempIds
      ) {
        // 状态恢复时的一致性校验
        const validationResult = validatePathContainerConsistency(
          savedState.path,
          savedState.tabsMap,
          savedState.tabsContainers,
          savedState.dag,
        );

        if (!validationResult.valid) {
          // 不一致时，重新构建所有状态（保留 activeTab）
          buildAllStates(messages, stateRef.current.tabsContainers);
          return;
        }

        // 从 savedState 恢复时，同步 messages 中的动态属性和内容（如 content, thinkingContent）
        const syncDynamicProps = (
          savedDag: Dag,
          savedPath: ConversationPath,
        ): { dag: Dag; path: ConversationPath } => {
          const updatedNodes = new Map(savedDag.nodes);

          const updatedPath = savedPath.map((node) => {
            const msg = messages.find((m) => m.id === node.id);
            if (
              msg &&
              (msg.content !== node.content ||
                msg.thinkingContent !== node.thinkingContent ||
                msg.isThinkingExpanded !== node.isThinkingExpanded ||
                msg.isWaitingForFirstToken !== node.isWaitingForFirstToken ||
                msg.deepThinkingEnabled !== node.deepThinkingEnabled)
            ) {
              const updatedNode = {
                ...node,
                content: msg.content,
                thinkingContent: msg.thinkingContent,
                isThinkingExpanded: msg.isThinkingExpanded,
                isWaitingForFirstToken: msg.isWaitingForFirstToken,
                deepThinkingEnabled: msg.deepThinkingEnabled,
              };
              updatedNodes.set(node.id, updatedNode);
              return updatedNode;
            }
            return node;
          });

          const hasChanges = updatedPath.some(
            (node, i) => node !== savedPath[i],
          );
          if (hasChanges) {
            return {
              dag: { ...savedDag, nodes: updatedNodes },
              path: updatedPath,
            };
          }
          return { dag: savedDag, path: savedPath };
        };

        const { dag: syncedDag, path: syncedPath } = syncDynamicProps(
          savedState.dag,
          savedState.path,
        );

        setDag(syncedDag);
        setTabsContainers(savedState.tabsContainers);
        setTabsMap(savedState.tabsMap);
        setPath(syncedPath);
        return;
      }
    }

    // 检测是否只是内容更新（流式响应），而不是结构变化
    const prevDag = stateRef.current.dag;

    // FIX: 检查 prevDag 是否属于当前对话
    const isDagBelongsToCurrentMessages = prevDag?.rootId
      ? messages.some((m) => m.id === prevDag.rootId)
      : false;

    if (
      prevDag &&
      prevDag.nodes.size === messages.length &&
      isDagBelongsToCurrentMessages
    ) {
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
        // FIX: 创建新的 path 和 dag 节点，保持引用一致性
        const updatedNodes = new Map(prevDag.nodes);

        const updatedPath = path.map((node) => {
          const msg = messages.find((m) => m.id === node.id);
          if (
            msg &&
            (msg.content !== node.content ||
              msg.thinkingContent !== node.thinkingContent ||
              msg.isWaitingForFirstToken !== node.isWaitingForFirstToken ||
              msg.isThinkingExpanded !== node.isThinkingExpanded ||
              msg.deepThinkingEnabled !== node.deepThinkingEnabled)
          ) {
            // 创建新节点对象
            const updatedNode = {
              ...node,
              content: msg.content,
              thinkingContent: msg.thinkingContent,
              isWaitingForFirstToken: msg.isWaitingForFirstToken,
              isThinkingExpanded: msg.isThinkingExpanded,
              deepThinkingEnabled: msg.deepThinkingEnabled,
            };
            // 同步更新 dag.nodes
            updatedNodes.set(node.id, updatedNode);
            return updatedNode;
          }
          return node;
        });

        // 如果 path 有变化，更新状态
        const pathChanged = updatedPath.some((node, i) => node !== path[i]);
        if (pathChanged) {
          setPath(updatedPath);
          setDag({ ...prevDag, nodes: updatedNodes });
        }
        return;
      }
    }

    // ========================================
    // 新增：增量更新逻辑
    // ========================================
    // 检测是否是新增节点（结构变化）
    // FIX: 同样需要检查 DAG 是否属于当前消息
    if (
      prevDag &&
      messages.length > prevDag.nodes.size &&
      isDagBelongsToCurrentMessages
    ) {
      // 识别新增的节点
      const newMessageIds = messages
        .filter((m) => !prevDag.nodes.has(m.id))
        .map((m) => m.id);

      if (newMessageIds.length >= 2) {
        // 获取新增的消息
        const newMessages = messages.filter((m) =>
          newMessageIds.includes(m.id),
        );

        // 推断提问类型
        const questionType = inferQuestionType(newMessages, prevDag);

        // 尝试增量更新
        const result = incrementallyUpdateDag(
          prevDag,
          stateRef.current.tabsContainers,
          stateRef.current.tabsMap,
          stateRef.current.path,
          newMessages,
          questionType,
        );

        if (result.success && result.dag) {
          setDag(result.dag);
          setTabsContainers(result.containers);
          setTabsMap(result.tabsMap);
          setPath(result.path);
          return;
        } else {
          console.warn(
            '[ChatContainer] Incremental update failed, falling back to full rebuild',
          );
        }
      }
    }

    // 构建所有状态（保留 activeTab）
    buildAllStates(messages, stateRef.current.tabsContainers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        console.error('[ChatContainer] Container not found:', containerId);
        return;
      }

      const newTabNode = currentDag.nodes.get(newTabId);
      if (!newTabNode) {
        console.error('[ChatContainer] Tab node not found:', newTabId);
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

      // 滚动锁定：必须在 flushSync 之前启动 RAF，否则 DOM 变更后到 RAF 启动之间会闪烁
      const tabEl = document.getElementById(containerId);
      const scrollContainer = messagesContainerRef.current;
      if (tabEl && scrollContainer) {
        scrollCleanupRef.current?.();

        const savedTop = tabEl.getBoundingClientRect().top;
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
          scrollCleanupRef.current = null;
        }, 250);

        scrollCleanupRef.current = () => {
          done = true;
          cancelAnimationFrame(rafId);
          clearTimeout(timerId);
          scrollCleanupRef.current = null;
        };
      }

      // 设置锁标记，阻止 path.length effect 覆盖
      scrollIntentRef.current = { type: 'tab-switching' };

      // 更新 state
      flushSync(() => {
        setTabsContainers(result.updatedContainers);
        setTabsMap(result.updatedTabsMap);
        setPath(result.newPath);
      });

      // DOM 更新后释放锁
      setTimeout(() => {
        scrollIntentRef.current = { type: 'auto' };
      }, 300);
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
  // 滚动控制：ScrollIntent 统一管理
  // ========================================
  type ScrollIntent =
    | { type: 'auto' }
    | { type: 'scroll-to-bottom'; delay?: number }
    | { type: 'preserve-position'; savedScrollTop: number }
    | { type: 'tab-switching' };

  const scrollIntentRef = useRef<ScrollIntent>({ type: 'auto' });
  const scrollCleanupRef = useRef<(() => void) | null>(null);

  // 包装 toggleThinkingExpansion：设置 preserve-position intent
  const toggleThinkingExpansion = useCallback(
    (messageId: string) => {
      if (!messagesContainerRef.current) return;
      scrollCleanupRef.current?.();
      scrollIntentRef.current = {
        type: 'preserve-position',
        savedScrollTop: messagesContainerRef.current.scrollTop,
      };
      _toggleThinkingExpansion(messageId);
      setTimeout(() => {
        scrollIntentRef.current = { type: 'auto' };
      }, 350);
    },
    [_toggleThinkingExpansion],
  );

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

  // 对话切换时设置 scroll-to-bottom intent
  useEffect(() => {
    if (currentDialogueId && path.length > 0) {
      scrollCleanupRef.current?.();
      scrollIntentRef.current = { type: 'scroll-to-bottom', delay: 100 };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDialogueId]);

  // 新消息加入时设置 scroll-to-bottom intent（path.length 增加 = 新节点）
  const prevPathLengthRef = useRef(0);
  useEffect(() => {
    // tab-switching 锁定期内不干预，RAF 由 handleTabClick 直接管理
    if (scrollIntentRef.current.type === 'tab-switching') {
      prevPathLengthRef.current = path.length;
      return;
    }
    if (
      path.length > prevPathLengthRef.current &&
      path.length > 0 &&
      !shouldShowWelcome
    ) {
      scrollCleanupRef.current?.();
      scrollIntentRef.current = { type: 'scroll-to-bottom', delay: 0 };
    }
    prevPathLengthRef.current = path.length;
  }, [path.length, shouldShowWelcome]);

  // 统一滚动 effect：根据 scrollIntent 分发滚动行为
  useEffect(() => {
    if (shouldShowWelcome || path.length === 0) return;

    const intent = scrollIntentRef.current;
    const container = messagesContainerRef.current;
    if (!container) return;

    switch (intent.type) {
      case 'preserve-position': {
        // 思考内容展开/收缩：恢复之前保存的 scrollTop
        container.scrollTop = intent.savedScrollTop;
        break;
      }

      case 'tab-switching': {
        // Tab 切换：RAF 由 handleTabClick 直接管理，这里不干预
        break;
      }

      case 'scroll-to-bottom': {
        // 对话加载/新消息：一次性滚到底部
        const delay = intent.delay ?? 0;
        const timerId = setTimeout(() => {
          container.scrollTop = container.scrollHeight - container.clientHeight;
          setIsAtBottom(true);
        }, delay);
        scrollCleanupRef.current = () => {
          clearTimeout(timerId);
        };
        // 一次性 intent，用完重置
        scrollIntentRef.current = { type: 'auto' };
        break;
      }

      case 'auto':
      default:
        // 流式输出期间不干预，由 ChatScrollAnchor 管理
        break;
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
                    onMergeClick={onMergeClick}
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
                    onMergeClick={onMergeClick}
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
                  onMergeClick={onMergeClick}
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
