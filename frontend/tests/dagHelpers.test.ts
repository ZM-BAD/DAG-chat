/**
 * dagHelpers.ts 单元测试
 *
 * 覆盖：
 * - getAllBranchingPoints / getAllMergePoints: 分支点/合并点查询
 * - getAllLeafNodes: 叶子节点查询
 * - getDagStats: DAG 统计信息
 * - calculateMaxDepth: 最大深度计算
 * - getNodeDepth: 节点深度
 * - hasPathBetween / getShortestPathBetween: 路径查询
 * - cloneDag: 深拷贝
 * - validateTabsMap: tabsMap 一致性验证
 */

import { describe, it, expect } from 'vitest';
import {
  getAllBranchingPoints,
  getAllMergePoints,
  getAllLeafNodes,
  getDagStats,
  calculateMaxDepth,
  getNodeDepth,
  hasPathBetween,
  getShortestPathBetween,
  cloneDag,
  validateTabsMap,
} from '@/utils/dagHelpers';
import { buildDag } from '@/utils/dagBuilder';
import { buildTabsContainers } from '@/utils/tabsContainerBuilder';
import { Message } from '@/types';
import { Dag } from '@/types/dag';

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

/** 分支树
 *       a
 *     / | \
 *    b  c  d
 */
function buildTree(): Message[] {
  return [
    makeUser('user_a'),
    makeAssistant('assistant_a', ['user_a']),
    makeUser('user_b', ['assistant_a']),
    makeAssistant('assistant_b', ['user_b']),
    makeUser('user_c', ['assistant_a']),
    makeAssistant('assistant_c', ['user_c']),
    makeUser('user_d', ['assistant_a']),
    makeAssistant('assistant_d', ['user_d']),
  ];
}

/** 合并 DAG
 *   b -> d
 *     ↘   ↗
 *       f
 *   c -> e
 */
function buildMergeDag(): Message[] {
  return [
    makeUser('user_a'),
    makeAssistant('assistant_a', ['user_a']),
    makeUser('user_b', ['assistant_a']),
    makeAssistant('assistant_b', ['user_b']),
    makeUser('user_c', ['assistant_a']),
    makeAssistant('assistant_c', ['user_c']),
    // user_d 合并了 b 和 c
    makeUser('user_d', ['assistant_b', 'assistant_c']),
    makeAssistant('assistant_d', ['user_d']),
    // user_e 也合并了 b 和 c
    makeUser('user_e', ['assistant_b', 'assistant_c']),
    makeAssistant('assistant_e', ['user_e']),
    // user_f 合并了 d 和 e
    makeUser('user_f', ['assistant_d', 'assistant_e']),
    makeAssistant('assistant_f', ['user_f']),
  ];
}

// ========================================
// 辅助断言函数
// ========================================

function expectDag(messages: Message[]): Dag {
  const dag = buildDag(messages);
  if (!dag) throw new Error('buildDag returned null');
  return dag;
}

function expectNode(dag: Dag, id: string) {
  const node = dag.nodes.get(id);
  if (!node) throw new Error(`Node ${id} not found`);
  return node;
}

// ========================================
// getAllBranchingPoints 测试
// ========================================

describe('getAllBranchingPoints', () => {
  it('线性对话没有分支点', () => {
    const dag = expectDag(buildLinear());
    expect(getAllBranchingPoints(dag)).toHaveLength(0);
  });

  it('树有一个分支点 (assistant_a)', () => {
    const dag = expectDag(buildTree());
    const branchingPoints = getAllBranchingPoints(dag);

    expect(branchingPoints).toHaveLength(1);
    expect(branchingPoints[0].id).toBe('assistant_a');
  });

  it('合并 DAG 有三个分支点', () => {
    const dag = expectDag(buildMergeDag());
    const branchingPoints = getAllBranchingPoints(dag);

    // assistant_a 有 user_b/user_c 两个子节点
    // assistant_b 有 user_d/user_e 两个子节点
    // assistant_c 有 user_d/user_e 两个子节点
    const ids = branchingPoints.map((n) => n.id).sort();
    expect(ids).toEqual(['assistant_a', 'assistant_b', 'assistant_c']);
  });
});

// ========================================
// getAllMergePoints 测试
// ========================================

