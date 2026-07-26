/**
 * pathBuilder.ts 单元测试
 *
 * 覆盖：
 * - buildPath: 从 root 到 leaf 构建路径
 * - buildPathToRoot: 从指定节点向上到 root
 * - buildPathToLeaf: 从指定节点向下到 leaf
 * - isPathValid: 路径连通性验证
 * - validatePathContainerConsistency: Path-Container 一致性校验
 * - mergePaths: 路径合并
 * - arePathsEqual: 路径比较
 */

import { describe, it, expect } from 'vitest';
import {
  buildPath,
  buildPathToRoot,
  buildPathToLeaf,
  isPathValid,
  validatePathContainerConsistency,
  mergePaths,
  arePathsEqual,
  getPathToNode,
  pathContainsNode,
  getNodeIndexInPath,
  getSubPathAfterNode,
  getSubPathBeforeNode,
} from '@/utils/pathBuilder';
import { buildDag } from '@/utils/dagBuilder';
import { buildTabsContainers } from '@/utils/tabsContainerBuilder';
import { Message } from '@/types';
import { Dag, DagNode, ConversationPath } from '@/types/dag';

// ========================================
// 测试数据工厂
// ========================================

function expectDag(dag: Dag | null): Dag {
  if (!dag) throw new Error('buildDag returned null');
  return dag;
}

function expectNode(dag: Dag, id: string): DagNode {
  const node = dag.nodes.get(id);
  if (!node) throw new Error(`Node ${id} not found`);
  return node;
}

function makeUser(id: string, parent_ids: string[] = []): Message {
  return { id, content: `${id}内容`, role: 'user', parent_ids };
}

function makeAssistant(id: string, parent_ids: string[] = []): Message {
  return { id, content: `${id}内容`, role: 'assistant', parent_ids };
}

/** 线性: user_a -> assistant_a -> user_b -> assistant_b */
function buildLinear(): Message[] {
  return [
    makeUser('user_a'),
    makeAssistant('assistant_a', ['user_a']),
    makeUser('user_b', ['assistant_a']),
    makeAssistant('assistant_b', ['user_b']),
  ];
}

/** 分支: assistant_a 有 user_b 和 user_c 两个子节点 */
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

/** 合并: user_d 有两个 parent */
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
// buildPath 测试
// ========================================

describe('buildPath', () => {
  it('线性对话应该构建完整路径', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPath(dag, map, containers);

    expect(path).toHaveLength(4);
    expect(path[0].id).toBe('user_a');
    expect(path[1].id).toBe('assistant_a');
    expect(path[2].id).toBe('user_b');
    expect(path[3].id).toBe('assistant_b');
  });

  it('空 DAG 应该返回空路径', () => {
    const path = buildPath({ nodes: new Map(), rootId: null }, new Map(), []);
    expect(path).toHaveLength(0);
  });

  it('分支对话应该构建一条路径（根据 activeTab 选择）', () => {
    const dag = expectDag(buildDag(buildBranching()));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPath(dag, map, containers);

    // 路径应该包含 4 个节点: a -> assistant_a -> (b 或 c) -> assistant
    expect(path).toHaveLength(4);
    expect(path[0].id).toBe('user_a');
    expect(path[1].id).toBe('assistant_a');

    // 默认选中最后一个 tab (user_c)
    expect(path[2].id).toBe('user_c');
    expect(path[3].id).toBe('assistant_c');
  });

  it('路径应该是连通的', () => {
    const dag = expectDag(buildDag(buildBranching()));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPath(dag, map, containers);

    expect(isPathValid(path)).toBe(true);
  });

  it('合并对话应该构建经过选中 parent 的路径', () => {
    const dag = expectDag(buildDag(buildMerging()));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPath(dag, map, containers);

    // 路径应从 root 开始
    expect(path[0].id).toBe('user_a');
    // 路径应该是连通的
    expect(isPathValid(path)).toBe(true);
  });
});

// ========================================
// buildPathToRoot 测试
// ========================================

