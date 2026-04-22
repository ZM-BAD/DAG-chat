import {
  Dag,
  DagNode,
  TabsContainer,
  MessageToTabsMap,
  ConversationPath,
  TabSwitchResult,
  ChildrenTabsContainer,
  ParentTabsContainer,
} from '../types/dag';
import { isChildrenTabsContainer, isParentTabsContainer } from '../types/dag';
import {
  updateContainerActiveTab,
  getContainersByIds,
} from './tabsContainerBuilder';
import { buildPath, buildPathToRoot, mergePaths } from './pathBuilder';

/**
 * ============================================================
 * Tab 切换处理器
 * ============================================================
 */

/**
 * Container 同步指令
 *
 * 用于描述需要同步更新的 container 的 activeTab
 * 当 ParentTabsContainer 切换时，路径中的 ChildrenTabsContainer 也需要同步更新
 */
interface ContainerSyncInstruction {
  containerId: string;
  newActiveTabId: string;
}

/**
 * ParentTabSwitch 的返回结果
 */
interface ParentTabSwitchResult {
  path: ConversationPath;
  syncInstructions: ContainerSyncInstruction[];
}

/**
 * ChildrenTabSwitch 的返回结果
 */
interface ChildrenTabSwitchResult {
  path: ConversationPath;
  syncInstructions: ContainerSyncInstruction[];
}

/**
 * 处理 tab 切换事件
 *
 * 核心逻辑：
 * 1. 判断 container 类型
 * 2. ChildrenTabsContainer：向 leaf 方向重建路径
 * 3. ParentTabsContainer：向 root 方向重建路径，并收集同步指令
 * 4. 统一应用所有状态更新（包括同步的 containers）
 * 5. 返回更新后的 containers 和新路径
 *
 * @param containerId - container ID
 * @param newTabId - 新的 activeTab ID
 * @param containers - 所有 tabs containers
 * @param dag - DAG 对象
 * @param currentTabsMap - 当前的 MessageToTabsMap
 * @param currentPath - 当前路径（可选，用于增量更新）
 * @returns { updatedContainers, updatedTabsMap, newPath }
 */
export function handleTabSwitch(
  containerId: string,
  newTabId: string,
  containers: TabsContainer[],
  dag: Dag,
  currentTabsMap: MessageToTabsMap,
  currentPath?: ConversationPath,
): TabSwitchResult {
  // 查找 container
  const container = containers.find((c) => c.id === containerId);
  if (!container) {
    console.error(
      `[handleTabSwitch] Container not found: ${containerId.substring(0, 8)}`,
    );
    return {
      updatedContainers: containers,
      updatedTabsMap: currentTabsMap,
      newPath: currentPath || [],
    };
  }

  // === 第一步：更新被点击的 container 的 activeTab ===
  let updatedContainers = updateContainerActiveTab(
    containers,
    containerId,
    newTabId,
  );
  // === 第二步：使用原始 tabsMap（tabsMap 存储静态结构关系，不需要重建） ===
  // tabsMap 只记录 "消息属于哪些 container" 的静态关系
  // container 的 activeTab 状态通过 containers 数组获取
  const updatedTabsMap = currentTabsMap;

  // === 第三步：根据 container 类型选择路径构建策略 ===
  let newPath: ConversationPath;
  let syncInstructions: ContainerSyncInstruction[] = [];

  if (isChildrenTabsContainer(container)) {
    // ChildrenTabsContainer：向 leaf 方向重建路径
    const result = handleChildrenTabSwitch(
      container,
      newTabId,
      dag,
      updatedTabsMap,
      updatedContainers,
      currentPath,
    );
    newPath = result.path;
    syncInstructions = result.syncInstructions;
  } else if (isParentTabsContainer(container)) {
    // ParentTabsContainer：向 root 方向重建路径
    const result = handleParentTabSwitch(
      container,
      newTabId,
      dag,
      updatedTabsMap,
      updatedContainers,
      currentPath,
    );
    newPath = result.path;
    syncInstructions = result.syncInstructions;
  } else {
    // 未知类型，使用默认路径构建
    newPath = buildPath(dag, updatedTabsMap, updatedContainers);
  }

  // === 第四步：统一应用同步指令 ===
  // ✅ 修复：只应用同步指令，不重新构建 path
  // 原因：handleParentTabSwitch 和 handleChildrenTabSwitch 手动构建的 path
  // 已经是正确的，与 syncInstructions 保持一致。
  // 如果用 buildPath 重建，可能会因为未同步的 container 导致路径分歧。
  if (syncInstructions.length > 0) {
    for (const instruction of syncInstructions) {
      updatedContainers = updateContainerActiveTab(
        updatedContainers,
        instruction.containerId,
        instruction.newActiveTabId,
      );
    }
  }

  return {
    updatedContainers,
    updatedTabsMap,
    newPath,
  };
}

