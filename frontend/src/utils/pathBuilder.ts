import {
  Dag,
  DagNode,
  MessageToTabsMap,
  ConversationPath,
  TabsContainer,
} from '../types/dag';
import { isParentTabsContainer } from '../types/dag';
import { getContainersByIds } from './tabsContainerBuilder';

/**
 * ============================================================
 * 路径构建器
 * ============================================================
 */

/**
 * 根据 DAG 和 tabs-container 构建对话路径
 *
 * 核心思路：
 * 1. 从 DAG 的 rootId 开始 DFS 遍历
 * 2. 对于每个节点，查询 MessageToTabsMap 判断是否属于某个 container
 * 3. 如果节点属于 ChildrenTabsContainer，使用 activeTab 选择下一个 user.message
 * 4. 如果节点属于 ParentTabsContainer，根据 activeTab 决定从哪个父节点过来
 * 5. 递归构建到叶子节点的完整路径
 *
 * @param dag - DAG 对象
 * @param tabsMap - MessageToTabsMap
 * @returns 线性化的节点数组（路径）
 */
export function buildPath(
  dag: Dag,
  tabsMap: MessageToTabsMap,
  containers: TabsContainer[],
): ConversationPath {
  if (!dag.rootId) {
    return [];
  }

  const path: DagNode[] = [];
  const visited = new Set<string>();

  // 从根节点开始 DFS 遍历
  const traverse = (nodeId: string): void => {
    if (visited.has(nodeId)) {
      return;
    }

    const node = dag.nodes.get(nodeId);
    if (!node) {
      return;
    }

    visited.add(nodeId);
    path.push(node);

    // ========================================
    // 查找当前节点是否属于某个 container
    // ========================================
    const containerIds = tabsMap.get(nodeId) || [];
    const nodeContainers = getContainersByIds(containerIds, containers);

    if (nodeContainers.length > 0) {
      // 当前节点属于 container，需要根据 activeTab 选择下一个节点

      // 优先检查是否有 children container
      const childrenContainer = nodeContainers.find(
        (c) => c.type === 'children',
      );
      const parentContainer = nodeContainers.find((c) => c.type === 'parent');

      // ----------------------------------------
      // 处理 ChildrenTabsContainer
      // ----------------------------------------
      if (
        childrenContainer &&
        node.id === childrenContainer.assistantMessageId
      ) {
        // 当前节点是 assistant，且属于 ChildrenTabsContainer
        // 根据 activeTab 选择下一个 user.message
        const nextNode = childrenContainer.userMessages.find(
          (n) => n.id === childrenContainer.activeTab,
        );

        if (nextNode) {
          traverse(nextNode.id);
          return; // 只走一条分支
        }
      }

      // ----------------------------------------
      // 处理 ParentTabsContainer
      // ----------------------------------------
      if (parentContainer && node.role === 'user') {
        // 当前节点是 user，且属于 ParentTabsContainer（合并点）
        // 这种情况下，需要根据 activeTab 决定"从哪个父节点过来"
        // 但在路径构建时，我们已经从某个父节点到达了这个 user 节点
        // 所以这里不需要特殊处理，只需要继续向下遍历

        // 继续向下遍历子节点
        if (node.children.length > 0) {
          // 对于 user 节点，通常只有一个子节点（assistant）
          // 如果有多个子节点，取第一个
          traverse(node.children[0].id);
          return;
        }
      }

      // ----------------------------------------
      // 处理属于 ChildrenTabsContainer 的 user 节点
      // （user 节点是 ChildrenTabsContainer.userMessages[] 中的一个，
      //  即用户点击的分支 tab）
      // ----------------------------------------
      if (childrenContainer && node.role === 'user') {
        // 当前节点是 user，且属于某个 ChildrenTabsContainer（作为被选中的 tab）
        // 继续向下遍历它的子节点（assistant 回复）
        if (node.children.length > 0) {
          traverse(node.children[0].id);
          return;
        }
      }

      // ----------------------------------------
      // 兜底：节点在 tabsMap 中但未被上面任何条件处理
      // 例如：assistant 节点仅因为是合并节点的父节点而出现在 ParentTabsContainer 中，
      // 但它本身不是 ChildrenTabsContainer 的 assistant（只有一个子节点）
      // ----------------------------------------
      if (node.children.length > 0) {
        traverse(node.children[0].id);
        return;
      }
    } else {
      // ----------------------------------------
      // 不属于任何 container，正常遍历
      // ----------------------------------------

      if (node.role === 'user') {
        // user.message 的子节点通常是 assistant
        // 取第一个子节点继续遍历
        if (node.children.length > 0) {
          traverse(node.children[0].id);
        }
      } else {
        // assistant.message 的子节点是 user
        // 取第一个子节点继续遍历（只走一条路径）
        if (node.children.length > 0) {
          traverse(node.children[0].id);
        }
      }
    }
  };

  traverse(dag.rootId);

  return path;
}

