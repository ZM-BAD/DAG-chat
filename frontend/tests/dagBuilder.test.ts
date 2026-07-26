/**
 * dagBuilder.ts 单元测试
 *
 * 覆盖：
 * - buildDag: 从扁平消息列表构建 DAG
 * - validateDag: DAG 完整性验证
 * - hasCycle: 环检测
 * - isBranchingPoint / isMergePoint: 分支点/合并点识别
 * - dagNodeToMessage / flattenDagToMessages: 类型转换
 */

import { describe, it, expect } from 'vitest';
import {
  buildDag,
  validateDag,
  hasCycle,
  isBranchingPoint,
  isMergePoint,
  dagNodeToMessage,
  flattenDagToMessages,
  getRootNode,
  getParents,
  getChildren,
} from '@/utils/dagBuilder';
import { Message } from '@/types';
import { Dag } from '@/types/dag';

// ========================================
// 测试数据工厂
// ========================================

/** 创建一条用户消息 */
function makeUserMessage(
  id: string,
  content: string,
  parent_ids: string[] = [],
): Message {
  return { id, content, role: 'user', parent_ids };
}

/** 创建一条助手消息 */
function makeAssistantMessage(
  id: string,
  content: string,
  parent_ids: string[] = [],
): Message {
  return { id, content, role: 'assistant', parent_ids };
}

/** 断言 buildDag 成功并返回非空 DAG */
function expectDag(messages: Message[]): Dag {
  const dag = buildDag(messages);
  if (!dag) throw new Error('buildDag returned null');
  return dag;
}

/** 获取 DAG 中的节点，断言存在 */
function expectNode(dag: Dag, nodeId: string) {
  const node = dag.nodes.get(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);
  return node;
}

/** 构建一个线性对话: user_a -> assistant_a -> user_b -> assistant_b */
function buildLinearMessages(): Message[] {
  return [
    makeUserMessage('user_a', '问题A'),
    makeAssistantMessage('assistant_a', '回答A', ['user_a']),
    makeUserMessage('user_b', '问题B', ['assistant_a']),
    makeAssistantMessage('assistant_b', '回答B', ['user_b']),
  ];
}

/** 构建一个分支对话:
 *   user_a -> assistant_a -> user_b -> assistant_b
 *                           -> user_c -> assistant_c
 */
function buildBranchingMessages(): Message[] {
  return [
    makeUserMessage('user_a', '问题A'),
    makeAssistantMessage('assistant_a', '回答A', ['user_a']),
    makeUserMessage('user_b', '问题B', ['assistant_a']),
    makeAssistantMessage('assistant_b', '回答B', ['user_b']),
    makeUserMessage('user_c', '问题C', ['assistant_a']),
    makeAssistantMessage('assistant_c', '回答C', ['user_c']),
  ];
}

/** 构建一个合并对话:
 *   user_a -> assistant_a -> user_b -> assistant_b
 *                           -> user_c -> assistant_c
 *                                    -> user_d (parent_ids: [assistant_b, assistant_c])
 */
function buildMergingMessages(): Message[] {
  return [
    makeUserMessage('user_a', '问题A'),
    makeAssistantMessage('assistant_a', '回答A', ['user_a']),
    makeUserMessage('user_b', '问题B', ['assistant_a']),
    makeAssistantMessage('assistant_b', '回答B', ['user_b']),
    makeUserMessage('user_c', '问题C', ['assistant_a']),
    makeAssistantMessage('assistant_c', '回答C', ['user_c']),
    makeUserMessage('user_d', '问题D', ['assistant_b', 'assistant_c']),
    makeAssistantMessage('assistant_d', '回答D', ['user_d']),
  ];
}

// ========================================
// buildDag 测试
// ========================================

