import { Message } from '../types';

// 扩展Message接口，添加children字段用于树形结构
export interface TreeNode extends Message {
  children: TreeNode[];
}

// 构建对话树结构
export function buildConversationTree(messages: Message[]): TreeNode[] {
  // 创建消息映射表
  const messageMap = new Map<string, TreeNode>();

  // 首先将所有消息转换为TreeNode并初始化children
  messages.forEach(message => {
    messageMap.set(message.id, {
      ...message,
      children: []
    });
  });

  // 构建树形结构
  const roots: TreeNode[] = [];
  messageMap.forEach((node, id) => {
    // 如果消息有parent_ids，则将其添加到对应父消息的children中
    if (node.parent_ids && node.parent_ids.length > 0) {
      node.parent_ids.forEach(parentId => {
        const parent = messageMap.get(parentId);
        if (parent) {
          parent.children.push(node);
        }
      });
    } else {
      // 没有parent_ids的消息是根节点
      roots.push(node);
    }
  });

  return roots;
}

// 识别需要分组显示的分支（有相同parent_id的用户消息）
export function findBranchingPoints(tree: TreeNode[]): Map<string, TreeNode[]> {
  const branchingPoints = new Map<string, TreeNode[]>();

  function traverse(nodes: TreeNode[]) {
    nodes.forEach(node => {
      if (node.role === 'assistant' && node.children.length > 1) {
        // 查找该assistant消息下的所有用户消息子节点
        const userChildren = node.children.filter(child => child.role === 'user');
        if (userChildren.length > 1) {
          branchingPoints.set(node.id, userChildren);
        }
      }
      // 递归遍历子节点
      traverse(node.children);
    });
  }

  traverse(tree);
  return branchingPoints;
}

// 识别用户消息分组点（返回用户消息组及其对应的父节点ID）
export function findUserMessageGroups(tree: TreeNode[]): Map<string, TreeNode[]> {
  const userGroups = new Map<string, TreeNode[]>();
  const parentToUserChildren = new Map<string, TreeNode[]>();

  // 首先构建父子关系映射
  function buildParentMap(nodes: TreeNode[]) {
    nodes.forEach(node => {
      if (node.parent_ids && node.parent_ids.length > 0) {
        node.parent_ids.forEach(parentId => {
          if (!parentToUserChildren.has(parentId)) {
            parentToUserChildren.set(parentId, []);
          }
          if (node.role === 'user') {
            parentToUserChildren.get(parentId)!.push(node);
          }
        });
      }
      // 递归处理子节点
      buildParentMap(node.children);
    });
  }

  buildParentMap(tree);

  // 找到有多个用户子消息的父节点
  parentToUserChildren.forEach((userChildren, parentId) => {
    if (userChildren.length > 1) {
      userGroups.set(parentId, userChildren);
    }
  });

  return userGroups;
}

// 获取从根节点到指定节点的路径
export function getPathToNode(tree: TreeNode[], targetId: string): TreeNode[] | null {
  function findPath(nodes: TreeNode[], path: TreeNode[] = []): TreeNode[] | null {
    for (const node of nodes) {
      const newPath = [...path, node];
      if (node.id === targetId) {
        return newPath;
      }
      if (node.children.length > 0) {
        const found = findPath(node.children, newPath);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  return findPath(tree);
}

// 根据选中的分支获取完整的对话路径
export function getConversationForBranch(
  tree: TreeNode[],
  branchingPointId: string,
  selectedBranchId: string
): TreeNode[] {
  // 1. 找到分支点的完整路径
  const branchingPointPath = getPathToNode(tree, branchingPointId);
  if (!branchingPointPath) {
    return [];
  }

  // 2. 找到选中分支的完整路径
  const branchPath = getPathToNode(tree, selectedBranchId);
  if (!branchPath) {
    return [];
  }

  // 3. 合并路径：从根到分支点，然后从分支点到选中分支的完整路径
  const result = [...branchingPointPath];

  // 4. 添加分支路径中分支点之后的部分
  const branchingPointIndex = branchPath.findIndex(node => node.id === branchingPointId);
  if (branchingPointIndex !== -1 && branchingPointIndex < branchPath.length - 1) {
    result.push(...branchPath.slice(branchingPointIndex + 1));
  }

  return result;
}

// 获取基于所有分支选择的完整对话路径
export function getCompleteConversationPath(
  tree: TreeNode[],
  selectedBranches: Map<string, string>
): TreeNode[] {
  if (selectedBranches.size === 0) {
    // 没有分支选择，进行简单的扁平化显示，保持原始顺序
    const result: TreeNode[] = [];

    const simpleFlatten = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        result.push(node);
        // 只在没有分支选择时才添加所有子节点
        if (node.children.length > 0) {
          simpleFlatten(node.children);
        }
      });
    };

    simpleFlatten(tree);
    return result;
  }

  const result: TreeNode[] = [];

  const traverse = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      result.push(node);

      // 如果当前节点是分支点，根据选择继续遍历
      if (selectedBranches.has(node.id)) {
        const selectedBranchId = selectedBranches.get(node.id)!;
        const selectedBranch = node.children.find(child => child.id === selectedBranchId);
        if (selectedBranch) {
          // 递归处理选中的分支
          traverse([selectedBranch]);
          return; // 停止继续遍历其他分支
        }
      }

      // 如果不是分支点或者没有选择，继续遍历所有子节点
      if (!selectedBranches.has(node.id)) {
        traverse(node.children);
      }
    }
  };

  traverse(tree);
  return result;
}

// 获取扁平化的消息列表（用于显示）
export function flattenMessages(tree: TreeNode[]): Message[] {
  const messages: Message[] = [];

  function traverse(nodes: TreeNode[]) {
    nodes.forEach(node => {
      const { children, ...message } = node;
      messages.push(message);
      traverse(node.children);
    });
  }

  traverse(tree);
  return messages;
}