describe('getAllMergePoints', () => {
  it('线性对话没有合并点', () => {
    const dag = expectDag(buildLinear());
    expect(getAllMergePoints(dag)).toHaveLength(0);
  });

  it('树没有合并点', () => {
    const dag = expectDag(buildTree());
    expect(getAllMergePoints(dag)).toHaveLength(0);
  });

  it('合并 DAG 有三个合并点', () => {
    const dag = expectDag(buildMergeDag());
    const mergePoints = getAllMergePoints(dag);

    const ids = mergePoints.map((n) => n.id).sort();
    expect(ids).toEqual(['user_d', 'user_e', 'user_f']);
  });
});

// ========================================
// getAllLeafNodes 测试
// ========================================

describe('getAllLeafNodes', () => {
  it('线性对话只有一个叶子节点', () => {
    const dag = expectDag(buildLinear());
    const leaves = getAllLeafNodes(dag);

    expect(leaves).toHaveLength(1);
    expect(leaves[0].id).toBe('assistant_b');
  });

  it('树有三个叶子节点', () => {
    const dag = expectDag(buildTree());
    const leaves = getAllLeafNodes(dag);

    const ids = leaves.map((n) => n.id).sort();
    expect(ids).toEqual(['assistant_b', 'assistant_c', 'assistant_d']);
  });
});

// ========================================
// getDagStats 测试
// ========================================

describe('getDagStats', () => {
  it('应该返回正确的统计信息', () => {
    const dag = expectDag(buildTree());
    const stats = getDagStats(dag);

    expect(stats.totalNodes).toBe(8);
    expect(stats.userMessages).toBe(4);
    expect(stats.assistantMessages).toBe(4);
    expect(stats.branchingPoints).toBe(1);
    expect(stats.mergePoints).toBe(0);
    expect(stats.leafNodes).toBe(3);
    expect(stats.maxDepth).toBe(4); // a -> assistant_a -> user_b -> assistant_b
  });

  it('线性对话的统计应该正确', () => {
    const dag = expectDag(buildLinear());
    const stats = getDagStats(dag);

    expect(stats.totalNodes).toBe(4);
    expect(stats.branchingPoints).toBe(0);
    expect(stats.mergePoints).toBe(0);
    expect(stats.leafNodes).toBe(1);
    expect(stats.maxDepth).toBe(4); // a -> assistant_a -> user_b -> assistant_b
  });
});

// ========================================
// calculateMaxDepth 测试
// ========================================

describe('calculateMaxDepth', () => {
  it('空 DAG 深度为 0', () => {
    expect(calculateMaxDepth({ nodes: new Map(), rootId: null })).toBe(0);
  });

  it('单节点 DAG 深度为 1', () => {
    const messages = [makeUser('user_a')];
    const dag = expectDag(messages);
    expect(calculateMaxDepth(dag)).toBe(1);
  });

  it('线性 DAG 深度等于节点数', () => {
    const dag = expectDag(buildLinear());
    expect(calculateMaxDepth(dag)).toBe(4);
  });

  it('树的最大深度是最长路径', () => {
    const dag = expectDag(buildTree());
    // a -> assistant_a -> user_b -> assistant_b = 4
    expect(calculateMaxDepth(dag)).toBe(4);
  });
});

// ========================================
// getNodeDepth 测试
// ========================================

describe('getNodeDepth', () => {
  it('根节点深度为 1', () => {
    const dag = expectDag(buildLinear());
    const userA = expectNode(dag, 'user_a');

    expect(getNodeDepth(userA)).toBe(1);
  });

  it('子节点深度递增', () => {
    const dag = expectDag(buildLinear());
    const assistantA = expectNode(dag, 'assistant_a');
    const userB = expectNode(dag, 'user_b');

    expect(getNodeDepth(assistantA)).toBe(2);
    expect(getNodeDepth(userB)).toBe(3);
  });
});

// ========================================
// hasPathBetween 测试
// ========================================