describe('buildDag', () => {
  it('应该从线性消息列表构建 DAG', () => {
    const dag = expectDag(buildLinearMessages());

    expect(dag.nodes.size).toBe(4);
    expect(dag.rootId).toBe('user_a');
  });

  it('空消息列表应该返回 null', () => {
    expect(buildDag([])).toBeNull();
  });

  it('应该正确建立双向引用 (children 引用)', () => {
    const dag = expectDag(buildLinearMessages());
    const userA = expectNode(dag, 'user_a');
    const assistantA = expectNode(dag, 'assistant_a');

    // user_a 的 children 应该包含 assistant_a
    expect(userA.children).toHaveLength(1);
    expect(userA.children[0].id).toBe('assistant_a');

    // assistant_a 的 children 应该包含 user_b
    expect(assistantA.children).toHaveLength(1);
    expect(assistantA.children[0].id).toBe('user_b');
  });

  it('应该正确设置 dag 引用', () => {
    const dag = expectDag(buildLinearMessages());

    for (const [, node] of dag.nodes) {
      expect(node.dag).toBe(dag);
    }
  });

  it('应该识别分支结构', () => {
    const dag = expectDag(buildBranchingMessages());
    const assistantA = expectNode(dag, 'assistant_a');

    expect(assistantA.children).toHaveLength(2);
    const childIds = assistantA.children.map((c) => c.id).sort();
    expect(childIds).toEqual(['user_b', 'user_c']);
  });

  it('应该识别合并结构', () => {
    const dag = expectDag(buildMergingMessages());
    const userD = expectNode(dag, 'user_d');

    expect(userD.parent_ids).toEqual(['assistant_b', 'assistant_c']);
  });

  it('多个根节点时应该选择第一个并发出警告', () => {
    const messages = [
      makeUserMessage('user_a', '问题A'),
      makeUserMessage('user_b', '问题B'),
    ];
    const dag = expectDag(messages);

    expect(dag.rootId).toBe('user_a');
  });
});

// ========================================
// validateDag 测试
// ========================================

describe('validateDag', () => {
  it('有效的线性 DAG 应该通过验证', () => {
    const dag = expectDag(buildLinearMessages());
    const result = validateDag(dag);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('有效的分支 DAG 应该通过验证', () => {
    const dag = expectDag(buildBranchingMessages());
    const result = validateDag(dag);

    expect(result.valid).toBe(true);
  });

  it('有效的合并 DAG 应该通过验证', () => {
    const dag = expectDag(buildMergingMessages());
    const result = validateDag(dag);

    expect(result.valid).toBe(true);
  });

  it('多个根节点应该报错', () => {
    const messages = [
      makeUserMessage('user_a', '问题A'),
      makeUserMessage('user_b', '问题B'),
    ];
    const dag = expectDag(messages);
    const result = validateDag(dag);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('多个根节点'))).toBe(true);
  });

  it('有环的 DAG 应该报错', () => {
    // 构造一个有环的情况: a -> b -> c -> a
    const dag = expectDag(buildLinearMessages());

    // 手动制造环: 让 user_a 的 parent_ids 包含 assistant_b
    expectNode(dag, 'user_a').parent_ids = ['assistant_b'];
    // 更新 children 引用
    expectNode(dag, 'assistant_b').children.push(expectNode(dag, 'user_a'));

    const result = validateDag(dag);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('环'))).toBe(true);
  });

  it('双向引用不一致应该报错', () => {
    const dag = expectDag(buildLinearMessages());

    // 破坏双向引用: 让 user_a 的 children 不再指向 assistant_a
    expectNode(dag, 'user_a').children = [];

    const result = validateDag(dag);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('双向引用不一致'))).toBe(true);
  });
});

// ========================================
// hasCycle 测试
// ========================================

describe('hasCycle', () => {
  it('线性 DAG 不应该有环', () => {
    const dag = expectDag(buildLinearMessages());
    const result = hasCycle(dag);

    expect(result.hasCycle).toBe(false);
  });

  it('分支 DAG 不应该有环', () => {
    const dag = expectDag(buildBranchingMessages());
    const result = hasCycle(dag);

    expect(result.hasCycle).toBe(false);
  });

  it('合并 DAG 不应该有环', () => {
    const dag = expectDag(buildMergingMessages());
    const result = hasCycle(dag);

    expect(result.hasCycle).toBe(false);
  });

  it('应该检测到环', () => {
    const dag = expectDag(buildLinearMessages());

    // 制造环
    expectNode(dag, 'user_a').parent_ids = ['assistant_b'];
    expectNode(dag, 'assistant_b').children.push(expectNode(dag, 'user_a'));

    const result = hasCycle(dag);
    expect(result.hasCycle).toBe(true);
  });
});

