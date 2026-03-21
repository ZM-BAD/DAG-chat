import {
  Dag,
  DagNode,
  TabsContainer,
  ChildrenTabsContainer,
  ParentTabsContainer,
  TabsContainerBuildResult,
  MessageToTabsMap,
} from '../types/dag';

/**
 * ============================================================
 * Tabs Container 构建器
 * ============================================================
 */

/**
 * 从 DAG 构建 tabs-container 和 map
 *
 * 功能：
 * 1. 扫描 DAG，识别所有分支点（assistant 有多个 user 子节点）
 * 2. 为每个分支点创建 ChildrenTabsContainer
 * 3. 识别所有合并点（user 有多个 assistant 父节点）
 * 4. 为每个合并点创建 ParentTabsContainer
 * 5. 构建 MessageToTabsMap（只存储 container ID，不存储对象引用）
 * 6. 默认选中每个 container 的第一个 tab
 *
 * @param dag - DAG 对象
 * @returns { containers: TabsContainer[], map: MessageToTabsMap }
 */
export function buildTabsContainers(dag: Dag): TabsContainerBuildResult {
  const containers: TabsContainer[] = [];
  const map: MessageToTabsMap = new Map();

  if (!dag.rootId) {
    return { containers, map };
  }

  // 扫描所有节点，识别分支点和合并点
  for (const [, node] of dag.nodes) {
    // ========================================
    // 构建 ChildrenTabsContainer
    // ========================================
    if (node.role === 'assistant' && node.children.length > 1) {
      // 找出该 assistant 的所有 user 子节点
      const userChildren = node.children.filter((c) => c.role === 'user');

      // 只有当有多个 user 子节点时，才创建 container
      if (userChildren.length > 1) {
        const container: ChildrenTabsContainer = {
          id: `children-${node.id}`,
          type: 'children',
          assistantMessageId: node.id,
          userMessages: userChildren, // 保存 DagNode 引用
          activeTab: userChildren[0].id, // 默认选中第一个
        };

        containers.push(container);

        // ✅ 修改：只存储 container ID，而不是对象引用
        const containerId = container.id;

        // 更新 map: 每个 user.message 都关联到这个 container ID
        userChildren.forEach((userNode) => {
          if (!map.has(userNode.id)) {
            map.set(userNode.id, []);
          }
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          map.get(userNode.id)!.push(containerId);
        });

        // assistant.message 本身也关联到这个 container ID
        if (!map.has(node.id)) {
          map.set(node.id, []);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        map.get(node.id)!.push(containerId);
      }
    }

    // ========================================
    // 构建 ParentTabsContainer
    // ========================================
    if (node.role === 'user' && node.parent_ids.length > 1) {
      // 找出该 user 的所有 assistant 父节点
      const assistantParents = node.parent_ids
        .map((id) => node.dag.nodes.get(id))
        .filter((n): n is DagNode => n !== undefined && n.role === 'assistant');

      // 只有当有多个 assistant 父节点时，才创建 container
      if (assistantParents.length > 1) {
        const container: ParentTabsContainer = {
          id: `parent-${node.id}`,
          type: 'parent',
          userMessageId: node.id,
          assistantMessages: assistantParents, // 保存 DagNode 引用
          activeTab: assistantParents[0].id, // 默认选中第一个
        };

        containers.push(container);

        // ✅ 修改：只存储 container ID，而不是对象引用
        const containerId = container.id;

        // 更新 map: 每个 assistant.message 都关联到这个 container ID
        assistantParents.forEach((assistantNode) => {
          if (!map.has(assistantNode.id)) {
            map.set(assistantNode.id, []);
          }
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          map.get(assistantNode.id)!.push(containerId);
        });

        // user.message 本身也关联到这个 container ID
        if (!map.has(node.id)) {
          map.set(node.id, []);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        map.get(node.id)!.push(containerId);
      }
    }
  }

  return { containers, map };
}

/**
 * 更新 container 的 activeTab
 *
 * @param containers - 所有 containers
 * @param containerId - 要更新的 container ID
 * @param newTabId - 新的 activeTab ID
 * @returns 更新后的 containers
 */
export function updateContainerActiveTab(
  containers: TabsContainer[],
  containerId: string,
  newTabId: string,
): TabsContainer[] {
  return containers.map((container) => {
    if (container.id === containerId) {
      return {
        ...container,
        activeTab: newTabId,
      };
    }
    return container;
  });
}

/**
 * 根据 container IDs 查找对应的 container 对象
 *
 * **设计理念**：tabsMap 只存储 ID，需要时从 containers 数组中查找对象
 *
 * @param containerIds - container ID 数组
 * @param containers - 所有 containers 数组
 * @returns 找到的 container 对象数组
 */
export function getContainersByIds(
  containerIds: string[],
  containers: TabsContainer[],
): TabsContainer[] {
  return containerIds
    .map((id) => containers.find((c) => c.id === id))
    .filter((c): c is TabsContainer => c !== undefined);
}

/**
 * 查找某个消息所属的所有 containers（通过 ID 查找对象）
 *
 * @param messageId - 消息 ID
 * @param containerIds - 该消息关联的 container ID 数组
 * @param containers - 所有 containers 数组
 * @returns 该消息所属的 containers 数组（可能为空）
 */
export function getContainersForMessage(
  messageId: string,
  containerIds: string[],
  containers: TabsContainer[],
): TabsContainer[] {
  return getContainersByIds(containerIds, containers);
}

/**
 * 查找某个消息所属的第一个指定类型的 container
 *
 * @param messageId - 消息 ID
 * @param containerIds - 该消息关联的 container ID 数组
 * @param containers - 所有 containers 数组
 * @param type - container 类型 ('children' | 'parent')
 * @returns 找到的 container，如果没有则返回 null
 */
export function getContainerForMessageByType(
  messageId: string,
  containerIds: string[],
  containers: TabsContainer[],
  type: 'children' | 'parent',
): TabsContainer | null {
  const matchingContainers = getContainersByIds(containerIds, containers);
  return matchingContainers.find((c) => c.type === type) || null;
}

/**
 * 检查某个消息是否属于某个 container
 *
 * @param messageId - 消息 ID
 * @param containerIds - 该消息关联的 container ID 数组
 * @param containerId - 要检查的 container ID
 * @returns 是否属于
 */
export function isMessageInContainer(
  messageId: string,
  containerIds: string[],
  containerId: string,
): boolean {
  return containerIds.includes(containerId);
}

/**
 * 获取所有 ChildrenTabsContainer
 *
 * @param containers - 所有 containers
 * @returns ChildrenTabsContainer 数组
 */
export function getAllChildrenContainers(
  containers: TabsContainer[],
): ChildrenTabsContainer[] {
  return containers.filter(
    (c): c is ChildrenTabsContainer => c.type === 'children',
  );
}

/**
 * 获取所有 ParentTabsContainer
 *
 * @param containers - 所有 containers
 * @returns ParentTabsContainer 数组
 */
export function getAllParentContainers(
  containers: TabsContainer[],
): ParentTabsContainer[] {
  return containers.filter(
    (c): c is ParentTabsContainer => c.type === 'parent',
  );
}

/**
 * 根据 container ID 查找 container
 *
 * @param containers - 所有 containers
 * @param containerId - container ID
 * @returns 找到的 container，如果没有则返回 null
 */
export function getContainerById(
  containers: TabsContainer[],
  containerId: string,
): TabsContainer | null {
  return containers.find((c) => c.id === containerId) || null;
}
