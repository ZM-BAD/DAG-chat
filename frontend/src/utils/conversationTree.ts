import { Message } from '../types';

// 扩展Message接口，添加children字段用于树形结构
export interface TreeNode extends Omit<Message, 'children'> {
  children: TreeNode[];
}

// 构建对话树结构
export function buildConversationTree(messages: Message[]): TreeNode[] {
  // 创建消息映射表
  const messageMap = new Map<string, TreeNode>();

  // 首先将所有消息转换为TreeNode并初始化children
  messages.forEach((message) => {
    messageMap.set(message.id, {
      ...message,
      children: [],
    });
  });

  // 构建树形结构
  const roots: TreeNode[] = [];
  messageMap.forEach((node) => {
    // 如果消息有parent_ids，则将其添加到对应父消息的children中
    if (node.parent_ids && node.parent_ids.length > 0) {
      node.parent_ids.forEach((parentId) => {
        const parent = messageMap.get(parentId);
        if (parent) {
          const exists = parent.children.some((child) => child.id === node.id);
          if (!exists) {
            parent.children.push(node);
          }
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
    nodes.forEach((node) => {
      if (node.role === 'assistant' && node.children.length > 1) {
        // 查找该assistant消息下的所有用户消息子节点
        const userChildren = node.children.filter(
          (child) => child.role === 'user',
        );
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
export function findUserMessageGroups(
  tree: TreeNode[],
): Map<string, TreeNode[]> {
  const userGroups = new Map<string, TreeNode[]>();
  const parentToUserChildren = new Map<string, TreeNode[]>();

  // 首先构建父子关系映射
  function buildParentMap(nodes: TreeNode[]) {
    nodes.forEach((node) => {
      if (node.parent_ids && node.parent_ids.length > 0) {
        node.parent_ids.forEach((parentId) => {
          if (!parentToUserChildren.has(parentId)) {
            parentToUserChildren.set(parentId, []);
          }
          if (node.role === 'user') {
            const existing = parentToUserChildren.get(parentId)!;
            if (!existing.some((child) => child.id === node.id)) {
              existing.push(node);
            }
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

// 识别父消息分组点（返回有多个parent的用户消息及其parent节点列表）
export function findParentMessageGroups(
  tree: TreeNode[],
): Map<string, TreeNode[]> {
  const parentGroups = new Map<string, TreeNode[]>();
  const messageMap = new Map<string, TreeNode>();

  // 首先构建消息映射表
  function buildMessageMap(nodes: TreeNode[]) {
    nodes.forEach((node) => {
      messageMap.set(node.id, node);
      buildMessageMap(node.children);
    });
  }

  buildMessageMap(tree);

  // 查找有多个parent的用户消息
  function traverse(nodes: TreeNode[]) {
    nodes.forEach((node) => {
      if (
        node.role === 'user' &&
        node.parent_ids &&
        node.parent_ids.length > 1
      ) {
        // 找到所有parent节点
        const parents: TreeNode[] = [];
        node.parent_ids.forEach((parentId) => {
          const parent = messageMap.get(parentId);
          if (parent && parent.role === 'assistant') {
            parents.push(parent);
          }
        });
        if (parents.length > 1) {
          parentGroups.set(node.id, parents);
        }
      }
      // 递归处理子节点
      traverse(node.children);
    });
  }

  traverse(tree);
  return parentGroups;
}

// 获取从根节点到指定节点的路径
export function getPathToNode(
  tree: TreeNode[],
  targetId: string,
): TreeNode[] | null {
  function findPath(
    nodes: TreeNode[],
    path: TreeNode[] = [],
  ): TreeNode[] | null {
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
  selectedBranchId: string,
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

// 获取基于所有分支选择的完整对话路径
export function getCompleteConversationPath(
  tree: TreeNode[],
  selectedBranches: Map<string, string>,
  selectedParents?: Map<string, string>,
): TreeNode[] {
  const result: TreeNode[] = [];
  const visited = new Set<string>();

  // 构建消息映射表
  const allNodes = new Map<string, TreeNode>();
  const collectNodes = (nodes: TreeNode[]) => {
    nodes.forEach((node) => {
      allNodes.set(node.id, node);
      collectNodes(node.children);
    });
  };
  collectNodes(tree);

  // 确定哪些节点的哪些子节点需要被跳过
  // key: parent节点id, value: 需要被跳过的子节点id集合
  const skippedChildren = new Map<string, Set<string>>();

  // 处理children分支选择：对于每个有多个children的assistant，只保留选中的分支
  selectedBranches.forEach((selectedBranchId, parentId) => {
    const parent = allNodes.get(parentId);
    if (parent && parent.children.length > 1) {
      const toSkip = new Set<string>();
      parent.children.forEach((child) => {
        if (child.id !== selectedBranchId) {
          toSkip.add(child.id);
        }
      });
      skippedChildren.set(parentId, toSkip);
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

  const childToParents = new Map<string, Set<string>>();
  allNodes.forEach((node) => {
    if (node.parent_ids && node.parent_ids.length > 0) {
      node.parent_ids.forEach((pid) => {
        if (!childToParents.has(node.id)) {
          childToParents.set(node.id, new Set());
        }
        childToParents.get(node.id)!.add(pid);
      });
    }
  });

  const traverse = (
    nodes: TreeNode[],
    parentId?: string,
    _fromMultiParentUser: boolean = false,
  ) => {
    for (const node of nodes) {
      if (visited.has(node.id)) {
        continue;
      }

      if (parentId && skippedChildren.has(parentId)) {
        if (skippedChildren.get(parentId)!.has(node.id)) {
          continue;
        }
      }

      const isMultiParentUser =
        node.role === 'user' && node.parent_ids && node.parent_ids.length > 1;

      visited.add(node.id);
      result.push(node);

      traverse(node.children, node.id, isMultiParentUser);
    }
  };

  traverse(tree);
  return result;
}

// 获取扁平化的消息列表（用于显示）
export function flattenMessages(tree: TreeNode[]): Message[] {
  const messages: Message[] = [];

  function traverse(nodes: TreeNode[]) {
    nodes.forEach((node) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { children, ...message } = node;
      messages.push(message);
      traverse(node.children);
    });
  }

  traverse(tree);
  return messages;
}
