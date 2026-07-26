/**
 * conversationDag.ts 单元测试
 *
 * 这是 dagBuilder.ts 的"另一套实现"，使用不同的 DagNode 设计
 * (children 动态计算而非存储)。测试验证两套实现的行为一致性。
 *
 * 覆盖：
 * - buildConversationDag: 构建 DAG
 * - getChildren / getParents: 动态计算
 * - isBranchingPoint / isMergePoint: 分支/合并点识别
 * - validateDag: DAG 验证
 * - getPathToNode: 路径查找
 * - getCompleteConversationPath: 基于分支选择构建路径
 */

import { describe, it, expect } from 'vitest';
import {
  buildConversationDag,
  getChildren,
  getParents,
  isBranchingPoint,
  isMergePoint,
  validateDag,
  getPathToNode,
  getCompleteConversationPath,
  findBranchingPoints,
  findMergePoints,
  getRootNode,
} from '@/utils/conversationDag';
import { Dag } from '@/utils/conversationDag';
import { Message } from '@/types';

// ========================================
// 测试数据工厂
// ========================================

function makeUser(id: string, parent_ids: string[] = []): Message {
  return { id, content: id, role: 'user', parent_ids };
}

function makeAssistant(id: string, parent_ids: string[] = []): Message {
  return { id, content: id, role: 'assistant', parent_ids };
}

/** 线性 */
function buildLinear(): Message[] {
  return [
    makeUser('user_a'),
    makeAssistant('assistant_a', ['user_a']),
    makeUser('user_b', ['assistant_a']),
    makeAssistant('assistant_b', ['user_b']),
  ];
}

/** 分支 */
function buildBranching(): Message[] {
  return [
    makeUser('user_a'),
    makeAssistant('assistant_a', ['user_a']),
    makeUser('user_b', ['assistant_a']),
    makeAssistant('assistant_b', ['user_b']),
    makeUser('user_c', ['assistant_a']),
    makeAssistant('assistant_c', ['user_c']),
  ];
}

/** 合并 */
function buildMerging(): Message[] {
  return [
    makeUser('user_a'),
    makeAssistant('assistant_a', ['user_a']),
    makeUser('user_b', ['assistant_a']),
    makeAssistant('assistant_b', ['user_b']),
    makeUser('user_c', ['assistant_a']),
    makeAssistant('assistant_c', ['user_c']),
    makeUser('user_d', ['assistant_b', 'assistant_c']),
    makeAssistant('assistant_d', ['user_d']),
  ];
}

// ========================================
// 辅助函数
// ========================================

function expectDag(messages: Message[]): Dag {
  const dag = buildConversationDag(messages);
  if (!dag) throw new Error('buildConversationDag returned null');
  return dag;
}

/** 获取 DAG 中的节点，断言存在 */
function expectNode(dag: Dag, nodeId: string) {
  const node = dag.nodes.get(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);
  return node;
}

// ========================================
// buildConversationDag 测试
// ========================================

describe('buildConversationDag', () => {
  it('应该从线性消息列表构建 DAG', () => {
    const dag = expectDag(buildLinear());

    expect(dag.nodes.size).toBe(4);
    expect(dag.rootId).toBe('user_a');
  });

  it('空消息列表应该返回 null', () => {
    expect(buildConversationDag([])).toBeNull();
  });

  it('应该正确设置 dag 引用', () => {
    const dag = expectDag(buildLinear());

    for (const [, node] of dag.nodes) {
      expect(node.dag).toBe(dag);
    }
  });

  it('多个根节点时应该选择第一个', () => {
    const messages = [makeUser('user_a', []), makeUser('user_b', [])];
    const dag = expectDag(messages);

    expect(dag.rootId).toBe('user_a');
  });
});

// ========================================
// getChildren / getParents 测试
// ========================================

describe('getChildren / getParents', () => {
  it('getChildren 应该动态计算子节点', () => {
    const dag = expectDag(buildBranching());
    const assistantA = expectNode(dag, 'assistant_a');
    const children = getChildren(assistantA);

    expect(children).toHaveLength(2);
    const childIds = children.map((c) => c.id).sort();
    expect(childIds).toEqual(['user_b', 'user_c']);
  });

  it('getParents 应该正确获取父节点', () => {
    const dag = expectDag(buildMerging());
    const userD = expectNode(dag, 'user_d');
    const parents = getParents(userD);

    expect(parents).toHaveLength(2);
    const parentIds = parents.map((p) => p.id).sort();
    expect(parentIds).toEqual(['assistant_b', 'assistant_c']);
  });

  it('根节点没有父节点', () => {
    const dag = expectDag(buildLinear());
    const userA = expectNode(dag, 'user_a');

    expect(getParents(userA)).toHaveLength(0);
  });

  it('叶子节点没有子节点', () => {
    const dag = expectDag(buildLinear());
    const assistantB = expectNode(dag, 'assistant_b');

    expect(getChildren(assistantB)).toHaveLength(0);
  });
});

// ========================================
// isBranchingPoint / isMergePoint 测试
// ========================================

describe('isBranchingPoint', () => {
  it('有多个 user 子节点的 assistant 应该是分支点', () => {
    const dag = expectDag(buildBranching());
    const assistantA = expectNode(dag, 'assistant_a');

    expect(isBranchingPoint(assistantA)).toBe(true);
  });

  it('只有一个 user 子节点的 assistant 不是分支点', () => {
    const dag = expectDag(buildLinear());
    const assistantA = expectNode(dag, 'assistant_a');

    expect(isBranchingPoint(assistantA)).toBe(false);
  });

  it('user 节点不可能是分支点', () => {
    const dag = expectDag(buildBranching());
    const userA = expectNode(dag, 'user_a');

    expect(isBranchingPoint(userA)).toBe(false);
  });
});