/**
 * 根据选中的 container 和 activeTab，构建指定路径
 *
 * 这个函数用于在用户点击 tab 后，重新构建路径
 *
 * @param dag - DAG 对象
 * @param tabsMap - MessageToTabsMap
 * @param containers - 所有 tabs containers
 * @returns 线性化的节点数组（路径）
 */
export function buildPathWithContainers(
  dag: Dag,
  tabsMap: MessageToTabsMap,
  containers: TabsContainer[],
): ConversationPath {
  // 这个函数与 buildPath 类似，但明确使用 containers 的状态
  // 实际上 buildPath 已经使用了 tabsMap，而 tabsMap 中的 container 引用
  // 应该与最新的 containers 同步

  // 为了简化，直接调用 buildPath
  // 关键是：tabsMap 中的 container 引用需要保持最新
  return buildPath(dag, tabsMap, containers);
}

/**
 * 获取从根节点到指定节点的路径
 *
 * 使用 BFS 查找最短路径
 *
 * @param dag - DAG 对象
 * @param targetId - 目标节点 ID
 * @returns 路径上的节点数组，如果找不到则返回 null
 */
export function getPathToNode(dag: Dag, targetId: string): DagNode[] | null {
  if (!dag.rootId) {
    return null;
  }

  const rootNode = dag.nodes.get(dag.rootId);
  if (!rootNode) {
    return null;
  }

  // BFS 查找路径
  const queue: Array<{ node: DagNode; path: DagNode[] }> = [
    { node: rootNode, path: [rootNode] },
  ];
  const visited = new Set<string>([rootNode.id]);

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) {
      break;
    }
    const { node, path } = item;

    if (node.id === targetId) {
      return path;
    }

    for (const child of node.children) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        queue.push({ node: child, path: [...path, child] });
      }
    }
  }

  return null;
}

/**
 * 检查路径是否有效（是否连通）
 *
 * @param path - 路径
 * @returns 是否有效
 */
export function isPathValid(path: ConversationPath): boolean {
  if (path.length === 0) {
    return false;
  }

  // 检查路径中相邻节点是否连通
  for (let i = 0; i < path.length - 1; i++) {
    const current = path[i];
    const next = path[i + 1];

    // 检查 next 是否在 current 的 children 中
    if (!current.children.some((child) => child.id === next.id)) {
      return false;
    }

    // 检查 current 是否在 next 的 parent_ids 中
    if (!next.parent_ids.includes(current.id)) {
      return false;
    }
  }

  return true;
}

/**
 * 获取路径的叶子节点（最后一个节点）
 *
 * @param path - 路径
 * @returns 叶子节点，如果路径为空则返回 null
 */
export function getPathLeaf(path: ConversationPath): DagNode | null {
  if (path.length === 0) {
    return null;
  }
  return path[path.length - 1];
}

/**
 * 获取路径的根节点（第一个节点）
 *
 * @param path - 路径
 * @returns 根节点，如果路径为空则返回 null
 */
export function getPathRoot(path: ConversationPath): DagNode | null {
  if (path.length === 0) {
    return null;
  }
  return path[0];
}

/**
 * 检查路径是否包含某个节点
 *
 * @param path - 路径
 * @param nodeId - 节点 ID
 * @returns 是否包含
 */
export function pathContainsNode(
  path: ConversationPath,
  nodeId: string,
): boolean {
  return path.some((node) => node.id === nodeId);
}