describe('buildPathToRoot', () => {
  it('应该从叶子节点向上构建到 root', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPathToRoot('assistant_b', dag, map, containers);

    expect(path).toHaveLength(4);
    expect(path[0].id).toBe('user_a');
    expect(path[3].id).toBe('assistant_b');
  });

  it('从 root 开始应该只返回 root', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPathToRoot('user_a', dag, map, containers);

    expect(path).toHaveLength(1);
    expect(path[0].id).toBe('user_a');
  });

  it('应该根据 ParentTabsContainer 的 activeTab 选择父节点', () => {
    const dag = expectDag(buildDag(buildMerging()));
    const { containers, map } = buildTabsContainers(dag);

    // 将 parent container 的 activeTab 设为 assistant_c
    const parentContainer = containers.find((c) => c.type === 'parent');
    if (parentContainer) {
      parentContainer.activeTab = 'assistant_c';
    }

    const path = buildPathToRoot('user_d', dag, map, containers);

    // 路径应该经过 assistant_c
    const pathIds = path.map((n) => n.id);
    expect(pathIds).toContain('assistant_c');
    expect(pathIds).toContain('user_c');
  });
});

// ========================================
// buildPathToLeaf 测试
// ========================================

describe('buildPathToLeaf', () => {
  it('应该从指定节点向下构建到 leaf', () => {
    const dag = expectDag(buildDag(buildBranching()));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPathToLeaf('user_a', dag, map, containers);

    // 从 root 到 leaf
    expect(path[0].id).toBe('user_a');
    expect(path.length).toBeGreaterThanOrEqual(2);
  });

  it('从叶子节点开始应该只返回该节点', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPathToLeaf('assistant_b', dag, map, containers);

    expect(path).toHaveLength(1);
    expect(path[0].id).toBe('assistant_b');
  });

  it('应该根据 ChildrenTabsContainer 的 activeTab 选择分支', () => {
    const dag = expectDag(buildDag(buildBranching()));
    const { containers, map } = buildTabsContainers(dag);

    // 将 children container 的 activeTab 设为 user_b
    const childrenContainer = containers.find((c) => c.type === 'children');
    if (childrenContainer) {
      childrenContainer.activeTab = 'user_b';
    }

    const path = buildPathToLeaf('user_a', dag, map, containers);
    const pathIds = path.map((n) => n.id);

    // 路径应该经过 user_b，不经过 user_c
    expect(pathIds).toContain('user_b');
    expect(pathIds).not.toContain('user_c');
  });
});

// ========================================
// isPathValid 测试
// ========================================

describe('isPathValid', () => {
  it('空路径应该无效', () => {
    expect(isPathValid([])).toBe(false);
  });

  it('单节点路径应该有效', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const node = expectNode(dag, 'user_a');
    expect(isPathValid([node])).toBe(true);
  });

  it('连通的路径应该有效', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPath(dag, map, containers);

    expect(isPathValid(path)).toBe(true);
  });

  it('不连通的路径应该无效', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const userA = expectNode(dag, 'user_a');
    const userB = expectNode(dag, 'user_b');

    // user_a 和 user_b 不直接连通
    const invalidPath = [userA, userB] as ConversationPath;
    expect(isPathValid(invalidPath)).toBe(false);
  });
});

// ========================================
// validatePathContainerConsistency 测试
// ========================================

describe('validatePathContainerConsistency', () => {
  it('一致的路径和 container 应该通过验证', () => {
    const dag = expectDag(buildDag(buildBranching()));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPath(dag, map, containers);

    const result = validatePathContainerConsistency(path, map, containers, dag);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('路径中 user 节点与 ChildrenTabsContainer activeTab 不一致时应该报错', () => {
    const dag = expectDag(buildDag(buildBranching()));
    const { containers, map } = buildTabsContainers(dag);

    // 手动构造一个不一致的路径：路径走 user_c，但 container activeTab 是 user_b
    const childrenContainer = containers.find((c) => c.type === 'children');
    if (!childrenContainer) throw new Error('Expected children container');
    childrenContainer.activeTab = 'user_b';

    // 手动构建经过 user_c 的路径（与 activeTab=user_b 不一致）
    const userA = expectNode(dag, 'user_a');
    const assistantA = expectNode(dag, 'assistant_a');
    const userC = expectNode(dag, 'user_c');
    const assistantC = expectNode(dag, 'assistant_c');
    const inconsistentPath = [
      userA,
      assistantA,
      userC,
      assistantC,
    ] as ConversationPath;

    const result = validatePathContainerConsistency(
      inconsistentPath,
      map,
      containers,
      dag,
    );

    // 应该检测到不一致：路径包含 user_c，但 activeTab 是 user_b
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].containerType).toBe('children');
  });
});