/**
 * 处理 ChildrenTabsContainer 的 tab 切换（纯函数）
 *
 * 逻辑：
 * 1. 找到 container.assistantMessageId 在 path 中的位置
 * 2. 保留路径前缀 [0, assistantIndex]
 * 3. 从 newTabId（user 节点）开始，向 leaf 方向 DFS 构建后缀
 * 4. 拼接
 * 5. 收集需要同步的 ChildrenTabsContainer 和 ParentTabsContainer 的更新指令
 *
 * @param container - ChildrenTabsContainer
 * @param newTabId - 新的 activeTab ID（user 节点）
 * @param dag - DAG 对象
 * @param tabsMap - MessageToTabsMap（只读，不修改）
 * @param containers - 所有 tabs containers
 * @param currentPath - 当前路径
 * @returns 路径和同步指令
 */
function handleChildrenTabSwitch(
  container: ChildrenTabsContainer,
  newTabId: string,
  dag: Dag,
  tabsMap: MessageToTabsMap,
  containers: TabsContainer[],
  currentPath?: ConversationPath,
): ChildrenTabSwitchResult {
  // 如果没有当前路径，使用默认路径构建
  if (!currentPath || currentPath.length === 0) {
    return {
      path: buildPath(dag, tabsMap, containers),
      syncInstructions: [],
    };
  }

  // ✅ 关键修复：检查 user 节点是否是 MERGE 点
  const userNode = dag.nodes.get(newTabId);
  if (!userNode) {
    return {
      path: buildPath(dag, tabsMap, containers),
      syncInstructions: [],
    };
  }

  // 如果 user 是 MERGE 点（有多个 parents），检查是否需要完整重建路径
  // 对于MERGE点，同一个user可以从不同的assistant到达
  // 如果target assistant不在currentPath中，需要从完全不同的branch切换
  if (userNode.parent_ids.length > 1) {
    const targetParentId = container.assistantMessageId;

    if (!userNode.parent_ids.includes(targetParentId)) {
      console.error(
        `[handleChildrenTabSwitch] Assistant is not a parent of the user!`,
      );
      return {
        path: buildPath(dag, tabsMap, containers),
        syncInstructions: [],
      };
    }

    // 检查target assistant是否在currentPath中
    const assistantInPath = currentPath.find((n) => n.id === targetParentId);

    if (!assistantInPath) {
      // ⚠️ 关键情况：target assistant不在currentPath中
      // 这意味着需要从完全不同的branch切换过来
      // 使用buildPath重新构建完整路径（基于更新后的containers状态）
      const newPath = buildPath(dag, tabsMap, containers);

      // 收集 syncInstructions（使用 Map 防止重复）
      // ✅ 排除被点击的 container：它的 activeTab 已经在 handleTabSwitch 中被正确设置
      const clickedContainerId = container.id;
      const syncInstructionMap = new Map<string, ContainerSyncInstruction>();

      for (const node of newPath) {
        if (node.role === 'user') {
          const containerIds = tabsMap.get(node.id) || [];
          const nodeContainers = getContainersByIds(containerIds, containers);

          const childrenContainer = nodeContainers.find(
            (c) => c.type === 'children',
          );
          // ✅ 跳过被点击的 container
          if (
            childrenContainer &&
            childrenContainer.id !== clickedContainerId
          ) {
            syncInstructionMap.set(childrenContainer.id, {
              containerId: childrenContainer.id,
              newActiveTabId: node.id,
            });
          }

          const parentContainer = nodeContainers.find(
            (c) => c.type === 'parent',
          );
          if (parentContainer && node.parent_ids.length > 1) {
            const nodeIndex = newPath.findIndex((n) => n.id === node.id);
            if (nodeIndex > 0) {
              const prevNode = newPath[nodeIndex - 1];
              if (prevNode.role === 'assistant') {
                syncInstructionMap.set(parentContainer.id, {
                  containerId: parentContainer.id,
                  newActiveTabId: prevNode.id,
                });
              }
            }
          }
        }
      }

      return {
        path: newPath,
        syncInstructions: Array.from(syncInstructionMap.values()),
      };
    }
  }

  // 找到 assistant 节点在 path 中的位置
  const assistantIndex = currentPath.findIndex(
    (n) => n.id === container.assistantMessageId,
  );

  if (assistantIndex === -1) {
    // 如果找不到 assistant 节点，使用默认路径构建
    console.warn(
      `[handleChildrenTabSwitch] Cannot find assistant node position in path: ${container.assistantMessageId.substring(0, 8)}`,
    );
    const fallbackPath = buildPath(dag, tabsMap, containers);
    return {
      path: fallbackPath,
      syncInstructions: [],
    };
  }

  // 保留路径前缀 [0, assistantIndex]（包含 assistant 节点）
  const prefixPath = currentPath.slice(0, assistantIndex + 1);

  // ========================================
  // ChildrenTabsContainer 切换逻辑：向 leaf 方向重建完整路径
  //
  // 核心原则：
  // - ChildrenTabsContainer 的 activeTab 表示"当前选中哪个分支"
  // - 切换分支后，显示从被点击的 user 节点开始的完整对话路径
  // - 这样可以让用户看到完整的分支内容
  //
  // 与 ParentTabsContainer 的区别：
  // - ParentTabsContainer 切换后向 root 方向重建，再向 leaf 方向
  // - ChildrenTabsContainer 切换后只向 leaf 方向构建
  // ========================================
  // ✅ 手动构建路径：从 newTabId (user 节点) 开始向 leaf 方向 DFS
  // 解决 buildPathToLeaf 在处理 user 节点时的架构缺陷：
  // - buildPathToLeaf 只在 assistant 节点检查 ChildrenTabsContainer
  // - 当 startNodeId 是 user 节点（合并点）时，不会检查 ParentTabsContainer
  // - 导致使用 node.children[0] 而不是正确的 activeTab
  //
  // 手动构建逻辑：
  // 1. 从 user 节点开始遍历
  // 2. assistant 节点：检查 ChildrenTabsContainer，使用 activeTab 或 children[0]
  // 3. user 节点：直接使用 children[0]（只有一个 assistant）
  // 4. 防止循环引用
  const suffixPath: DagNode[] = [];
  let currentId: string | undefined = newTabId;

  while (currentId) {
    const node = dag.nodes.get(currentId);
    if (!node) break;

    // 防止循环引用（理论上不应该发生，但作为安全防护）
    if (suffixPath.some((n) => n.id === node.id)) {
      console.warn(
        `[handleChildrenTabSwitch] Detected circular reference, stopping build: ${node.id.substring(0, 8)}`,
      );
      break;
    }

    suffixPath.push(node);

    // 到达叶子节点，停止
    if (node.children.length === 0) break;

    // 根据节点角色决定下一个节点
    if (node.role === 'assistant') {
      // assistant 可能有多个 children（分支），使用 ChildrenTabsContainer 的 activeTab
      const containerIds = tabsMap.get(node.id) || [];
      const childrenContainer = getContainersByIds(
        containerIds,
        containers,
      ).find((c) => c.type === 'children');
      currentId = childrenContainer?.activeTab ?? node.children[0].id;
    } else {
      // user 只有一个 child（assistant）
      currentId = node.children[0].id;
    }
  }

  // 拼接路径
  const fullPath = [...prefixPath, ...suffixPath];

  // === 收集需要同步的 Container 的更新指令 ===
  // 收集 suffixPath 中所有需要同步的 ChildrenTabsContainer 和 ParentTabsContainer

  // ✅ 关键修复：排除被点击的 container，避免覆盖用户的选择
  // 被点击的 container.activeTab 已经在 handleTabSwitch 第107行被正确设置为 newTabId
  const clickedContainerId = container.id;

  // 使用 Map 防止重复（一个 container 只能有一个 activeTab）
  const syncInstructionMap = new Map<string, ContainerSyncInstruction>();

  for (let i = 0; i < suffixPath.length; i++) {
    const node = suffixPath[i];

    if (node.role === 'user') {
      const containerIds = tabsMap.get(node.id) || [];
      const nodeContainers = getContainersByIds(containerIds, containers);
      if (nodeContainers.length > 0) {
        // ----------------------------------------
        // 同步 ChildrenTabsContainer（排除被点击的）
        // ----------------------------------------
        const childrenContainer = nodeContainers.find(
          (c) => c.type === 'children',
        );
        // ✅ 跳过被点击的 container
        if (childrenContainer && childrenContainer.id !== clickedContainerId) {
          syncInstructionMap.set(childrenContainer.id, {
            containerId: childrenContainer.id,
            newActiveTabId: node.id,
          });
        }

        // ----------------------------------------
        // 同步 ParentTabsContainer（合并点）
        // ✅ 修复：无条件同步 parent-container，与 children-container 保持一致
        // 只要路径中包含某个 user 节点（合并点）及其前驱 assistant 节点，
        // 对应的 ParentTabsContainer.activeTab 就应该指向该 assistant 节点
        // ----------------------------------------
        const parentContainer = nodeContainers.find((c) => c.type === 'parent');
        if (parentContainer && node.parent_ids.length > 1) {
          // 找到路径中该 user 节点的前一个 assistant 节点
          const nodeIndexInFullPath = fullPath.findIndex(
            (n) => n.id === node.id,
          );
          if (nodeIndexInFullPath > 0) {
            const prevNode = fullPath[nodeIndexInFullPath - 1];
            if (prevNode.role === 'assistant') {
              syncInstructionMap.set(parentContainer.id, {
                containerId: parentContainer.id,
                newActiveTabId: prevNode.id,
              });
            }
          }
        }
      }
    }
  }

  // 将 Map 转换为数组
  const syncInstructions = Array.from(syncInstructionMap.values());

  return {
    path: fullPath,
    syncInstructions,
  };
}