/**
 * 获取路径中某个节点的索引
 *
 * @param path - 路径
 * @param nodeId - 节点 ID
 * @returns 索引，如果不存在则返回 -1
 */
export function getNodeIndexInPath(
  path: ConversationPath,
  nodeId: string,
): number {
  return path.findIndex((node) => node.id === nodeId);
}

/**
 * 获取路径中某个节点之后的子路径
 *
 * @param path - 路径
 * @param nodeId - 节点 ID
 * @returns 从该节点之后的子路径（不包含该节点），如果节点不存在则返回空数组
 */
export function getSubPathAfterNode(
  path: ConversationPath,
  nodeId: string,
): ConversationPath {
  const index = getNodeIndexInPath(path, nodeId);
  if (index === -1) {
    return [];
  }
  return path.slice(index + 1);
}

/**
 * 获取路径中某个节点之前的子路径
 *
 * @param path - 路径
 * @param nodeId - 节点 ID
 * @returns 从路径起点到该节点的子路径（包含该节点），如果节点不存在则返回空数组
 */
export function getSubPathBeforeNode(
  path: ConversationPath,
  nodeId: string,
): ConversationPath {
  const index = getNodeIndexInPath(path, nodeId);
  if (index === -1) {
    return [];
  }
  return path.slice(0, index + 1);
}

/**
 * ============================================================
 * 向 Root 方向遍历的路径构建
 * ============================================================
 */

/**
 * 从指定节点向 root 方向 DFS 构建 path
 *
 * 核心逻辑：
 * 1. 从 startNodeId 开始，沿着 parent_ids 向上遍历
 * 2. 遇到 ParentTabsContainer 时，使用 activeTab 选择父节点
 * 3. 遇到 ChildrenTabsContainer 时，正常选择第一个 parent（因为我们在向上遍历）
 * 4. 最终到达 root 节点停止
 *
 * @param startNodeId - 起始节点 ID
 * @param dag - DAG 对象
 * @param tabsMap - MessageToTabsMap
 * @param containers - 所有 tabs containers
 * @returns 从 root 到 startNode 的路径
 */
export function buildPathToRoot(
  startNodeId: string,
  dag: Dag,
  tabsMap: MessageToTabsMap,
  containers: TabsContainer[],
): ConversationPath {
  const path: DagNode[] = [];
  const visited = new Set<string>();

  // 从 startNodeId 开始向上遍历
  const traverseUp = (nodeId: string): void => {
    if (visited.has(nodeId)) {
      return;
    }

    const node = dag.nodes.get(nodeId);
    if (!node) {
      return;
    }

    visited.add(nodeId);
    path.unshift(node); // 添加到头部，保持 root 在前的顺序

    // 如果没有父节点，说明到达 root
    if (node.parent_ids.length === 0) {
      return;
    }

    // 查找当前节点是否属于某个 ParentTabsContainer
    // 注意：只有 user 节点可能是 ParentTabsContainer 的合并点
    const containerIds = tabsMap.get(nodeId) || [];
    const nodeContainers = getContainersByIds(containerIds, containers);
    let nextParentId: string | null = null;

    if (nodeContainers.length > 0) {
      // 查找 ParentTabsContainer
      const parentContainer = nodeContainers.find(isParentTabsContainer);

      if (parentContainer && node.role === 'user') {
        // 当前节点是 user，且属于 ParentTabsContainer（合并点）
        // 使用 activeTab 决定从哪个 assistant 过来

        // ✅ 修复 P1：验证 activeTab 是否有效
        if (node.parent_ids.includes(parentContainer.activeTab)) {
          nextParentId = parentContainer.activeTab;
        } else {
          // Fallback: 使用第一个 parent，但要记录警告
          console.warn(
            `[buildPathToRoot] activeTab ${parentContainer.activeTab.substring(0, 8)} ` +
              `is not in parent_ids of node ${node.id.substring(0, 8)}, ` +
              `fallback to first parent`,
          );
          nextParentId = node.parent_ids[0];
        }
      }
    }

    // 如果没有特殊的容器逻辑，或者不是合并点
    // 取第一个父节点继续向上遍历
    if (!nextParentId) {
      nextParentId = node.parent_ids[0];
    }

    // 递归向上遍历
    traverseUp(nextParentId);
  };

  traverseUp(startNodeId);

  return path;
}