describe('isMergePoint', () => {
  it('有多个 parent 的 user 节点应该是合并点', () => {
    const dag = expectDag(buildMerging());
    const userD = expectNode(dag, 'user_d');

    expect(isMergePoint(userD)).toBe(true);
  });

  it('只有一个 parent 的 user 节点不是合并点', () => {
    const dag = expectDag(buildLinear());
    const userB = expectNode(dag, 'user_b');

    expect(isMergePoint(userB)).toBe(false);
  });
});

// ========================================
// validateDag 测试
// ========================================

describe('validateDag', () => {
  it('有效的线性 DAG 应该通过验证', () => {
    const dag = expectDag(buildLinear());
    const result = validateDag(dag);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('有效的分支 DAG 应该通过验证', () => {
    const dag = expectDag(buildBranching());
    const result = validateDag(dag);

    expect(result.valid).toBe(true);
  });

  it('有效的合并 DAG 应该通过验证', () => {
    const dag = expectDag(buildMerging());
    const result = validateDag(dag);

    expect(result.valid).toBe(true);
  });

  it('多个根节点应该报错', () => {
    const messages = [makeUser('user_a', []), makeUser('user_b', [])];
    const dag = expectDag(messages);
    const result = validateDag(dag);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('多个根节点'))).toBe(true);
  });
});

// ========================================
// getPathToNode 测试
// ========================================

describe('getPathToNode', () => {
  it('应该找到从 root 到目标节点的路径', () => {
    const dag = expectDag(buildLinear());
    const path = getPathToNode(dag, 'assistant_b');

    expect(path).not.toBeNull();
    if (path) {
      expect(path[0].id).toBe('user_a');
      expect(path[path.length - 1].id).toBe('assistant_b');
    }
  });

  it('不存在的节点应该返回 null', () => {
    const dag = expectDag(buildLinear());
    const path = getPathToNode(dag, 'nonexistent');

    expect(path).toBeNull();
  });

  it('空 DAG 应该返回 null', () => {
    const path = getPathToNode({ nodes: new Map(), rootId: null }, 'user_a');

    expect(path).toBeNull();
  });
});

// ========================================
// getCompleteConversationPath 测试
// ========================================

describe('getCompleteConversationPath', () => {
  it('无分支选择时应该返回简单路径', () => {
    const dag = expectDag(buildLinear());
    const path = getCompleteConversationPath(dag, new Map());

    expect(path.length).toBeGreaterThan(0);
    expect(path[0].id).toBe('user_a');
  });

  it('分支选择应该影响路径', () => {
    const dag = expectDag(buildBranching());
    const selectedBranches = new Map<string, string>();
    selectedBranches.set('assistant_a', 'user_b');

    const path = getCompleteConversationPath(dag, selectedBranches);
    const pathIds = path.map((n) => n.id);

    // 应该走 user_b 分支
    expect(pathIds).toContain('user_b');
    expect(pathIds).toContain('assistant_b');
  });

  it('合并点应该能生成路径（不崩溃）', () => {
    const dag = expectDag(buildMerging());
    const selectedBranches = new Map<string, string>();
    const selectedParents = new Map<string, string>();
    selectedParents.set('user_d', 'assistant_b');

    const path = getCompleteConversationPath(
      dag,
      selectedBranches,
      selectedParents,
    );

    // 应该生成一条从 root 开始的路径
    expect(path.length).toBeGreaterThan(0);
    expect(path[0].id).toBe('user_a');
    // 路径中不应该有重复节点
    const ids = path.map((n) => n.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ========================================
// findBranchingPoints / findMergePoints 测试
// ========================================

describe('findBranchingPoints', () => {
  it('线性对话没有分支点', () => {
    const dag = expectDag(buildLinear());
    expect(findBranchingPoints(dag).size).toBe(0);
  });

  it('分支对话有一个分支点', () => {
    const dag = expectDag(buildBranching());
    const branchingPoints = findBranchingPoints(dag);

    expect(branchingPoints.size).toBe(1);
    expect(branchingPoints.has('assistant_a')).toBe(true);
  });
});

describe('findMergePoints', () => {
  it('线性对话没有合并点', () => {
    const dag = expectDag(buildLinear());
    expect(findMergePoints(dag).size).toBe(0);
  });

  it('分支对话没有合并点', () => {
    const dag = expectDag(buildBranching());
    expect(findMergePoints(dag).size).toBe(0);
  });

  it('合并对话有一个合并点', () => {
    const dag = expectDag(buildMerging());
    const mergePoints = findMergePoints(dag);

    expect(mergePoints.size).toBe(1);
    expect(mergePoints.has('user_d')).toBe(true);
  });
});

// ========================================
// getRootNode 测试
// ========================================

describe('getRootNode', () => {
  it('应该返回根节点', () => {
    const dag = expectDag(buildLinear());
    const root = getRootNode(dag);

    expect(root).not.toBeNull();
    if (root) {
      expect(root.id).toBe('user_a');
    }
  });

  it('空 DAG 应该返回 null', () => {
    expect(getRootNode({ nodes: new Map(), rootId: null })).toBeNull();
  });
});