// ========================================
// isBranchingPoint / isMergePoint 测试
// ========================================

describe('isBranchingPoint', () => {
  it('有多个 user 子节点的 assistant 应该是分支点', () => {
    const dag = expectDag(buildBranchingMessages());
    const assistantA = expectNode(dag, 'assistant_a');

    expect(isBranchingPoint(assistantA)).toBe(true);
  });

  it('只有一个 user 子节点的 assistant 不是分支点', () => {
    const dag = expectDag(buildLinearMessages());
    const assistantA = expectNode(dag, 'assistant_a');

    expect(isBranchingPoint(assistantA)).toBe(false);
  });

  it('user 节点不可能是分支点', () => {
    const dag = expectDag(buildBranchingMessages());
    const userA = expectNode(dag, 'user_a');

    expect(isBranchingPoint(userA)).toBe(false);
  });
});

describe('isMergePoint', () => {
  it('有多个 parent 的 user 节点应该是合并点', () => {
    const dag = expectDag(buildMergingMessages());
    const userD = expectNode(dag, 'user_d');

    expect(isMergePoint(userD)).toBe(true);
  });

  it('只有一个 parent 的 user 节点不是合并点', () => {
    const dag = expectDag(buildLinearMessages());
    const userB = expectNode(dag, 'user_b');

    expect(isMergePoint(userB)).toBe(false);
  });

  it('assistant 节点不可能是合并点', () => {
    const dag = expectDag(buildMergingMessages());
    const assistantB = expectNode(dag, 'assistant_b');

    expect(isMergePoint(assistantB)).toBe(false);
  });
});

// ========================================
// 辅助函数测试
// ========================================

describe('getRootNode', () => {
  it('应该返回根节点', () => {
    const dag = expectDag(buildLinearMessages());
    const root = getRootNode(dag);

    expect(root).not.toBeNull();
    if (root) {
      expect(root.id).toBe('user_a');
    }
  });
});

describe('getParents / getChildren', () => {
  it('getParents 应该返回正确的父节点', () => {
    const dag = expectDag(buildMergingMessages());
    const userD = expectNode(dag, 'user_d');
    const parents = getParents(userD);

    expect(parents).toHaveLength(2);
    const parentIds = parents.map((p) => p.id).sort();
    expect(parentIds).toEqual(['assistant_b', 'assistant_c']);
  });

  it('getChildren 应该返回正确的子节点', () => {
    const dag = expectDag(buildBranchingMessages());
    const assistantA = expectNode(dag, 'assistant_a');
    const children = getChildren(assistantA);

    expect(children).toHaveLength(2);
  });
});

describe('dagNodeToMessage', () => {
  it('应该正确转换 DagNode 为 Message', () => {
    const dag = expectDag(buildLinearMessages());
    const userA = expectNode(dag, 'user_a');
    const message = dagNodeToMessage(userA);

    expect(message.id).toBe('user_a');
    expect(message.role).toBe('user');
    expect(message.content).toBe('问题A');
    expect(message.parent_ids).toBeUndefined(); // 根节点 parent_ids 为空 -> undefined
  });

  it('应该保留 children ID 列表', () => {
    const dag = expectDag(buildLinearMessages());
    const userA = expectNode(dag, 'user_a');
    const message = dagNodeToMessage(userA);

    expect(message.children).toEqual(['assistant_a']);
  });
});

describe('flattenDagToMessages', () => {
  it('应该将 DAG 扁平化为消息列表', () => {
    const messages = buildLinearMessages();
    const dag = expectDag(messages);
    const flattened = flattenDagToMessages(dag);

    expect(flattened).toHaveLength(4);
    const ids = flattened.map((m) => m.id).sort();
    expect(ids).toEqual(['assistant_a', 'assistant_b', 'user_a', 'user_b']);
  });
});