/**
 * 处理 ParentTabsContainer 的 tab 切换（纯函数）
 *
 * ✅ 简化后的逻辑（移除了多余的 middlePath）：
 * 1. 从 newTabId（assistant 节点）开始，向 root 方向 DFS 构建 prefix
 * 2. 从 userMessageId 继续向 leaf 方向构建 suffix
 * 3. 直接拼接 prefix + suffix（mergePaths 会处理 userMessageId 的去重）
 * 4. 收集需要同步的 ChildrenTabsContainer 和 ParentTabsContainer 的更新指令（不直接修改）
 *
 * 为什么不需要 middlePath？
 * - DAG 结构中，assistant 节点的 children 中必然包含 userMessageId
 * - buildPathToRoot(newTabId) 已经构建了从 root 到 assistant 的完整路径
 * - buildPathToLeaf(userMessageId) 会从 user 开始正确构建到 leaf，考虑容器状态
 * - mergePaths 会正确处理节点去重
 *
 * @param container - ParentTabsContainer
 * @param newTabId - 新的 activeTab ID（assistant 节点）
 * @param dag - DAG 对象
 * @param tabsMap - MessageToTabsMap（只读，不修改）
 * @param containers - 所有 tabs containers
 * @param _currentPath - 当前路径（未使用，保留以保持接口一致性）
 * @returns 路径和同步指令
 */