// ========================================
// mergePaths 测试
// ========================================

describe('mergePaths', () => {
  it('应该在连接点去重合并', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const nodeA = expectNode(dag, 'user_a');
    const assistantA = expectNode(dag, 'assistant_a');
    const userB = expectNode(dag, 'user_b');
    const assistantB = expectNode(dag, 'assistant_b');

    const path1 = [nodeA, assistantA] as ConversationPath;
    const path2 = [assistantA, userB, assistantB] as ConversationPath;

    const merged = mergePaths(path1, path2);

    // 应该去重 assistant_a
    expect(merged).toHaveLength(4);
    expect(merged.map((n) => n.id)).toEqual([
      'user_a',
      'assistant_a',
      'user_b',
      'assistant_b',
    ]);
  });

  it('空路径与非空路径合并应该返回非空路径', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const nodeA = expectNode(dag, 'user_a');
    const path = [nodeA] as ConversationPath;

    expect(mergePaths([], path)).toEqual(path);
    expect(mergePaths(path, [])).toEqual(path);
  });
});

// ========================================
// arePathsEqual 测试
// ========================================

describe('arePathsEqual', () => {
  it('相同的路径应该相等', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const { containers, map } = buildTabsContainers(dag);
    const path1 = buildPath(dag, map, containers);
    const path2 = buildPath(dag, map, containers);

    expect(arePathsEqual(path1, path2)).toBe(true);
  });

  it('不同长度的路径应该不相等', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const nodeA = expectNode(dag, 'user_a');
    const assistantA = expectNode(dag, 'assistant_a');

    const path1 = [nodeA] as ConversationPath;
    const path2 = [nodeA, assistantA] as ConversationPath;

    expect(arePathsEqual(path1, path2)).toBe(false);
  });
});

// ========================================
// 路径工具函数测试
// ========================================

describe('getPathToNode', () => {
  it('应该找到从 root 到目标节点的路径', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const path = getPathToNode(dag, 'assistant_b');

    expect(path).not.toBeNull();
    if (path) {
      expect(path[0].id).toBe('user_a');
      expect(path[path.length - 1].id).toBe('assistant_b');
    }
  });

  it('不存在的节点应该返回 null', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const path = getPathToNode(dag, 'nonexistent');

    expect(path).toBeNull();
  });
});

describe('pathContainsNode', () => {
  it('应该正确判断路径是否包含节点', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPath(dag, map, containers);

    expect(pathContainsNode(path, 'user_a')).toBe(true);
    expect(pathContainsNode(path, 'nonexistent')).toBe(false);
  });
});

describe('getNodeIndexInPath', () => {
  it('应该返回节点的正确索引', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPath(dag, map, containers);

    expect(getNodeIndexInPath(path, 'user_a')).toBe(0);
    expect(getNodeIndexInPath(path, 'assistant_a')).toBe(1);
    expect(getNodeIndexInPath(path, 'nonexistent')).toBe(-1);
  });
});

describe('getSubPathAfterNode / getSubPathBeforeNode', () => {
  it('getSubPathAfterNode 应该返回节点之后的子路径', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPath(dag, map, containers);

    const after = getSubPathAfterNode(path, 'assistant_a');
    expect(after).toHaveLength(2);
    expect(after[0].id).toBe('user_b');
  });

  it('getSubPathBeforeNode 应该返回节点之前的子路径（包含该节点）', () => {
    const dag = expectDag(buildDag(buildLinear()));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPath(dag, map, containers);

    const before = getSubPathBeforeNode(path, 'assistant_a');
    expect(before).toHaveLength(2);
    expect(before[0].id).toBe('user_a');
    expect(before[1].id).toBe('assistant_a');
  });
});
