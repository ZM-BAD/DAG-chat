/**
 * 增量更新 DAG 相关函数
 *
 * 用于在流式响应过程中动态更新 DAG 结构，
 * 支持普通提问、分支提问、合并提问三种场景
 */

import {
  Dag,
  DagNode,
  TabsContainer,
  MessageToTabsMap,
  ConversationPath,
  Message,
  ChildrenTabsContainer,
  ParentTabsContainer,
} from '../types';
import { buildDag } from './dagBuilder';
import { buildTabsContainers } from './tabsContainerBuilder';
import { buildPath, buildPathToRoot } from './pathBuilder';

// ========================================
// 类型定义
// ========================================

/**
 * 提问类型
 */
export type QuestionType = 'normal' | 'branch' | 'merge';

/**
 * 增量更新结果
 */
export interface IncrementalUpdateResult {
  success: boolean;
  dag: Dag | null;
  containers: TabsContainer[];
  tabsMap: MessageToTabsMap;
  path: ConversationPath;
  error?: string;
}

/**
 * 新消息信息(用于增量更新)
 */
export interface NewMessageInfo {
  userMessage: Message;
  assistantMessage: Message;
  questionType: QuestionType;
}

// ========================================
// 核心函数
// ========================================

/**
 * 增量更新 DAG
 *
 * @param prevDag - 之前的 DAG
 * @param prevContainers - 之前的 containers
 * @param prevTabsMap - 之前的 tabsMap
 * @param prevPath - 之前的 path
 * @param newMessages - 新增的消息 (user + assistant)
 * @param questionType - 提问类型
 * @returns 增量更新结果
 */
export function incrementallyUpdateDag(
  prevDag: Dag | null,
  prevContainers: TabsContainer[],
  prevTabsMap: MessageToTabsMap,
  prevPath: ConversationPath,
  newMessages: Message[],
  questionType: QuestionType,
): IncrementalUpdateResult {
  try {
    // 验证输入
    if (!prevDag || prevPath.length === 0) {
      console.warn(
        '[incrementallyUpdateDag] No previous DAG or path, falling back to full rebuild',
      );
      return fullRebuild(newMessages);
    }

    if (newMessages.length < 2) {
      console.warn(
        '[incrementallyUpdateDag] newMessages should contain at least user and assistant messages',
      );
      return fullRebuild(newMessages);
    }

    const userMessage = newMessages.find((m) => m.role === 'user');
    const assistantMessage = newMessages.find((m) => m.role === 'assistant');
    if (!userMessage || !assistantMessage) {
      console.warn(
        '[incrementallyUpdateDag] Cannot find user or assistant message',
      );
      return fullRebuild(newMessages);
    }
    // 根据提问类型选择不同的处理策略
    switch (questionType) {
      case 'normal':
        return handleNormalQuestion(
          prevDag,
          prevContainers,
          prevTabsMap,
          prevPath,
          userMessage,
          assistantMessage,
        );
      case 'branch':
        return handleBranchQuestion(
          prevDag,
          prevContainers,
          prevTabsMap,
          prevPath,
          userMessage,
          assistantMessage,
        );
      case 'merge':
        return handleMergeQuestion(
          prevDag,
          prevContainers,
          prevTabsMap,
          prevPath,
          userMessage,
          assistantMessage,
        );
      default: {
        // TypeScript exhaustive check
        const _exhaustiveCheck: never = questionType;
        console.warn(
          `[incrementallyUpdateDag] Unknown question type: ${String(_exhaustiveCheck)}`,
        );
        return fullRebuild(newMessages);
      }
    }
  } catch (error) {
    console.error('[incrementallyUpdateDag] Incremental update error:', error);
    return fullRebuild(newMessages);
  }
}

// ========================================
// 场景处理函数
// ========================================

/**
 * 处理普通提问
 *
 * 特点：
 * - 只有一个父节点（最后一条 assistant 消息)
 * - 追加到当前路径末尾
 * - 可能需要创建新的 ChildrenTabsContainer（如果之前只有1个child，现在有2个)
 */