function handleParentTabSwitch(
  container: ParentTabsContainer,
  newTabId: string,
  dag: Dag,
  tabsMap: MessageToTabsMap,
  containers: TabsContainer[],
  currentPath?: ConversationPath,
): ParentTabSwitchResult {
  // ✅ 关键修复：优先使用 currentPath 构建 prefix
  // 避免使用 buildPathToRoot 在 MERGE 点选择错误分支
  let prefixPath: ConversationPath = [];

  if (currentPath && currentPath.length > 0) {
    // 找到 newTabId（assistant）在 currentPath 中的位置
    const assistantIndex = currentPath.findIndex((n) => n.id === newTabId);

    if (assistantIndex !== -1) {
      // 保留路径到该 assistant（包含）
      prefixPath = currentPath.slice(0, assistantIndex + 1);
    }
  }

  // 如果 currentPath 中没有找到，回退到 buildPathToRoot
  if (prefixPath.length === 0) {
    prefixPath = buildPathToRoot(newTabId, dag, tabsMap, containers);
  }

  // ✅ 第二步：从 userMessageId 向 leaf 方向构建 suffix
  // 使用手动构建路径替代 buildPathToLeaf，避免 user 节点作为起点时的架构缺陷
  const suffixPath: DagNode[] = [];
  let currentId: string | undefined = container.userMessageId;

  while (currentId) {
    const node = dag.nodes.get(currentId);
    if (!node) break;

    // 防止循环引用
    if (suffixPath.some((n) => n.id === node.id)) {
      console.warn(
        `[handleParentTabSwitch] Detected circular reference, stopping build: ${node.id.substring(0, 8)}`,
      );
      break;
    }

    suffixPath.push(node);

    // 到达叶子节点，停止
    if (node.children.length === 0) break;

    // 根据节点角色决定下一个节点
    if (node.role === 'assistant') {
      // assistant 可能有多个 children（分支），使用 ChildrenTabsContainer 的 activeTab
      const containerIds = tabsMap.get(node.id) || [];
      const childrenContainer = getContainersByIds(
        containerIds,
        containers,
      ).find((c) => c.type === 'children');
      currentId = childrenContainer?.activeTab ?? node.children[0].id;
    } else {
      // user 只有一个 child（assistant）
      currentId = node.children[0].id;
    }
  }

  // ✅ 第三步：合并路径（suffixPath 的第一个节点是 userMessageId）
  const fullPath = mergePaths(prefixPath, suffixPath);

  // === 收集需要同步的 Container 的更新指令 ===
  // 遍历新构建的路径，同步所有容器状态

  // ✅ 关键修复：排除被点击的 container，避免覆盖用户的选择
  const clickedContainerId = container.id;

  // 使用 Map 防止重复（一个 container 只能有一个 activeTab）
  const syncInstructionMap = new Map<string, ContainerSyncInstruction>();

  for (let i = 0; i < fullPath.length; i++) {
    const node = fullPath[i];

    if (node.role === 'user') {
      const containerIds = tabsMap.get(node.id) || [];
      const nodeContainers = getContainersByIds(containerIds, containers);
      if (nodeContainers.length > 0) {
        // ----------------------------------------
        // 同步 ChildrenTabsContainer（排除被点击的）
        // ✅ 无条件同步：如果路径中包含某个 user 节点，对应的 ChildrenTabsContainer.activeTab 应该指向它
        // ----------------------------------------
        const childrenContainer = nodeContainers.find(
          (c) => c.type === 'children',
        );
        if (childrenContainer && childrenContainer.id !== clickedContainerId) {
          syncInstructionMap.set(childrenContainer.id, {
            containerId: childrenContainer.id,
            newActiveTabId: node.id,
          });
        }

        // ----------------------------------------
        // 同步 ParentTabsContainer（合并点）
        // ✅ 修复：无条件同步 parent-container，与 children-container 保持一致
        // 只要路径中包含某个 user 节点（合并点）及其前驱 assistant 节点，
        // 对应的 ParentTabsContainer.activeTab 就应该指向该 assistant 节点
        // 注意：被点击的 parent-container 已经在 handleTabSwitch 中被正确设置，
        // 但仍需添加到 syncInstructions 以确保 Path-Container 一致性
        // ----------------------------------------
        const parentContainer = nodeContainers.find((c) => c.type === 'parent');
        if (parentContainer && node.parent_ids.length > 1) {
          // 找到路径中该 user 节点的前一个 assistant 节点
          if (i > 0) {
            const prevNode = fullPath[i - 1];
            if (prevNode.role === 'assistant') {
              syncInstructionMap.set(parentContainer.id, {
                containerId: parentContainer.id,
                newActiveTabId: prevNode.id,
              });
            }
          }
        }
      }
    }
  }

  // 将 Map 转换为数组
  const syncInstructions = Array.from(syncInstructionMap.values());

  return {
    path: fullPath,
    syncInstructions,
  };
}

