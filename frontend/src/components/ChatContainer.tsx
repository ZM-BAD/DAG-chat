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
  // DAG 构建相关
  buildDag,
  // Tabs Container 构建相关
  buildTabsContainers,
  getContainersByIds,
  // 路径构建相关
  buildPath,
  isPathValid,
  getPathLeaf,
  getPathRoot,
  // Tab 切换相关
  handleTabSwitch,
  // 校验相关
  validatePathContainerConsistency,
  logValidationResult,
  // 辅助函数
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
  // 辅助函数：格式化消息内容
  // ========================================

  /**
   * 获取消息内容的简短摘要（用于日志）
   * @param content - 消息内容
   * @param maxLength - 最大长度（默认 30）
   * @returns 摘要字符串
   */
  const formatContent = useCallback(
    (content: string | null | undefined, maxLength: number = 30): string => {
      // 先检查 content 是否存在
      if (!content) {
        return '[空内容]';
      }
      // 再检查 content.length
      if (content.length === 0) {
        return '[空内容]';
      }
      if (content.length <= maxLength) {
        return content;
      }
      return content.substring(0, maxLength) + '...';
    },
    [],
  );

  /**
   * 格式化节点信息（用于日志）
   * @param node - DAG 节点
   * @returns 格式化后的字符串
   */
  const formatNodeInfo = useCallback(
    (node: DagNode): string => {
      const role = node.role === 'user' ? '👤 用户' : '🤖 助手';
      const content = formatContent(node.content, 30);
      const id = node.id.substring(0, 8); // 只显示 ID 的前 8 位
      return `${role} [${id}]: ${content}`;
    },
    [formatContent],
  );

  /**
   * 格式化路径信息（用于日志）
   * @param path - 路径
   * @returns 格式化后的字符串数组
   */
  const formatPathInfo = useCallback(
    (path: ConversationPath): string[] => {
      return path.map((node, index) => {
        const num = String(index + 1).padStart(2, '0');
        const role = node.role === 'user' ? '👤' : '🤖';
        const content = formatContent(node.content, 40);
        const id = node.id.substring(0, 8);
        return `[${num}] ${role} [${id}]: ${content}`;
      });
    },
    [formatContent],
  );

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
  const buildAllStates = useCallback(
    (
      msgs: Message[],
      fmtContent: (content: string, maxLength?: number) => string,
      fmtNodeInfo: (node: DagNode) => string,
      fmtPathInfo: (path: ConversationPath) => string[],
    ) => {
      // 构建 DAG
      console.log('🔨 [DAG] 开始构建 DAG...');
      const newDag = buildDag(msgs);

      if (newDag) {
        console.log('✅ [DAG] DAG 构建成功');
        console.log(`   - 根节点: ${newDag.rootId ?? 'null'}`);

        if (newDag.rootId) {
          const rootNode = newDag.nodes.get(newDag.rootId);
          if (rootNode && rootNode.content) {
            console.log(`   - 根节点内容: ${fmtContent(rootNode.content, 50)}`);
          }
        }

        console.log(`   - 总节点数: ${String(newDag.nodes.size)}`);
      } else {
        console.warn('⚠️  [DAG] DAG 构建失败：消息列表为空');
      }

      setDag(newDag);

      if (!newDag) {
        setTabsContainers([]);
        setTabsMap(new Map());
        setPath([]);
        return;
      }

      // 构建 TabsContainers
      console.log('🏗️  [TabsContainer] 开始构建 Tabs Containers...');
      const { containers: newContainers, map: newMap } =
        buildTabsContainers(newDag);

      console.log('✅ [TabsContainer] Tabs Containers 构建成功');
      console.log(`   - Containers 数量: ${String(newContainers.length)}`);

      // 打印详细信息
      const childrenContainers = newContainers.filter(
        (c) => c.type === 'children',
      );
      if (childrenContainers.length > 0) {
        console.log(
          `   - Children Containers: ${String(childrenContainers.length)}`,
        );
        childrenContainers.forEach((container, index) => {
          const assistant = newDag.nodes.get(container.assistantMessageId);
          const assistantContent = assistant
            ? fmtContent(assistant.content, 30)
            : '[未知]';
          console.log(
            `     [${String(index + 1)}] Assistant: ${assistantContent}`,
          );
          console.log(
            `         分支数: ${String(container.userMessages.length)}`,
          );
          container.userMessages.forEach((userNode, idx) => {
            const isActive = userNode.id === container.activeTab;
            const marker = isActive ? '✓ ' : '  ';
            console.log(
              `         ${marker}[${String(idx + 1)}] ${fmtContent(userNode.content, 25)}`,
            );
          });
        });
      }

      const parentContainers = newContainers.filter((c) => c.type === 'parent');
      if (parentContainers.length > 0) {
        console.log(
          `   - Parent Containers: ${String(parentContainers.length)}`,
        );
        parentContainers.forEach((container, index) => {
          const user = newDag.nodes.get(container.userMessageId);
          const userContent = user ? fmtContent(user.content, 30) : '[未知]';
          console.log(`     [${String(index + 1)}] User: ${userContent}`);
          console.log(
            `         合并来源数: ${String(container.assistantMessages.length)}`,
          );
          container.assistantMessages.forEach((assistantNode, idx) => {
            const isActive = assistantNode.id === container.activeTab;
            const marker = isActive ? '✓ ' : '  ';
            const model = assistantNode.model || '未知模型';
            console.log(
              `         ${marker}[${String(idx + 1)}] [${model}] ${fmtContent(assistantNode.content, 25)}`,
            );
          });
        });
      }

      setTabsContainers(newContainers);
      setTabsMap(newMap);

      // 构建路径
      console.log('🛣️  [Path] 开始构建路径...');
      const newPath = buildPath(newDag, newMap, newContainers);

      console.log('✅ [Path] 路径构建成功');
      console.log(`   - 路径长度: ${String(newPath.length)} 个节点`);
      console.log('📋 [Path] 当前渲染路径:');
      const formattedPath = fmtPathInfo(newPath);
      formattedPath.forEach((line) => {
        console.log(`   ${line}`);
      });

      // 验证路径连通性
      if (newPath.length > 0) {
        const valid = isPathValid(newPath);
        if (!valid) {
          console.error('❌ [Path] 路径不连通！');
        } else {
          console.log('✅ [Path] 路径连通性验证通过');
        }

        const root = getPathRoot(newPath);
        const leaf = getPathLeaf(newPath);
        if (root) {
          console.log(`   - 起点: ${fmtNodeInfo(root)}`);
        }
        if (leaf) {
          console.log(`   - 终点: ${fmtNodeInfo(leaf)}`);
        }
      }

      // 校验：路径与容器一致性
      if (newPath.length > 0) {
        const validationResult = validatePathContainerConsistency(
          newPath,
          newMap,
          newContainers,
          newDag,
        );
        logValidationResult(validationResult);
      }

      setPath(newPath);
    },
    [],
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
    // 只在 savedState 存在且根节点 ID 匹配时才恢复
    console.log('🔍 [State] 检查 savedState:', {
      hasSavedState: !!savedState,
      hasDag: !!savedState?.dag,
      rootId: savedState?.dag?.rootId,
      currentDialogueId,
    });

    if (savedState?.dag?.rootId) {
      const hasRootNode = messages.some(
        (msg) => msg.id === savedState.dag?.rootId,
      );
      console.log('🔍 [State] 根节点匹配检查:', {
        savedRootId: savedState.dag.rootId,
        hasRootNode,
        messageIds: messages.map((m) => m.id),
      });

      if (hasRootNode) {
        // ✅ 策略3: 状态恢复时的一致性校验
        // 验证保存的 path 与 containers 是否一致
        const validationResult = validatePathContainerConsistency(
          savedState.path,
          savedState.tabsMap,
          savedState.tabsContainers,
          savedState.dag,
        );

        if (!validationResult.valid) {
          console.warn(
            '⚠️ [State] 保存的状态存在不一致，将重新构建:\n' +
              validationResult.errors
                .map((e) => `   - ${e.message}`)
                .join('\n'),
          );
          // 不一致时，重新构建所有状态
          buildAllStates(
            messages,
            formatContent,
            formatNodeInfo,
            formatPathInfo,
          );
          return;
        }

        console.log('♻️  [State] 恢复保存的状态...');
        console.log('   - 保存的路径长度:', savedState.path.length);
        console.log(
          '   - 最后节点ID:',
          savedState.path.length > 0
            ? savedState.path[savedState.path.length - 1].id.substring(0, 8)
            : 'empty',
        );
        console.log('   - 一致性校验: ✅ 通过');
        setDag(savedState.dag);
        setTabsContainers(savedState.tabsContainers);
        setTabsMap(savedState.tabsMap);
        setPath(savedState.path);
        return;
      }
    }

    // ✅ 优化：检测是否只是内容更新（流式响应），而不是结构变化
    // 如果现有 DAG 存在，且消息 ID 集合相同，则只更新内容，不重建 DAG
    const prevDag = stateRef.current.dag;
    if (prevDag && prevDag.nodes.size === messages.length) {
      const prevIds = new Set(prevDag.nodes.keys());
      const newIds = new Set(messages.map((m) => m.id));

      // 检查 ID 集合是否完全相同
      let idsMatch = true;
      for (const id of newIds) {
        if (!prevIds.has(id)) {
          idsMatch = false;
          break;
        }
      }

      if (idsMatch) {
        // ✅ 只是内容更新，更新现有节点的属性，保持引用稳定
        console.log('📝 [DAG] 检测到内容更新（流式响应），只更新节点属性...');

        // 检测是否有内容变化
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
          // 触发重新渲染，但保持节点引用
          setPath([...stateRef.current.path]);
        }
        return;
      }
    }

    // 构建所有状态
    buildAllStates(messages, formatContent, formatNodeInfo, formatPathInfo);

    // ✅ savedState 通过 savedStateRef 读取，不需要加入依赖数组
    // ✅ 只依赖 messages 和 currentDialogueId 来触发状态检查
  }, [
    messages,
    currentDialogueId,
    formatContent,
    formatNodeInfo,
    formatPathInfo,
    buildAllStates,
  ]);

  // ========================================
  // Effect: 通知父组件状态变化（使用上一次通知比较）
  // ========================================
  useEffect(() => {
    if (!onStateChange || !currentDialogueId || !dag) {
      console.log('💾 [State] 跳过保存:', {
        hasOnStateChange: !!onStateChange,
        hasDialogueId: !!currentDialogueId,
        hasDag: !!dag,
      });
      return;
    }

    const currentState = stateRef.current;

    // ✅ 与上一次通知的状态比较
    const lastNotified = lastNotifiedStateRef.current;

    // 检查是否需要通知：
    // 1. 对话 ID 不同
    // 2. Path 引用不同（说明 path 内容变化）
    const shouldNotify =
      !lastNotified ||
      lastNotified.dialogueId !== currentDialogueId ||
      lastNotified.path !== currentState.path;

    if (!shouldNotify) {
      console.log('💾 [State] 跳过保存: 状态未变化');
      return;
    }

    console.log('💾 [State] 保存状态到父组件:', {
      dialogueId: currentDialogueId,
      pathLength: currentState.path.length,
      tabsCount: currentState.tabsContainers.length,
      lastNodeId:
        currentState.path.length > 0
          ? currentState.path[currentState.path.length - 1].id.substring(0, 8)
          : 'empty',
    });

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
      // ✅ 关键修复：使用 ref 获取最新的 state，避免 useCallback 闭包问题
      const latestState = stateRef.current;
      const currentDag = latestState.dag;
      const currentTabsContainers = latestState.tabsContainers;
      const currentTabsMap = latestState.tabsMap;
      const currentPath = latestState.path;

      // 安全检查：如果 DAG 不存在，直接返回
      if (!currentDag) {
        console.warn('⚠️ [TabSwitch] DAG 不存在，无法切换 Tab');
        return;
      }

      console.log('🔄 [TabSwitch] ===== 用户点击 Tab =====');
      console.log(`   Container ID: ${containerId.substring(0, 8)}`);
      console.log(`   New Tab ID: ${newTabId.substring(0, 8)}`);

      // ✅ 关键修复：使用最新的 tabsContainers 查找 container
      const container = currentTabsContainers.find((c) => c.id === containerId);
      if (!container) {
        console.error(
          `❌ [TabSwitch] 找不到 Container: ${containerId.substring(0, 8)}`,
        );
        console.log(
          '   可用的 containers:',
          currentTabsContainers.map((c) => c.id.substring(0, 8)),
        );
        return;
      }

      console.log(`   Container 类型: ${container.type}`);
      console.log(
        `   Container 当前 activeTab: ${container.activeTab.substring(0, 8)}`,
      );

      if (container.type === 'children') {
        const assistant = currentDag.nodes.get(container.assistantMessageId);
        console.log(
          `   所属 Assistant: ${assistant ? assistant.content.substring(0, 30) : '[未知]'}...`,
        );
        console.log(
          `   可用 User 分支:`,
          container.userMessages.map((u) => ({
            id: u.id.substring(0, 8),
            content: u.content.substring(0, 20),
            isActive: u.id === container.activeTab,
          })),
        );
      } else {
        const user = currentDag.nodes.get(container.userMessageId);
        console.log(
          `   所属 User: ${user ? user.content.substring(0, 30) : '[未知]'}...`,
        );
        console.log(
          `   可用 Assistant 来源:`,
          container.assistantMessages.map((a) => ({
            id: a.id.substring(0, 8),
            content: a.content.substring(0, 20),
            isActive: a.id === container.activeTab,
          })),
        );
      }

      // 查找新 Tab 信息
      const newTabNode = currentDag.nodes.get(newTabId);
      if (newTabNode) {
        console.log(
          `   切换到: ${newTabNode.role} - ${newTabNode.content.substring(0, 40)}...`,
        );
      } else {
        console.error(
          `❌ [TabSwitch] 找不到新 Tab 节点: ${newTabId.substring(0, 8)}`,
        );
        return;
      }

      console.log('🔄 [TabSwitch] 调用 handleTabSwitch...');

      // ✅ 关键修复：使用最新的 state 调用 handleTabSwitch
      const result = handleTabSwitch(
        containerId,
        newTabId,
        currentTabsContainers,
        currentDag,
        currentTabsMap,
        currentPath, // 传入当前路径
      );

      console.log('✅ [TabSwitch] handleTabSwitch 返回结果:');
      console.log(`   新 path 长度: ${String(result.newPath.length)}`);
      console.log(
        `   Path 第一个节点: ${result.newPath[0]?.content.substring(0, 30)}...`,
      );
      console.log(
        `   Path 最后一个节点: ${result.newPath[result.newPath.length - 1]?.content.substring(0, 30)}...`,
      );

      // 在更新 state 之前，启动滚动锁定：保持 tab 容器视口位置不变
      const tabEl = document.getElementById(containerId);
      if (tabEl && messagesContainerRef.current) {
        // 清除上一次的锁定（如果有）
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

        // 200ms 后解除锁定
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
      // ✅ P0 修复：直接使用 handleTabSwitch 返回的路径，避免重新构建导致不一致
      // handleTabSwitch 已经精心构建了正确的路径，直接使用即可
      flushSync(() => {
        setTabsContainers(result.updatedContainers);
        setTabsMap(result.updatedTabsMap);
        setPath(result.newPath);
      });

      console.log('📋 [TabSwitch] 切换后的新路径:');
      const formattedPath = result.newPath.map((node, index) => {
        const num = String(index + 1).padStart(2, '0');
        const role = node.role === 'user' ? '👤' : '🤖';
        const content = node.content.substring(0, 40);
        const id = node.id.substring(0, 8);
        return `[${num}] ${role} [${id}]: ${content}`;
      });
      formattedPath.forEach((line) => {
        console.log(`   ${line}`);
      });
    },
    // ✅ 关键修复：由于我们使用 stateRef 获取最新状态，依赖数组可以为空
    // 这样可以避免闭包问题，确保每次点击都使用最新的 state
    [],
  );

  // ========================================
  // 辅助函数：根据路径判断应该渲染哪个 container
  // ========================================

  /**
   * 判断当前 user.message 应该渲染哪个 children-tabs-container
   *
   * 逻辑：
   * 1. 获取当前 user.message 在 path 中的上一个节点
   * 2. 如果上一个节点是 assistant，找到对应的 children-tabs-container
   * 3. ✅ 策略2: 降级处理 - 当 path 与 container activeTab 不一致时，强制修正 activeTab
   *    这保证了渲染的 user 消息与 Tabs 高亮状态严格一致，同时避免 container "丢失"
   */
  const getChildrenContainerForUser = useCallback(
    (
      userNode: DagNode,
      path: ConversationPath,
      currentTabsMap: MessageToTabsMap,
      currentTabsContainers: TabsContainer[],
    ): ChildrenTabsContainer | null => {
      // 找到 userNode 在 path 中的索引
      const userIndex = path.findIndex((n) => n.id === userNode.id);
      if (userIndex === -1 || userIndex === 0) {
        return null;
      }

      // 获取上一个节点
      const prevNode = path[userIndex - 1];
      if (prevNode.role !== 'assistant') {
        return null;
      }

      // ✅ 使用传入的 tabsMap 和 tabsContainers
      const containerIds = currentTabsMap.get(prevNode.id) || [];
      const container = getContainerForMessageByType(
        prevNode.id,
        containerIds,
        currentTabsContainers,
        'children',
      );

      if (!container) return null;
      if (!isChildrenTabsContainer(container)) return null;

      // ✅ 策略2: 降级处理 - 检查 path 与 container activeTab 的一致性
      if (container.activeTab !== userNode.id) {
        console.warn(
          `[Consistency Warning] ChildrenTabsContainer 不一致:\n` +
            `  Path 中的 user: ${userNode.content.substring(0, 30)}... (${userNode.id.substring(0, 8)})\n` +
            `  Container activeTab: ${container.activeTab.substring(0, 8)}\n` +
            `  ✅ 修正: 使用 path 中的 user 作为 activeTab 进行渲染，确保 UI 一致性`,
        );

        // ✅ 返回修正后的 container，确保 UI 高亮与实际显示的消息一致
        return {
          ...container,
          activeTab: userNode.id,
        };
      }

      return container;
    },
    [],
  );

  /**
   * 判断当前 assistant.message 应该渲染哪个 parent-tabs-container
   *
   * 逻辑：
   * 1. 获取当前 assistant.message 在 path 中的下一个节点
   * 2. ✅ 改进：直接从 assistantNode 获取其所属的 containers
   * 3. ✅ 策略2: 降级处理 - 当 path 与 container activeTab 不一致时，强制修正 activeTab
   *    这保证了渲染的 assistant 消息与 Tabs 高亮状态严格一致，同时避免 container "丢失"
   */
  const getParentContainerForAssistant = useCallback(
    (
      assistantNode: DagNode,
      path: ConversationPath,
      currentTabsMap: MessageToTabsMap,
      currentTabsContainers: TabsContainer[],
    ): ParentTabsContainer | null => {
      // 找到 assistantNode 在 path 中的索引
      const assistantIndex = path.findIndex((n) => n.id === assistantNode.id);
      if (assistantIndex === -1 || assistantIndex === path.length - 1) {
        return null;
      }

      // 获取下一个节点
      const nextNode = path[assistantIndex + 1];
      if (nextNode.role !== 'user') {
        return null;
      }

      // ✅ 使用传入的 tabsMap 和 tabsContainers
      const containerIds = currentTabsMap.get(assistantNode.id);
      if (!containerIds || containerIds.length === 0) {
        return null;
      }

      // 从 containerIds 获取实际的 container 对象
      const containers = getContainersByIds(
        containerIds,
        currentTabsContainers,
      );
      if (containers.length === 0) {
        return null;
      }

      // 找到 assistant 所属的 ParentTabsContainer，且该 container 的 userMessageId 是 nextNode
      const parentContainer = containers.find(
        (c): c is ParentTabsContainer =>
          c.type === 'parent' && c.userMessageId === nextNode.id,
      );

      if (!parentContainer) return null;

      // ✅ 策略2: 降级处理 - 检查 path 与 container activeTab 的一致性
      if (parentContainer.activeTab !== assistantNode.id) {
        console.warn(
          `[Consistency Warning] ParentTabsContainer 不一致:\n` +
            `  Path 中的 assistant: ${assistantNode.content.substring(0, 30)}... (${assistantNode.id.substring(0, 8)})\n` +
            `  Container activeTab: ${parentContainer.activeTab.substring(0, 8)}\n` +
            `  ✅ 修正: 使用 path 中的 assistant 作为 activeTab 进行渲染，确保 UI 一致性`,
        );

        // ✅ 返回修正后的 container，确保 UI 高亮与实际显示的消息一致
        return {
          ...parentContainer,
          activeTab: assistantNode.id,
        };
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

            // ========================================
            // 渲染 ParentTabsContainer (在 assistant 消息之后)
            // ========================================
            if (parentContainer) {
              console.log(
                `🏷️  [Render] 渲染 ParentTabsContainer: ${parentContainer.id}`,
              );

              // 打印 User 消息信息
              if (dag) {
                const userNode = dag.nodes.get(parentContainer.userMessageId);
                console.log(
                  `   - 📝 User 消息: ${userNode ? formatContent(userNode.content, 40) : '[未知]'}`,
                );
              }

              // 打印所有 Assistant 选项
              console.log(
                `   - 🔀 合并来源 (${String(parentContainer.assistantMessages.length)} 个):`,
              );
              parentContainer.assistantMessages.forEach(
                (assistantNode, idx) => {
                  const isActive =
                    assistantNode.id === parentContainer.activeTab;
                  const marker = isActive ? '✓ ' : '  ';
                  const model = assistantNode.model || '未知';
                  console.log(
                    `      ${marker}[${String(idx + 1)}] [${model}] ${formatContent(assistantNode.content, 30)}`,
                  );
                },
              );

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

            // ========================================
            // 渲染 ChildrenTabsContainer + User Message
            // ========================================
            if (childrenContainer) {
              console.log(
                `🏷️  [Render] 渲染 ChildrenTabsContainer: ${childrenContainer.id}`,
              );

              // 打印 Assistant 消息信息
              if (dag) {
                const assistantNode = dag.nodes.get(
                  childrenContainer.assistantMessageId,
                );
                console.log(
                  `   - 📝 Assistant 消息: ${assistantNode ? formatContent(assistantNode.content, 40) : '[未知]'}`,
                );
              }

              // 打印所有 User 选项
              console.log(
                `   - 🌿 分支选项 (${String(childrenContainer.userMessages.length)} 个):`,
              );
              childrenContainer.userMessages.forEach((userNode, idx) => {
                const isActive = userNode.id === childrenContainer.activeTab;
                const marker = isActive ? '✓ ' : '  ';
                console.log(
                  `      ${marker}[${String(idx + 1)}] ${formatContent(userNode.content, 30)}`,
                );
              });

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

            // ========================================
            // 渲染普通消息（无 container）
            // ========================================
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