/**
 * 从指定节点向 leaf 方向 DFS 构建 path
 *
 * 这是 buildPath 的简化版本，用于从某个中间节点开始向 leaf 遍历
 *
 * @param startNodeId - 起始节点 ID
 * @param dag - DAG 对象
 * @param tabsMap - MessageToTabsMap
 * @param containers - 所有 tabs containers
 * @returns 从 startNode 到 leaf 的路径
 */
export function buildPathToLeaf(
  startNodeId: string,
  dag: Dag,
  tabsMap: MessageToTabsMap,
  containers: TabsContainer[],
): ConversationPath {
  console.log('[buildPathToLeaf] 开始构建路径');
  const startNode = dag.nodes.get(startNodeId);
  const startNodePreview = startNode
    ? startNode.content.substring(0, 30)
    : '[未知]';
  console.log(
    `   startNodeId: ${startNodeId.substring(0, 8)} - ${startNodePreview}`,
  );

  const path: DagNode[] = [];
  const visited = new Set<string>();

  const traverseDown = (nodeId: string): void => {
    if (visited.has(nodeId)) {
      console.log(
        `[buildPathToLeaf] 检测到循环，停止遍历: ${nodeId.substring(0, 8)}`,
      );
      return;
    }

    const node = dag.nodes.get(nodeId);
    if (!node) {
      console.log(`[buildPathToLeaf] 节点不存在: ${nodeId.substring(0, 8)}`);
      return;
    }

    visited.add(nodeId);
    path.push(node);
    console.log(
      `[buildPathToLeaf] 添加节点到 path: ${node.role} - ${node.content.substring(0, 30)}... (${node.id.substring(0, 8)})`,
    );

    // 如果没有子节点，说明到达 leaf
    if (node.children.length === 0) {
      console.log(`[buildPathToLeaf] 到达叶子节点: ${node.id.substring(0, 8)}`);
      return;
    }

    // 查找当前节点是否属于某个 ChildrenTabsContainer
    const containerIds = tabsMap.get(nodeId) || [];
    const nodeContainers = getContainersByIds(containerIds, containers);
    let nextChildId: string | null = null;

    if (nodeContainers.length > 0) {
      console.log(
        `[buildPathToLeaf] 节点 ${node.id.substring(0, 8)} 属于 ${String(nodeContainers.length)} 个 containers`,
      );

      // 查找 ChildrenTabsContainer - 只处理 assistant 节点
      if (node.role === 'assistant') {
        const childrenContainer = nodeContainers.find(
          (c) => c.type === 'children',
        );

        if (childrenContainer) {
          // 当前节点是 assistant，且属于 ChildrenTabsContainer
          // 使用 container 当前的 activeTab 选择下一个 user.message
          console.log(
            `[buildPathToLeaf] ✅ 找到 ChildrenTabsContainer: ${childrenContainer.id.substring(0, 8)}`,
          );
          console.log(
            `   container.assistantMessageId: ${childrenContainer.assistantMessageId.substring(0, 8)}`,
          );
          console.log(
            `   container.activeTab: ${childrenContainer.activeTab.substring(0, 8)}`,
          );
          const activeTabNode = dag.nodes.get(childrenContainer.activeTab);
          const activeTabNodePreview = activeTabNode
            ? activeTabNode.content.substring(0, 30)
            : '[未知]';
          console.log(`   activeTab 内容: ${activeTabNodePreview}`);

          // ✅ 使用 container 当前的 activeTab
          nextChildId = childrenContainer.activeTab;
          console.log(
            `   ✅ 使用 container.activeTab: ${nextChildId.substring(0, 8)}`,
          );
        } else {
          console.log(
            `[buildPathToLeaf] 节点是 assistant 但没有 ChildrenTabsContainer`,
          );
        }
      } else {
        console.log(
          `[buildPathToLeaf] 节点是 user，跳过 ChildrenTabsContainer 检查`,
        );
      }
    }

    // 如果没有特殊的容器逻辑，取第一个子节点继续向下遍历
    if (!nextChildId) {
      nextChildId = node.children[0].id;
      console.log(
        `[buildPathToLeaf] 使用第一个子节点: ${nextChildId.substring(0, 8)}`,
      );
    }

    // 递归向下遍历
    traverseDown(nextChildId);
  };

  traverseDown(startNodeId);

  console.log(`[buildPathToLeaf] 完成，path 长度: ${String(path.length)}`);

  return path;
}