/**
 * 验证 tab 切换是否有效
 *
 * 检查：
 * 1. containerId 是否存在
 * 2. newTabId 是否属于该 container
 *
 * @param containerId - container ID
 * @param newTabId - 新的 activeTab ID
 * @param containers - 所有 tabs containers
 * @returns 是否有效
 */
export function isValidTabSwitch(
  containerId: string,
  newTabId: string,
  containers: TabsContainer[],
): boolean {
  const container = containers.find((c) => c.id === containerId);

  if (!container) {
    console.warn(`Container ${containerId} not found`);
    return false;
  }

  if (container.type === 'children') {
    // 检查 newTabId 是否在 userMessages 中
    return container.userMessages.some((node) => node.id === newTabId);
  }
  // container.type === 'parent'
  // 检查 newTabId 是否在 assistantMessages 中
  return container.assistantMessages.some((node) => node.id === newTabId);
}

/**
 * 批量更新多个 containers 的 activeTab
 *
 * @param updates - 更新数组 [{ containerId, newTabId }]
 * @param containers - 所有 tabs containers
 * @param dag - DAG 对象
 * @param currentTabsMap - 当前的 MessageToTabsMap
 * @returns { updatedContainers, newPath }
 */
export function handleBatchTabSwitch(
  updates: Array<{ containerId: string; newTabId: string }>,
  containers: TabsContainer[],
  dag: Dag,
  currentTabsMap: MessageToTabsMap,
): TabSwitchResult {
  let updatedContainers = [...containers];

  // 依次应用每个更新
  for (const update of updates) {
    const result = handleTabSwitch(
      update.containerId,
      update.newTabId,
      updatedContainers,
      dag,
      currentTabsMap,
    );
    updatedContainers = result.updatedContainers;
    // 注意：tabsMap 不需要更新，它只存储静态结构关系
  }

  // 重建最终路径（tabsMap 不需要重建）
  const newPath = buildPath(dag, currentTabsMap, updatedContainers);

  return {
    updatedContainers,
    updatedTabsMap: currentTabsMap,
    newPath,
  };
}

/**
 * 预测 tab 切换后的路径（不实际执行切换）
 *
 * 用于 UI 预览，例如 hover 时显示将要切换到的路径
 *
 * @param containerId - container ID
 * @param newTabId - 新的 activeTab ID
 * @param containers - 所有 tabs containers
 * @param dag - DAG 对象
 * @param currentTabsMap - 当前的 MessageToTabsMap
 * @returns 预测的路径，如果切换无效则返回 null
 */
export function predictPathAfterTabSwitch(
  containerId: string,
  newTabId: string,
  containers: TabsContainer[],
  dag: Dag,
  currentTabsMap: MessageToTabsMap,
): ConversationPath | null {
  // 验证切换是否有效
  if (!isValidTabSwitch(containerId, newTabId, containers)) {
    return null;
  }

  // 模拟切换
  const result = handleTabSwitch(
    containerId,
    newTabId,
    containers,
    dag,
    currentTabsMap,
  );

  return result.newPath;
}
