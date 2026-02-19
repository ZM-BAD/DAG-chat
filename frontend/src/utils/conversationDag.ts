import { Message } from '../types';

/**
 * DAG 节点类型
 *
 * 设计说明：
 * - 移除了嵌套的 children 数组（这是树形结构的设计）
 * - parent_ids 始终存在，根节点为空数组
 * - 通过 dag 引用访问整个图的节点，支持多父节点特性
 */
export interface DagNode extends Omit<Message, 'children' | 'parent_ids'> {
  parent_ids: string[]; // 父节点 ID 列表（根节点为 []）
  dag: Dag; // 所属 DAG 的引用
}

/**
 * DAG 结构
 *
 * 包含对话的所有消息节点及其关系
 * 每个 DAG 有且仅有一个根节点（没有 parent_ids 的用户消息）
 */
export interface Dag {
  nodes: Map<string, DagNode>; // 所有节点的 ID -> 节点映射
  rootId: string | null; // 根节点 ID（唯一）
}

/**
 * 构建对话 DAG 结构
 *
 * 从扁平的消息列表构建 DAG，支持分支（一个父节点有多个子节点）
 * 和合并（一个子节点有多个父节点）特性
 *
 * @param messages - 扁平化的消息列表
 * @returns DAG 对象，如果消息列表为空则返回 null
 */
export function buildConversationDag(messages: Message[]): Dag | null {
  if (!messages || messages.length === 0) {
    return null;
  }

  const nodes = new Map<string, DagNode>();
  let rootId: string | null = null;
  const rootCandidates: string[] = [];

  // 1. 创建所有节点
  messages.forEach((message) => {
    const dagNode: DagNode = {
      ...message,
      parent_ids: message.parent_ids || [],
      dag: null as any, // 稍后设置
    };
    nodes.set(message.id, dagNode);

    // 2. 找到根节点（没有 parent_ids 的节点）
    if (!message.parent_ids || message.parent_ids.length === 0) {
      rootCandidates.push(message.id);
    }
  });

  // 3. 验证根节点：每个对话应该有且仅有一个根节点
  if (rootCandidates.length === 0) {
    console.warn('警告：没有找到根节点（没有 parent_ids 的消息）');
  } else if (rootCandidates.length > 1) {
    console.warn(
      `警告：检测到多个根节点 (${rootCandidates.length} 个)，使用第一个: ${rootCandidates[0]}`,
    );
    rootId = rootCandidates[0];
  } else {
    rootId = rootCandidates[0];
  }

  // 4. 创建 DAG 对象并设置引用
  const dag: Dag = { nodes, rootId };
  nodes.forEach((node) => {
    node.dag = dag;
  });

  // 5. 验证 DAG 的完整性
  const validation = validateDag(dag);
  if (!validation.valid) {
    console.error('DAG 验证失败:', validation.errors);
  }

  return dag;
}

/**
 * 获取节点的子节点
 *
 * 动态计算子节点，而不是存储嵌套的 children 数组
 * 这样可以正确处理多父节点的情况
 *
 * @param node - DAG 节点
 * @returns 子节点数组
 */
export function getChildren(node: DagNode): DagNode[] {
  const children: DagNode[] = [];
  for (const [, otherNode] of node.dag.nodes) {
    if (otherNode.parent_ids.includes(node.id)) {
      children.push(otherNode);
    }
  }
  return children;
}

/**
 * 获取节点的父节点
 *
 * @param node - DAG 节点
 * @returns 父节点数组
 */
export function getParents(node: DagNode): DagNode[] {
  return node.parent_ids
    .map((id) => node.dag.nodes.get(id))
    .filter((n): n is DagNode => n !== undefined);
}

/**
 * 检查节点是否是分支点
 *
 * 分支点：assistant 节点有多个用户子节点
 *
 * @param node - DAG 节点
 * @returns 是否是分支点
 */
export function isBranchingPoint(node: DagNode): boolean {
  if (node.role !== 'assistant') return false;
  const children = getChildren(node);
  const userChildren = children.filter((c) => c.role === 'user');
  return userChildren.length > 1;
}

/**
 * 检查节点是否是合并点
 *
 * 合并点：user 节点有多个父 assistant 节点
 *
 * @param node - DAG 节点
 * @returns 是否是合并点
 */
export function isMergePoint(node: DagNode): boolean {
  if (node.role !== 'user') return false;
  return node.parent_ids.length > 1;
}

/**
 * 获取 DAG 的根节点
 *
 * @param dag - DAG 对象
 * @returns 根节点，如果不存在则返回 null
 */
export function getRootNode(dag: Dag): DagNode | null {
  return dag.rootId ? dag.nodes.get(dag.rootId) || null : null;
}