describe('hasPathBetween', () => {
  it('连通的节点之间应该有路径', () => {
    const dag = expectDag(buildLinear());
    const userA = expectNode(dag, 'user_a');
    const assistantB = expectNode(dag, 'assistant_b');

    expect(hasPathBetween(userA, assistantB)).toBe(true);
  });

  it('不连通的节点之间没有路径', () => {
    const dag = expectDag(buildTree());
    const userB = expectNode(dag, 'user_b');
    const userC = expectNode(dag, 'user_c');

    // user_b 和 user_c 之间没有路径
    expect(hasPathBetween(userB, userC)).toBe(false);
  });

  it('节点到自身有路径', () => {
    const dag = expectDag(buildLinear());
    const userA = expectNode(dag, 'user_a');

    expect(hasPathBetween(userA, userA)).toBe(true);
  });
});

// ========================================
// getShortestPathBetween 测试
// ========================================

describe('getShortestPathBetween', () => {
  it('应该找到最短路径', () => {
    const dag = expectDag(buildLinear());
    const path = getShortestPathBetween(dag, 'user_a', 'user_b');

    expect(path).not.toBeNull();
    if (path) {
      expect(path.map((n) => n.id)).toEqual([
        'user_a',
        'assistant_a',
        'user_b',
      ]);
    }
  });

  it('不连通的节点应该返回 null', () => {
    const dag = expectDag(buildTree());
    const path = getShortestPathBetween(dag, 'user_b', 'user_c');

    expect(path).toBeNull();
  });

  it('合并 DAG 中应该找到路径', () => {
    const dag = expectDag(buildMergeDag());
    const path = getShortestPathBetween(dag, 'user_a', 'user_d');

    expect(path).not.toBeNull();
    if (path) {
      // 最短路径: a -> b -> d 或 a -> c -> d
      expect(path.length).toBeLessThanOrEqual(5);
    }
  });
});

// ========================================
// cloneDag 测试
// ========================================

describe('cloneDag', () => {
  it('应该创建独立的副本', () => {
    const dag = expectDag(buildLinear());
    const cloned = cloneDag(dag);

    expect(cloned).not.toBe(dag);
    expect(cloned.nodes.size).toBe(dag.nodes.size);
    expect(cloned.rootId).toBe(dag.rootId);
  });

  it('修改克隆不应该影响原始 DAG', () => {
    const dag = expectDag(buildLinear());
    const cloned = cloneDag(dag);

    // 修改克隆
    cloned.rootId = 'modified';

    // 原始不受影响
    expect(dag.rootId).toBe('user_a');
  });

  it('克隆的节点应该有独立的引用', () => {
    const dag = expectDag(buildLinear());
    const cloned = cloneDag(dag);

    const originalNode = expectNode(dag, 'user_a');
    const clonedNode = expectNode(cloned, 'user_a');

    expect(clonedNode).not.toBe(originalNode);
    expect(clonedNode.id).toBe(originalNode.id);
    expect(clonedNode.dag).toBe(cloned);
  });

  it('克隆应该保持 children 引用一致性', () => {
    const dag = expectDag(buildLinear());
    const cloned = cloneDag(dag);

    const clonedUserA = expectNode(cloned, 'user_a');
    expect(clonedUserA.children).toHaveLength(1);
    expect(clonedUserA.children[0].id).toBe('assistant_a');
    // children 应该指向克隆中的节点，不是原始节点
    expect(clonedUserA.children[0].dag).toBe(cloned);
  });
});

// ========================================
// validateTabsMap 测试
// ========================================

describe('validateTabsMap', () => {
  it('一致的 tabsMap 应该通过验证', () => {
    const dag = expectDag(buildTree());
    const { containers, map } = buildTabsContainers(dag);

    expect(validateTabsMap(map, containers)).toBe(true);
  });

  it('缺少映射应该失败', () => {
    const dag = expectDag(buildTree());
    const { containers, map: originalMap } = buildTabsContainers(dag);

    // 删除一个映射
    const map = new Map(originalMap);
    map.delete('user_b');

    expect(validateTabsMap(map, containers)).toBe(false);
  });

  it('引用无效 container 应该失败', () => {
    const dag = expectDag(buildTree());
    const { containers, map } = buildTabsContainers(dag);

    // 添加一个无效的 container 引用
    const newMap = new Map(map);
    newMap.set('user_b', ['nonexistent-container']);

    expect(validateTabsMap(newMap, containers)).toBe(false);
  });
});
