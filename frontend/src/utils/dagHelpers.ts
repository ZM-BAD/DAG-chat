import { Dag, DagNode, TabsContainer, MessageToTabsMap } from '../types/dag';

/**
 * ============================================================
 * DAG 辅助工具函数
 * ============================================================
 */

/**
 * 获取 DAG 中所有的分支点
 *
 * @param dag - DAG 对象
 * @returns 分支点数组
 */
export function getAllBranchingPoints(dag: Dag): DagNode[] {
  const branchingPoints: DagNode[] = [];

  for (const [, node] of dag.nodes) {
    if (node.role === 'assistant' && node.children.length > 1) {
      const userChildren = node.children.filter((c) => c.role === 'user');
      if (userChildren.length > 1) {
        branchingPoints.push(node);
      }
    }
  }

  return branchingPoints;
}

/**
 * 获取 DAG 中所有的合并点
 *
 * @param dag - DAG 对象
 * @returns 合并点数组
 */
export function getAllMergePoints(dag: Dag): DagNode[] {
  const mergePoints: DagNode[] = [];

  for (const [, node] of dag.nodes) {
    if (node.role === 'user' && node.parent_ids.length > 1) {
      mergePoints.push(node);
    }
  }

  return mergePoints;
}

/**
 * 获取 DAG 中所有的叶子节点
 *
 * @param dag - DAG 对象
 * @returns 叶子节点数组
 */
export function getAllLeafNodes(dag: Dag): DagNode[] {
  const leafNodes: DagNode[] = [];

  for (const [, node] of dag.nodes) {
    if (node.children.length === 0) {
      leafNodes.push(node);
    }
  }

  return leafNodes;
}

/**
 * 获取 DAG 的统计信息
 *
 * @param dag - DAG 对象
 * @returns 统计信息
 */
export function getDagStats(dag: Dag): {
  totalNodes: number;
  userMessages: number;
  assistantMessages: number;
  branchingPoints: number;
  mergePoints: number;
  leafNodes: number;
  maxDepth: number;
} {
  let userMessages = 0;
  let assistantMessages = 0;
  let maxDepth = 0;

  for (const [, node] of dag.nodes) {
    if (node.role === 'user') {
      userMessages++;
    } else {
      assistantMessages++;
    }
  }

  const branchingPoints = getAllBranchingPoints(dag).length;
  const mergePoints = getAllMergePoints(dag).length;
  const leafNodes = getAllLeafNodes(dag).length;

  // 计算最大深度
  maxDepth = calculateMaxDepth(dag);

  return {
    totalNodes: dag.nodes.size,
    userMessages,
    assistantMessages,
    branchingPoints,
    mergePoints,
    leafNodes,
    maxDepth,
  };
}

/**
 * 计算 DAG 的最大深度
 *
 * @param dag - DAG 对象
 * @returns 最大深度
 */
export function calculateMaxDepth(dag: Dag): number {
  if (!dag.rootId) {
    return 0;
  }

  const rootNode = dag.nodes.get(dag.rootId);
  if (!rootNode) {
    return 0;
  }

  const dfs = (node: DagNode, depth: number): number => {
    if (node.children.length === 0) {
      return depth;
    }

    let maxChildDepth = depth;
    for (const child of node.children) {
      const childDepth = dfs(child, depth + 1);
      maxChildDepth = Math.max(maxChildDepth, childDepth);
    }

    return maxChildDepth;
  };

  return dfs(rootNode, 1);
}

/**
 * 获取某个节点的深度
 *
 * @param node - DAG 节点
 * @returns 深度（根节点深度为1）
 */
export function getNodeDepth(node: DagNode): number {
  const path: DagNode[] = [];
  const visited = new Set<string>();

  const dfs = (currentNode: DagNode): boolean => {
    if (currentNode.id === node.id) {
      path.push(currentNode);
      return true;
    }

    visited.add(currentNode.id);
    path.push(currentNode);

    for (const child of currentNode.children) {
      if (!visited.has(child.id)) {
        if (dfs(child)) {
          return true;
        }
      }
    }

    path.pop();
    return false;
  };

  const rootNode = node.dag.nodes.get(node.dag.rootId || '');
  if (rootNode) {
    dfs(rootNode);
  }

  return path.length;
}

/**
 * 检查两个节点之间是否有路径
 *
 * @param from - 起始节点
 * @param to - 目标节点
 * @returns 是否有路径
 */
export function hasPathBetween(from: DagNode, to: DagNode): boolean {
  const visited = new Set<string>();

  const dfs = (node: DagNode): boolean => {
    if (node.id === to.id) {
      return true;
    }

    visited.add(node.id);

    for (const child of node.children) {
      if (!visited.has(child.id)) {
        if (dfs(child)) {
          return true;
        }
      }
    }

    return false;
  };

  return dfs(from);
}