function handleNormalQuestion(
  prevDag: Dag,
  prevContainers: TabsContainer[],
  prevTabsMap: MessageToTabsMap,
  prevPath: ConversationPath,
  userMessage: Message,
  assistantMessage: Message,
): IncrementalUpdateResult {
  try {
    // 1. 找到当前路径的最后一个 assistant 节点
    const lastAssistant = prevPath[prevPath.length - 1];
    // 注意：prevPath.length 已在 incrementallyUpdateDag 中验证非空
    if (lastAssistant.role !== 'assistant') {
      console.warn('[handleNormalQuestion] Last node is not assistant');
      return fullRebuild([
        ...getMessagesFromDag(prevDag),
        userMessage,
        assistantMessage,
      ]);
    }

    // 2. 添加新节点到 DAG
    const { newDag, newUserNode, newAssistantNode } = addNodesToDag(
      prevDag,
      userMessage,
      assistantMessage,
    );
    // 3. 更新父节点的 children 引用
    lastAssistant.children.push(newUserNode);
    newUserNode.parent_ids = [lastAssistant.id];
    // 4. 更新 user 消息模型的 children 引用
    newUserNode.children.push(newAssistantNode);
    newAssistantNode.parent_ids = [newUserNode.id];
    // 5. 处理 ChildrenTabsContainer
    let newContainers = [...prevContainers];
    const newTabsMap = new Map(prevTabsMap);
    // 检查是否已存在 ChildrenTabsContainer
    const existingContainer = prevContainers.find(
      (c) => c.type === 'children' && c.assistantMessageId === lastAssistant.id,
    ) as ChildrenTabsContainer | null;
    if (lastAssistant.children.length === 2 && !existingContainer) {
      // 之前只有一个 child, 现在有两个, 需要创建新的 container
      const newContainer: ChildrenTabsContainer = {
        id: `children-${lastAssistant.id}`,
        type: 'children',
        assistantMessageId: lastAssistant.id,
        userMessages: [...lastAssistant.children], // 包含原有的和新添加的
        activeTab: newUserNode.id, // 默认选中新的
      };
      newContainers.push(newContainer);
      // 更新 tabsMap
      newContainer.userMessages.forEach((userNode) => {
        if (!newTabsMap.has(userNode.id)) {
          newTabsMap.set(userNode.id, []);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        newTabsMap.get(userNode.id)!.push(newContainer.id);
      });
      if (!newTabsMap.has(lastAssistant.id)) {
        newTabsMap.set(lastAssistant.id, []);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      newTabsMap.get(lastAssistant.id)!.push(newContainer.id);
    } else if (existingContainer) {
      // 已经存在 container, 更新 userMessages 和 activeTab
      const updatedContainer: ChildrenTabsContainer = {
        ...existingContainer,
        userMessages: [...existingContainer.userMessages, newUserNode],
        activeTab: newUserNode.id,
      };
      newContainers = newContainers.map((c) =>
        c.id === updatedContainer.id ? updatedContainer : c,
      );
    }
    // 6. 扩展路径
    const newPath: ConversationPath = [
      ...prevPath,
      newUserNode,
      newAssistantNode,
    ];
    return {
      success: true,
      dag: newDag,
      containers: newContainers,
      tabsMap: newTabsMap,
      path: newPath,
    };
  } catch (error) {
    console.error('[handleNormalQuestion] Processing error:', error);
    return fullRebuild([
      ...getMessagesFromDag(prevDag),
      userMessage,
      assistantMessage,
    ]);
  }
}
/**
 * 处理分支提问
 *
 * 特点：
 * - 引用单个 assistant 消息
 * - 该 assistant 必然有其他 child (否则不符合分支定义)
 * - 创建新的分支
 */
function handleBranchQuestion(
  prevDag: Dag,
  prevContainers: TabsContainer[],
  prevTabsMap: MessageToTabsMap,
  prevPath: ConversationPath,
  userMessage: Message,
  assistantMessage: Message,
): IncrementalUpdateResult {
  try {
    // 1. 获取被引用的 assistant 节点
    const parentAssistantId = userMessage.parent_ids?.[0];
    if (!parentAssistantId) {
      console.warn('[handleBranchQuestion] No parent node ID');
      return fullRebuild([
        ...getMessagesFromDag(prevDag),
        userMessage,
        assistantMessage,
      ]);
    }
    const parentAssistant = prevDag.nodes.get(parentAssistantId);
    if (!parentAssistant) {
      console.warn('[handleBranchQuestion] Cannot find parent assistant node');
      return fullRebuild([
        ...getMessagesFromDag(prevDag),
        userMessage,
        assistantMessage,
      ]);
    }
    // 2. 检查该 assistant 是否有其他 child
    const existingUserChildren = parentAssistant.children.filter(
      (c) => c.role === 'user',
    );
    if (existingUserChildren.length === 0) {
      console.warn(
        '[handleBranchQuestion] This assistant has no other user children, does not match branch definition',
      );
      return fullRebuild([
        ...getMessagesFromDag(prevDag),
        userMessage,
        assistantMessage,
      ]);
    }
    // 3. 添加新节点到 DAG
    const { newDag, newUserNode, newAssistantNode } = addNodesToDag(
      prevDag,
      userMessage,
      assistantMessage,
    );
    // 4. 更新父节点的 children 引用
    parentAssistant.children.push(newUserNode);
    newUserNode.parent_ids = [parentAssistantId];
    // 5. 更新 user 消息的 children 引用
    newUserNode.children.push(newAssistantNode);
    newAssistantNode.parent_ids = [newUserNode.id];
    // 6. 处理 ChildrenTabsContainer
    let newContainers = [...prevContainers];
    const newTabsMap = new Map(prevTabsMap);
    // 检查是否已存在 ChildrenTabsContainer
    const existingContainer = prevContainers.find(
      (c) =>
        c.type === 'children' && c.assistantMessageId === parentAssistantId,
    ) as ChildrenTabsContainer | null;
    if (existingUserChildren.length === 1 && !existingContainer) {
      // 之前只有一个 child, 现在有两个, 需要创建新的 container
      const newContainer: ChildrenTabsContainer = {
        id: `children-${parentAssistant.id}`,
        type: 'children',
        assistantMessageId: parentAssistantId,
        userMessages: [...existingUserChildren, newUserNode],
        activeTab: newUserNode.id,
      };
      newContainers.push(newContainer);
      // 更新 tabsMap
      newContainer.userMessages.forEach((userNode) => {
        if (!newTabsMap.has(userNode.id)) {
          newTabsMap.set(userNode.id, []);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        newTabsMap.get(userNode.id)!.push(newContainer.id);
      });
      if (!newTabsMap.has(parentAssistant.id)) {
        newTabsMap.set(parentAssistant.id, []);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      newTabsMap.get(parentAssistant.id)!.push(newContainer.id);
    } else if (existingUserChildren.length >= 2 && existingContainer) {
      // 已经存在 >= 2 个 children, 更新现有 container
      const updatedContainer: ChildrenTabsContainer = {
        ...existingContainer,
        userMessages: [...existingContainer.userMessages, newUserNode],
        activeTab: newUserNode.id,
      };
      newContainers = newContainers.map((c) =>
        c.id === updatedContainer.id ? updatedContainer : c,
      );
    } else {
      // 之前没有 children 或没有 container（理论上不应该发生，但作为容错处理)
      console.warn(
        '[handleBranchQuestion] Unexpected situation, creating new container',
      );
      const allUserChildren = [...existingUserChildren, newUserNode];
      const newContainer: ChildrenTabsContainer = {
        id: `children-${parentAssistant.id}`,
        type: 'children',
        assistantMessageId: parentAssistantId,
        userMessages: allUserChildren,
        activeTab: newUserNode.id,
      };
      if (existingContainer) {
        newContainers = newContainers.filter(
          (c) => c.id !== existingContainer.id,
        );
      }
      newContainers.push(newContainer);
      // 更新 tabsMap
      newContainer.userMessages.forEach((userNode) => {
        if (!newTabsMap.has(userNode.id)) {
          newTabsMap.set(userNode.id, []);
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        newTabsMap.get(userNode.id)!.push(newContainer.id);
      });
      if (!newTabsMap.has(parentAssistant.id)) {
        newTabsMap.set(parentAssistant.id, []);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      newTabsMap.get(parentAssistant.id)!.push(newContainer.id);
    }
    // 7. 构建新路径
    // 找到父 assistant 在当前 path 中的位置
    const assistantIndex = prevPath.findIndex(
      (n) => n.id === parentAssistantId,
    );
    if (assistantIndex === -1) {
      console.warn(
        '[handleBranchQuestion] Parent assistant not in current path',
      );
      return fullRebuild([
        ...getMessagesFromDag(prevDag),
        userMessage,
        assistantMessage,
      ]);
    }
    // 保留路径前缀, 添加新分支
    const prefixPath = prevPath.slice(0, assistantIndex + 1);
    const newPath: ConversationPath = [
      ...prefixPath,
      newUserNode,
      newAssistantNode,
    ];
    return {
      success: true,
      dag: newDag,
      containers: newContainers,
      tabsMap: newTabsMap,
      path: newPath,
    };
  } catch (error) {
    console.error('[handleBranchQuestion] Processing error:', error);
    return fullRebuild([
      ...getMessagesFromDag(prevDag),
      userMessage,
      assistantMessage,
    ]);
  }
}
/**
 * 处理合并提问
 *
 * 特点：
 * - 引用多个 assistant 消息
 * - 创建新的合并点
 * - 必然创建 ParentTabsContainer
 */
function handleMergeQuestion(
  prevDag: Dag,
  prevContainers: TabsContainer[],
  prevTabsMap: MessageToTabsMap,
  prevPath: ConversationPath,
  userMessage: Message,
  assistantMessage: Message,
): IncrementalUpdateResult {
  try {
    // 1. 获取所有被引用的 assistant 节点
    const parentAssistantIds = userMessage.parent_ids || [];
    if (parentAssistantIds.length < 2) {
      console.warn('[handleMergeQuestion] Parent node count less than 2');
      return fullRebuild([
        ...getMessagesFromDag(prevDag),
        userMessage,
        assistantMessage,
      ]);
    }
    const parentAssistants: DagNode[] = [];
    for (const id of parentAssistantIds) {
      const node = prevDag.nodes.get(id);
      if (node) {
        parentAssistants.push(node);
      } else {
        console.warn(
          `[handleMergeQuestion] Cannot find parent assistant node: ${id}`,
        );
      }
    }
    if (parentAssistants.length < 2) {
      console.warn(
        '[handleMergeQuestion] Parent assistant node count less than 2',
      );
      return fullRebuild([
        ...getMessagesFromDag(prevDag),
        userMessage,
        assistantMessage,
      ]);
    }
    // 2. 添加新节点到 DAG
    const { newDag, newUserNode, newAssistantNode } = addNodesToDag(
      prevDag,
      userMessage,
      assistantMessage,
    );
    // 3. 更新所有父节点的 children 引用
    for (const parentAssistant of parentAssistants) {
      parentAssistant.children.push(newUserNode);
    }
    // 更新新 user 节点的 parent_ids
    newUserNode.parent_ids = parentAssistantIds;
    // 4. 更新 user 消息的 children 引用
    newUserNode.children.push(newAssistantNode);
    newAssistantNode.parent_ids = [newUserNode.id];
    // 5. 创建 ParentTabsContainer (合并提问必然创建)
    const newContainer: ParentTabsContainer = {
      id: `parent-${userMessage.id}`,
      type: 'parent',
      userMessageId: userMessage.id,
      assistantMessages: parentAssistants,
      activeTab: parentAssistants[0].id, // 默认选中第一个
    };
    const newContainers = [...prevContainers, newContainer];
    // 6. 更新 tabsMap
    const newTabsMap = new Map(prevTabsMap);
    // 为所有父 assistant 添加映射
    for (const assistant of parentAssistants) {
      if (!newTabsMap.has(assistant.id)) {
        newTabsMap.set(assistant.id, []);
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      newTabsMap.get(assistant.id)!.push(newContainer.id);
    }
    // 为 user 消息添加映射
    if (!newTabsMap.has(userMessage.id)) {
      newTabsMap.set(userMessage.id, []);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    newTabsMap.get(userMessage.id)!.push(newContainer.id);
    // 7. 构建新路径
    // 合并提问时，选择第一个父 assistant 作为主路径
    const primaryAssistant = parentAssistants[0];
    // 找到该 assistant 在当前 path 中的位置
    const assistantIndex = prevPath.findIndex(
      (n) => n.id === primaryAssistant.id,
    );
    let newPath: ConversationPath;
    if (assistantIndex === -1) {
      // 如果第一个父 assistant 不在当前 path 中，需要从 root 重建路径
      const prefixPath = buildPathToRoot(
        primaryAssistant.id,
        newDag,
        newTabsMap,
        newContainers,
      );
      newPath = [...prefixPath, newUserNode, newAssistantNode];
    } else {
      // 保留路径前缀
      const prefixPath = prevPath.slice(0, assistantIndex + 1);
      newPath = [...prefixPath, newUserNode, newAssistantNode];
    }
    return {
      success: true,
      dag: newDag,
      containers: newContainers,
      tabsMap: newTabsMap,
      path: newPath,
    };
  } catch (error) {
    console.error('[handleMergeQuestion] Processing error:', error);
    return fullRebuild([
      ...getMessagesFromDag(prevDag),
      userMessage,
      assistantMessage,
    ]);
  }
}
// ========================================
// 辅助函数
// ========================================
/**
 * 添加新节点到 DAG
 */
function addNodesToDag(
  prevDag: Dag,
  userMessage: Message,
  assistantMessage: Message,
): {
  newDag: Dag;
  newUserNode: DagNode;
  newAssistantNode: DagNode;
} {
  const newDag: Dag = {
    nodes: new Map(prevDag.nodes),
    rootId: prevDag.rootId,
  };
  // 创建 user 节点
  const newUserNode: DagNode = {
    id: userMessage.id,
    content: userMessage.content,
    role: 'user',
    parent_ids: userMessage.parent_ids || [],
    children: [],
    dag: newDag,
  };
  newDag.nodes.set(userMessage.id, newUserNode);
  // 创建 assistant 节点
  const newAssistantNode: DagNode = {
    id: assistantMessage.id,
    content: assistantMessage.content,
    role: 'assistant',
    parent_ids: [userMessage.id],
    children: [],
    dag: newDag,
    model: assistantMessage.model,
    thinkingContent: assistantMessage.thinkingContent,
    isThinkingExpanded: assistantMessage.isThinkingExpanded,
    deepThinkingEnabled: assistantMessage.deepThinkingEnabled,
    isWaitingForFirstToken: assistantMessage.isWaitingForFirstToken,
  };
  newDag.nodes.set(assistantMessage.id, newAssistantNode);
  return { newDag, newUserNode, newAssistantNode };
}
/**
 * 从 DAG 中提取所有消息
 */
function getMessagesFromDag(dag: Dag): Message[] {
  const messages: Message[] = [];
  for (const [, node] of dag.nodes) {
    messages.push({
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
    });
  }
  return messages;
}
/**
 * 完全重建 (降级方案)
 */
function fullRebuild(allMessages: Message[]): IncrementalUpdateResult {
  const newDag = buildDag(allMessages);
  if (!newDag) {
    return {
      success: false,
      dag: null,
      containers: [],
      tabsMap: new Map(),
      path: [],
      error: 'Failed to build DAG',
    };
  }
  const { containers: newContainers, map: newTabsMap } =
    buildTabsContainers(newDag);
  const newPath = buildPath(newDag, newTabsMap, newContainers);
  return {
    success: true,
    dag: newDag,
    containers: newContainers,
    tabsMap: newTabsMap,
    path: newPath,
  };
}