/**
 * 从起始节点构建到目标节点的路径（向下遍历）
 *
 * 使用 BFS 查找从 startNodeId 到 targetNodeId 的路径
 * 在遍历时，会考虑容器的 activeTab 来选择分支
 *
 * @param startNodeId - 起始节点 ID
 * @param targetNodeId - 目标节点 ID
 * @param dag - DAG 对象
 * @param tabsMap - MessageToTabsMap（可选，用于根据 activeTab 选择分支）
 * @param containers - 所有 tabs containers（可选，用于根据 activeTab 选择分支）
 * @returns 从 startNode 到 targetNode 的路径，如果找不到则返回 null
 */
export function buildPathFromNodeToTarget(
  startNodeId: string,
  targetNodeId: string,
  dag: Dag,
  tabsMap?: MessageToTabsMap,
  containers?: TabsContainer[],
): ConversationPath | null {
  const startNode = dag.nodes.get(startNodeId);
  if (!startNode) {
    return null;
  }

  // BFS 查找路径
  const queue: Array<{ node: DagNode; path: DagNode[] }> = [
    { node: startNode, path: [startNode] },
  ];
  const visited = new Set<string>([startNodeId]);

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) {
      break;
    }
    const { node, path } = item;

    if (node.id === targetNodeId) {
      return path;
    }

    // ========================================
    // 检查是否需要根据 activeTab 选择分支
    // ========================================
    if (tabsMap && containers && node.role === 'assistant') {
      const containerIds = tabsMap.get(node.id) || [];
      const nodeContainers = getContainersByIds(containerIds, containers);
      if (nodeContainers.length > 0) {
        const childrenContainer = nodeContainers.find(
          (c) => c.type === 'children',
        );
        if (childrenContainer) {
          // 当前节点是 assistant，且有 ChildrenTabsContainer
          // 优先遍历 activeTab 指向的子节点
          const activeChild = node.children.find(
            (child) => child.id === childrenContainer.activeTab,
          );

          if (activeChild && !visited.has(activeChild.id)) {
            visited.add(activeChild.id);
            queue.push({ node: activeChild, path: [...path, activeChild] });
          }

          // 然后遍历其他子节点
          for (const child of node.children) {
            if (
              child.id !== childrenContainer.activeTab &&
              !visited.has(child.id)
            ) {
              visited.add(child.id);
              queue.push({ node: child, path: [...path, child] });
            }
          }
          continue; // 跳过默认遍历逻辑
        }
      }
    }

    // 默认遍历逻辑：遍历所有子节点
    for (const child of node.children) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        queue.push({ node: child, path: [...path, child] });
      }
    }
  }

  return null;
}

/**
 * 合并两条路径（去重）
 *
 * @param path1 - 第一条路径
 * @param path2 - 第二条路径
 * @returns 合并后的路径
 */
export function mergePaths(
  path1: ConversationPath,
  path2: ConversationPath,
): ConversationPath {
  if (path1.length === 0) {
    return path2;
  }
  if (path2.length === 0) {
    return path1;
  }

  // 检查 path1 的最后一个节点是否和 path2 的第一个节点相同
  if (path1[path1.length - 1].id === path2[0].id) {
    // 去重：跳过 path2 的第一个节点
    return [...path1, ...path2.slice(1)];
  }

  // 直接拼接
  return [...path1, ...path2];
}

/**
 * ============================================================
 * 路径与容器一致性校验
 * ============================================================
 */

/**
 * 校验结果
 */
export interface PathContainerValidationResult {
  valid: boolean;
  errors: Array<{
    nodeId: string;
    nodeRole: 'user' | 'assistant';
    nodePreview: string;
    containerId: string;
    containerType: 'children' | 'parent';
    expectedActiveTab: string;
    actualActiveTab: string;
    message: string;
  }>;
}