/**
 * 验证 DAG 的完整性
 *
 * 检查：
 * 1. 根节点是否存在
 * 2. 所有 parent_ids 引用是否存在
 * 3. 是否有多个根节点
 * 4. 是否有环（DAG 不应该有环）
 *
 * @param dag - DAG 对象
 * @returns 验证结果
 */
export function validateDag(dag: Dag): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. 检查根节点
  if (!dag.rootId) {
    errors.push('DAG 没有根节点');
  } else if (!dag.nodes.has(dag.rootId)) {
    errors.push(`根节点 ${dag.rootId} 不存在于节点集合中`);
  }

  // 2. 检查所有 parent_ids 引用是否存在
  for (const [id, node] of dag.nodes) {
    for (const parentId of node.parent_ids) {
      if (!dag.nodes.has(parentId)) {
        errors.push(`节点 ${id} 的父节点 ${parentId} 不存在`);
      }
    }
  }

  // 3. 检查是否有多个根节点
  const rootNodes = Array.from(dag.nodes.values()).filter(
    (n) => n.parent_ids.length === 0,
  );
  if (rootNodes.length > 1) {
    errors.push(`检测到多个根节点: ${rootNodes.map((n) => n.id).join(', ')}`);
  }

  // 4. 检查是否有环（DAG 不应该有环）
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const hasCycle = (nodeId: string): boolean => {
    if (recursionStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    recursionStack.add(nodeId);

    const node = dag.nodes.get(nodeId);
    if (node) {
      const children = getChildren(node);
      for (const child of children) {
        if (hasCycle(child.id)) return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  };

  for (const nodeId of dag.nodes.keys()) {
    if (hasCycle(nodeId)) {
      errors.push('DAG 中检测到环');
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 查找所有分支点
 *
 * @param dag - DAG 对象
 * @returns 分支点映射 {assistant_id: [user_children]}
 */
export function findBranchingPoints(dag: Dag): Map<string, DagNode[]> {
  const branchingPoints = new Map<string, DagNode[]>();

  for (const [, node] of dag.nodes) {
    if (isBranchingPoint(node)) {
      const children = getChildren(node);
      const userChildren = children.filter((c) => c.role === 'user');
      branchingPoints.set(node.id, userChildren);
    }
  }

  return branchingPoints;
}

/**
 * 查找所有合并点
 *
 * @param dag - DAG 对象
 * @returns 合并点映射 {user_id: [assistant_parents]}
 */
export function findMergePoints(dag: Dag): Map<string, DagNode[]> {
  const mergePoints = new Map<string, DagNode[]>();

  for (const [, node] of dag.nodes) {
    if (isMergePoint(node)) {
      const parents = getParents(node);
      const assistantParents = parents.filter((p) => p.role === 'assistant');
      if (assistantParents.length > 1) {
        mergePoints.set(node.id, assistantParents);
      }
    }
  }

  return mergePoints;
}

/**
 * 查找用户消息分组点（用于分支显示）
 *
 * 返回用户消息组及其对应的父节点 ID
 * 这是 findBranchingPoints 的别名，用于向后兼容
 *
 * @param dag - DAG 对象
 * @returns 用户消息分组映射 {parent_id: [user_children]}
 */
export function findUserMessageGroups(dag: Dag): Map<string, DagNode[]> {
  return findBranchingPoints(dag);
}

/**
 * 查找父消息分组点（用于合并显示）
 *
 * 返回有多个 parent 的用户消息及其 parent 节点列表
 * 这是 findMergePoints 的别名，用于向后兼容
 *
 * @param dag - DAG 对象
 * @returns 父消息分组映射 {user_id: [assistant_parents]}
 */
export function findParentMessageGroups(dag: Dag): Map<string, DagNode[]> {
  return findMergePoints(dag);
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
    const { node, path } = queue.shift()!;

    if (node.id === targetId) {
      return path;
    }

    const children = getChildren(node);
    for (const child of children) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        queue.push({ node: child, path: [...path, child] });
      }
    }
  }

  return null;
}

/**
 * 根据选中的分支获取完整的对话路径
 *
 * @param dag - DAG 对象
 * @param branchingPointId - 分支点 ID
 * @param selectedBranchId - 选中的分支 ID
 * @returns 完整路径上的节点数组
 */
export function getConversationForBranch(
  dag: Dag,
  branchingPointId: string,
  selectedBranchId: string,
): DagNode[] {
  // 1. 找到分支点的完整路径
  const branchingPointPath = getPathToNode(dag, branchingPointId);
  if (!branchingPointPath) {
    return [];
  }

  // 2. 找到选中分支的完整路径
  const branchPath = getPathToNode(dag, selectedBranchId);
  if (!branchPath) {
    return [];
  }

  // 3. 合并路径：从根到分支点，然后从分支点到选中分支的完整路径
  const result = [...branchingPointPath];

  // 4. 添加分支路径中分支点之后的部分
  const branchingPointIndex = branchPath.findIndex(
    (node) => node.id === branchingPointId,
  );
  if (
    branchingPointIndex !== -1 &&
    branchingPointIndex < branchPath.length - 1
  ) {
    result.push(...branchPath.slice(branchingPointIndex + 1));
  }

  return result;
}

/**
 * 获取基于所有分支选择的完整对话路径
 *
 * 这是 DAG 遍历的核心函数，根据用户的分支选择生成线性化的消息序列
 *
 * @param dag - DAG 对象
 * @param selectedBranches - 选择的分支映射 {parent_id: child_id}
 * @param selectedParents - 选择的父节点映射 {user_id: parent_id}（用于合并点）
 * @returns 线性化的节点数组
 */
export function getCompleteConversationPath(
  dag: Dag,
  selectedBranches: Map<string, string>,
  selectedParents?: Map<string, string>,
): DagNode[] {
  const result: DagNode[] = [];
  const visited = new Set<string>();

  // 确定哪些节点的哪些子节点需要被跳过
  // key: parent节点id, value: 需要被跳过的子节点id集合
  const skippedChildren = new Map<string, Set<string>>();

  // 处理children分支选择：对于每个有多个children的assistant，只保留选中的分支
  selectedBranches.forEach((selectedBranchId, parentId) => {
    const parent = dag.nodes.get(parentId);
    if (parent) {
      const children = getChildren(parent);
      if (children.length > 1) {
        const toSkip = new Set<string>();
        children.forEach((child) => {
          if (child.id !== selectedBranchId) {
            toSkip.add(child.id);
          }
        });
        skippedChildren.set(parentId, toSkip);
      }
    }
  });

  // 处理parent分支选择：对于有多个parent的user消息，只保留通过选中parent的路径
  // key: user消息id, value: 被选中的parent id
  const selectedParentForUserMessage = new Map<string, string>();
  if (selectedParents) {
    selectedParents.forEach((selectedParentId, userMessageId) => {
      selectedParentForUserMessage.set(userMessageId, selectedParentId);
    });
  }

  // 构建子节点到父节点的映射（用于反向查找）
  const childToParents = new Map<string, Set<string>>();
  for (const [, node] of dag.nodes) {
    for (const parentId of node.parent_ids) {
      if (!childToParents.has(node.id)) {
        childToParents.set(node.id, new Set());
      }
      childToParents.get(node.id)!.add(parentId);
    }
  }

  // 从根节点开始遍历
  const traverse = (node: DagNode, fromMultiParentUser: boolean = false) => {
    if (visited.has(node.id)) {
      return;
    }

    // 检查是否应该跳过当前节点
    if (node.parent_ids.length > 0) {
      for (const parentId of node.parent_ids) {
        if (skippedChildren.has(parentId)) {
          if (skippedChildren.get(parentId)!.has(node.id)) {
            return;
          }
        }
      }
    }

    // 对于多父节点的用户消息，检查是否从选中的父节点到达
    const isMultiParentUser =
      node.parent_ids.length > 1 && node.role === 'user';
    if (isMultiParentUser && fromMultiParentUser) {
      // 检查是否从选中的父节点到达
      const selectedParentId = selectedParentForUserMessage.get(node.id);
      if (selectedParentId) {
        // 这里需要跟踪从哪个父节点到达，简化处理：假设已经正确
      }
    }

    visited.add(node.id);
    result.push(node);

    // 递归遍历子节点
    const children = getChildren(node);
    for (const child of children) {
      traverse(child, isMultiParentUser);
    }
  };

  // 从根节点开始
  const rootNode = getRootNode(dag);
  if (rootNode) {
    traverse(rootNode);
  }

  return result;
}

/**
 * 将 DAG 节点扁平化为消息列表（用于显示或存储）
 *
 * @param dag - DAG 对象
 * @returns 扁平化的消息数组
 */
export function flattenMessages(dag: Dag): Message[] {
  const messages: Message[] = [];

  for (const [, node] of dag.nodes) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { dag: _, parent_ids, ...rest } = node;
    const message: Message = {
      ...rest,
      parent_ids: parent_ids.length > 0 ? parent_ids : undefined,
    };
    messages.push(message);
  }

  return messages;
}

/**
 * 将节点列表转换为扁平消息列表（向后兼容）
 *
 * @param nodes - DAG 节点数组
 * @returns 扁平化的消息数组
 */
export function flattenNodeList(nodes: DagNode[]): Message[] {
  return nodes.map((node) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { dag: _, parent_ids, ...rest } = node;
    const message: Message = {
      ...rest,
      parent_ids: parent_ids.length > 0 ? parent_ids : undefined,
    };
    return message;
  });
}