/**
 * 获取两个节点之间的最短路径
 *
 * @param dag - DAG 对象
 * @param fromId - 起始节点 ID
 * @param toId - 目标节点 ID
 * @returns 路径数组，如果不存在则返回 null
 */
export function getShortestPathBetween(
  dag: Dag,
  fromId: string,
  toId: string,
): DagNode[] | null {
  const fromNode = dag.nodes.get(fromId);
  const toNode = dag.nodes.get(toId);

  if (!fromNode || !toNode) {
    return null;
  }

  // BFS 查找最短路径
  const queue: Array<{ node: DagNode; path: DagNode[] }> = [
    { node: fromNode, path: [fromNode] },
  ];
  const visited = new Set<string>([fromId]);

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) {
      break;
    }
    const { node, path } = item;

    if (node.id === toId) {
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
 * 克隆 DAG（深拷贝）
 *
 * @param dag - DAG 对象
 * @returns 新的 DAG 对象
 */
export function cloneDag(dag: Dag): Dag {
  const newNodes = new Map<string, DagNode>();

  // 先复制所有节点（不设置 children 和 dag 引用）
  for (const [id, node] of dag.nodes) {
    const newNode: DagNode = {
      ...node,
      parent_ids: [...node.parent_ids], // 复制数组
      children: [], // 稍后填充
      dag: {} as Dag, // 稍后设置
    };
    newNodes.set(id, newNode);
  }

  // 创建新的 DAG 对象
  const newDag: Dag = {
    nodes: newNodes,
    rootId: dag.rootId,
  };

  // 设置每个节点的 dag 引用和 children
  for (const [id, node] of newNodes) {
    node.dag = newDag;

    // 设置 children 引用
    const oldNode = dag.nodes.get(id);
    if (oldNode) {
      for (const oldChild of oldNode.children) {
        const newChild = newNodes.get(oldChild.id);
        if (newChild) {
          node.children.push(newChild);
        }
      }
    }
  }

  return newDag;
}

/**
 * 打印 DAG 结构（用于调试）
 *
 * @param dag - DAG 对象
 * @returns 字符串表示
 */
export function printDagStructure(dag: Dag): string {
  const lines: string[] = [];

  lines.push('=== DAG Structure ===');
  lines.push(`Root: ${dag.rootId || 'none'}`);
  lines.push(`Total Nodes: ${String(dag.nodes.size)}`);
  lines.push('');

  const printNode = (node: DagNode, indent: number = 0): void => {
    const prefix = '  '.repeat(indent);
    const role = node.role === 'user' ? 'U' : 'A';
    const content =
      node.content.length > 20
        ? node.content.substring(0, 20) + '...'
        : node.content;

    lines.push(`${prefix}[${role}] ${node.id}: ${content}`);

    for (const child of node.children) {
      printNode(child, indent + 1);
    }
  };

  if (dag.rootId) {
    const rootNode = dag.nodes.get(dag.rootId);
    if (rootNode) {
      printNode(rootNode);
    }
  }

  return lines.join('\n');
}

/**
 * 验证 MessageToTabsMap 的一致性
 *
 * @param map - MessageToTabsMap
 * @param containers - 所有 tabs containers
 * @returns 是否一致
 */
export function validateTabsMap(
  map: MessageToTabsMap,
  containers: TabsContainer[],
): boolean {
  // 检查 1: 每个 container 中的所有消息都应该在 map 中
  for (const container of containers) {
    const messagesInContainer =
      container.type === 'children'
        ? [
            container.assistantMessageId,
            ...container.userMessages.map((n) => n.id),
          ]
        : [
            container.userMessageId,
            ...container.assistantMessages.map((n) => n.id),
          ];

    for (const messageId of messagesInContainer) {
      const containerIdsForMessage = map.get(messageId);
      if (
        !containerIdsForMessage ||
        !containerIdsForMessage.includes(container.id)
      ) {
        console.error(
          `Map 不一致: 消息 ${messageId} 应该属于 container ${container.id}`,
        );
        return false;
      }
    }
  }

  // 检查 2: map 中的每个引用都应该对应有效的 container
  for (const [messageId, containerIds] of map) {
    for (const containerId of containerIds) {
      const validContainer = containers.find((c) => c.id === containerId);
      if (!validContainer) {
        console.error(
          `Map 不一致: 消息 ${messageId} 引用了无效的 container ${containerId}`,
        );
        return false;
      }
    }
  }

  return true;
}