/**
 * 校验路径与容器的 activeTab 是否一致
 *
 * 不变量（Invariant）：
 * - 当路径经过某个 user 节点时，该节点对应的 ChildrenTabsContainer.activeTab 应该指向它
 * - 当路径经过某个 user 节点（合并点）时，对应的 ParentTabsContainer.activeTab 应该指向路径中前一个 assistant 节点
 *
 * @param path - 当前渲染的路径
 * @param tabsMap - MessageToTabsMap
 * @param containers - 所有 tabs containers
 * @param _dag - DAG 对象（保留用于未来扩展）
 * @returns 校验结果
 */
export function validatePathContainerConsistency(
  path: ConversationPath,
  tabsMap: MessageToTabsMap,
  containers: TabsContainer[],
  _dag: Dag,
): PathContainerValidationResult {
  const errors: PathContainerValidationResult['errors'] = [];

  for (let i = 0; i < path.length; i++) {
    const node = path[i];
    const containerIds = tabsMap.get(node.id) || [];
    const nodeContainers = getContainersByIds(containerIds, containers);

    if (nodeContainers.length === 0) {
      continue;
    }

    // ========================================
    // 检查 ChildrenTabsContainer
    // ========================================
    if (node.role === 'user') {
      const childrenContainer = nodeContainers.find(
        (c) => c.type === 'children',
      );
      if (childrenContainer && childrenContainer.activeTab !== node.id) {
        errors.push({
          nodeId: node.id,
          nodeRole: 'user',
          nodePreview: formatNodePreview(node),
          containerId: childrenContainer.id,
          containerType: 'children',
          expectedActiveTab: node.id,
          actualActiveTab: childrenContainer.activeTab,
          message: `ChildrenTabsContainer 的 activeTab 应该指向当前路径中的 user 节点，但实际指向了其他节点`,
        });
      }
    }

    // ========================================
    // 检查 ParentTabsContainer（合并点）
    // ========================================
    if (node.role === 'user' && node.parent_ids.length > 1) {
      const parentContainer = nodeContainers.find((c) => c.type === 'parent');
      if (parentContainer && i > 0) {
        const prevNode = path[i - 1];
        if (
          prevNode.role === 'assistant' &&
          parentContainer.activeTab !== prevNode.id
        ) {
          errors.push({
            nodeId: node.id,
            nodeRole: 'user',
            nodePreview: formatNodePreview(node),
            containerId: parentContainer.id,
            containerType: 'parent',
            expectedActiveTab: prevNode.id,
            actualActiveTab: parentContainer.activeTab,
            message: `ParentTabsContainer 的 activeTab 应该指向路径中该 user 节点的前一个 assistant 节点`,
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 格式化节点预览（截取前 30 个字符）
 */
function formatNodePreview(node: DagNode): string {
  const content = node.content;
  return content.length > 30 ? content.substring(0, 30) + '...' : content;
}

/**
 * 打印校验结果（用于调试）
 */
export function logValidationResult(
  result: PathContainerValidationResult,
): void {
  if (result.valid) {
    console.log('✅ [Validation] 路径与容器一致性校验通过');
  } else {
    console.error(
      `❌ [Validation] 路径与容器一致性校验失败，发现 ${String(result.errors.length)} 个错误:`,
    );
    for (const error of result.errors) {
      console.error(`   - [${error.containerType}] ${error.message}`);
      console.error(`     节点: ${error.nodePreview} (${error.nodeId})`);
      console.error(
        `     期望 activeTab: ${error.expectedActiveTab.substring(0, 8)}...`,
      );
      console.error(
        `     实际 activeTab: ${error.actualActiveTab.substring(0, 8)}...`,
      );
    }
  }
}

/**
 * 比较两个路径是否相等（按节点 ID）
 *
 * @param path1 - 路径 1
 * @param path2 - 路径 2
 * @returns 是否相等
 */
export function arePathsEqual(
  path1: ConversationPath,
  path2: ConversationPath,
): boolean {
  if (path1.length !== path2.length) {
    return false;
  }
  return path1.every((node, i) => node.id === path2[i].id);
}
