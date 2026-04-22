import { Message } from '../types';
import { DagNode, Dag, DagValidationResult } from '../types/dag';

/**
 * ============================================================
 * DAG 构建器
 * ============================================================
 */

/**
 * 从扁平的消息列表构建 DAG
 *
 * 功能：
 * 1. 创建所有 DagNode 节点
 * 2. 建立 parent_ids 和 children 的双向引用
 * 3. 设置 rootId
 * 4. 验证 DAG 完整性
 *
 * @param messages - 扁平化的消息列表
 * @returns DAG 对象，如果消息列表为空则返回 null
 */
export function buildDag(messages: Message[]): Dag | null {
  if (messages.length === 0) {
    return null;
  }

  const nodes = new Map<string, DagNode>();
  const rootCandidates: string[] = [];

  // === 第一步：创建所有节点（不设置 children）===
  messages.forEach((message) => {
    const dagNode: DagNode = {
      id: message.id,
      content: message.content,
      role: message.role,
      parent_ids: message.parent_ids || [],
      children: [], // 初始化为空数组，稍后填充
      dag: {} as Dag, // 临时值，稍后设置
      model: message.model,
      thinkingContent: message.thinkingContent,
      isThinkingExpanded: message.isThinkingExpanded,
      deepThinkingEnabled: message.deepThinkingEnabled,
      isWaitingForFirstToken: message.isWaitingForFirstToken,
    };

    nodes.set(message.id, dagNode);

    // 收集根节点候选（没有 parent_ids 的节点）
    if (!message.parent_ids || message.parent_ids.length === 0) {
      rootCandidates.push(message.id);
    }
  });

  // === 第二步：确定根节点 ===
  let rootId: string | null = null;

  if (rootCandidates.length === 0) {
    console.warn(
      'Warning: No root node found (no messages without parent_ids)',
    );
  } else if (rootCandidates.length > 1) {
    console.warn(
      `Warning: Multiple root nodes detected (${String(rootCandidates.length)}), using first: ${rootCandidates[0]}`,
    );
    rootId = rootCandidates[0] || null;
  } else {
    rootId = rootCandidates[0] || null;
  }

  // === 第三步：创建 DAG 对象并设置引用 ===
  const dag: Dag = { nodes, rootId };
  nodes.forEach((node) => {
    node.dag = dag; // 设置每个节点的 dag 引用
  });

  // === 第四步：双向绑定：设置 children 引用 ===
  nodes.forEach((node) => {
    node.parent_ids.forEach((parentId) => {
      const parentNode = nodes.get(parentId);
      if (parentNode) {
        // 将当前节点添加到父节点的 children 数组
        parentNode.children.push(node);
      } else {
        console.warn(
          `Warning: Parent node ${parentId} of node ${node.id} does not exist`,
        );
      }
    });
  });

  // === 第五步：验证 DAG 完整性 ===
  const validation = validateDag(dag);
  if (!validation.valid) {
    console.error('DAG validation failed:', validation.errors);
  }

  return dag;
}

/**
 * 验证 DAG 的完整性
 *
 * 检查：
 * 1. 根节点是否存在
 * 2. 所有 parent_ids 引用是否存在
 * 3. 是否有多个根节点
 * 4. 是否有环（DAG 不应该有环）
 * 5. children 和 parent_ids 的双向引用是否一致
 *
 * @param dag - DAG 对象
 * @returns 验证结果
 */
export function validateDag(dag: Dag): DagValidationResult {
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
  const hasCycleResult = hasCycle(dag);
  if (hasCycleResult.hasCycle) {
    errors.push(`DAG 中检测到环: ${hasCycleResult.cyclePath}`);
  }

  // 5. 检查 children 和 parent_ids 的双向引用一致性
  for (const [id, node] of dag.nodes) {
    // 检查：如果节点 A 在节点 B 的 children 中，那么 B 应该在 A 的 parent_ids 中
    for (const childNode of node.children) {
      if (!childNode.parent_ids.includes(id)) {
        errors.push(
          `双向引用不一致：节点 ${id} 的 children 包含 ${childNode.id}，但 ${childNode.id} 的 parent_ids 不包含 ${id}`,
        );
      }
    }

    // 检查：如果节点 B 在节点 A 的 parent_ids 中，那么 A 应该在 B 的 children 中
    for (const parentId of node.parent_ids) {
      const parentNode = dag.nodes.get(parentId);
      if (parentNode) {
        if (!parentNode.children.some((child) => child.id === id)) {
          errors.push(
            `双向引用不一致：节点 ${id} 的 parent_ids 包含 ${parentId}，但 ${parentId} 的 children 不包含 ${id}`,
          );
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
 * 检测 DAG 中是否有环
 *
 * 使用 DFS + 递归栈的方式检测环
 *
 * @param dag - DAG 对象
 * @returns { hasCycle: boolean, cyclePath: string }
 */
export function hasCycle(dag: Dag): {
  hasCycle: boolean;
  cyclePath: string;
} {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  const dfs = (nodeId: string): boolean => {
    if (recursionStack.has(nodeId)) {
      // 找到环，构建环路径
      const cycleStart = path.indexOf(nodeId);
      const _cyclePath = [...path.slice(cycleStart), nodeId].join(' → ');
      return true;
    }

    if (visited.has(nodeId)) {
      return false;
    }

    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const node = dag.nodes.get(nodeId);
    if (node) {
      for (const child of node.children) {
        if (dfs(child.id)) {
          return true;
        }
      }
    }

    path.pop();
    recursionStack.delete(nodeId);
    return false;
  };

  for (const nodeId of dag.nodes.keys()) {
    if (dfs(nodeId)) {
      return {
        hasCycle: true,
        cyclePath: path.join(' → '),
      };
    }
  }

  return {
    hasCycle: false,
    cyclePath: '',
  };
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
 * 获取节点的所有父节点
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
 * 获取节点的所有子节点
 *
 * @param node - DAG 节点
 * @returns 子节点数组
 */
export function getChildren(node: DagNode): DagNode[] {
  return node.children;
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
  const userChildren = node.children.filter((c) => c.role === 'user');
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
 * 将 DagNode 转换为 Message（用于存储或 API 请求）
 *
 * @param node - DAG 节点
 * @returns 消息对象
 */
export function dagNodeToMessage(node: DagNode): Message {
  return {
    id: node.id,
    content: node.content,
    role: node.role,
    parent_ids: node.parent_ids.length > 0 ? node.parent_ids : undefined,
    children: node.children.map((c) => c.id),
    model: node.model,
    thinkingContent: node.thinkingContent,
    isThinkingExpanded: node.isThinkingExpanded,
    deepThinkingEnabled: node.deepThinkingEnabled,
    isWaitingForFirstToken: node.isWaitingForFirstToken,
  };
}

/**
 * 将整个 DAG 扁平化为消息列表
 *
 * @param dag - DAG 对象
 * @returns 扁平化的消息数组
 */
export function flattenDagToMessages(dag: Dag): Message[] {
  const messages: Message[] = [];

  for (const [, node] of dag.nodes) {
    messages.push(dagNodeToMessage(node));
  }

  return messages;
}
