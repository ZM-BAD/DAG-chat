/**
 * tabSwitchHandler.ts 单元测试
 *
 * 覆盖：
 * - handleTabSwitch: tab 切换事件处理
 * - isValidTabSwitch: 切换有效性验证
 * - handleBatchTabSwitch: 批量切换
 * - predictPathAfterTabSwitch: 路径预测
 *
 * 核心约束（来自 specs/010-constitution.md）：
 * 1. tabsMap 是静态的，tab 点击时不重建
 * 2. Path-Container invariant：path 中的节点，其 container activeTab 必须指向它
 */

import { describe, it, expect } from 'vitest';
import {
  handleTabSwitch,
  isValidTabSwitch,
  handleBatchTabSwitch,
  predictPathAfterTabSwitch,
} from '@/utils/tabSwitchHandler';
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

/** 合并: user_d 有两个 parent (assistant_b, assistant_c) */
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

/** 复杂 DAG: 多层分支合并
 *       a
 *     /   \
 *    b     c
 *   / \   / \
 *  d   e f   g
 *       \   /
 *         h  (合并点)
 */
function buildComplexDag(): Message[] {
  return [
    makeUser('user_a'),
    makeAssistant('assistant_a', ['user_a']),
    makeUser('user_b', ['assistant_a']),
    makeAssistant('assistant_b', ['user_b']),
    makeUser('user_c', ['assistant_a']),
    makeAssistant('assistant_c', ['user_c']),
    makeUser('user_d', ['assistant_b']),
    makeAssistant('assistant_d', ['user_d']),
    makeUser('user_e', ['assistant_b']),
    makeAssistant('assistant_e', ['user_e']),
    makeUser('user_f', ['assistant_c']),
    makeAssistant('assistant_f', ['user_f']),
    makeUser('user_g', ['assistant_c']),
    makeAssistant('assistant_g', ['user_g']),
    // user_h 合并了 e 和 g
    makeUser('user_h', ['assistant_e', 'assistant_g']),
    makeAssistant('assistant_h', ['user_h']),
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

// ========================================
// handleTabSwitch 测试
// ========================================

describe('handleTabSwitch', () => {
  it('ChildrenTabsContainer 切换应该更新 activeTab', () => {
    const dag = expectDag(buildBranching());
    const { containers, map } = buildTabsContainers(dag);

    const childrenContainer = containers.find((c) => c.type === 'children');
    expect(childrenContainer).toBeDefined();
    if (!childrenContainer) return;

    // 切换到 user_b
    const result = handleTabSwitch(
      childrenContainer.id,
      'user_b',
      containers,
      dag,
      map,
    );

    const updatedContainer = result.updatedContainers.find(
      (c) => c.id === childrenContainer.id,
    );
    expect(updatedContainer).toBeDefined();
    if (!updatedContainer) return;
    expect(updatedContainer.type).toBe('children');
    if (updatedContainer.type === 'children') {
      expect(updatedContainer.activeTab).toBe('user_b');
    }
  });

  it('tabsMap 不应该被重建（应该是同一个引用）', () => {
    const dag = expectDag(buildBranching());
    const { containers, map } = buildTabsContainers(dag);

    const childrenContainer = containers.find((c) => c.type === 'children');
    expect(childrenContainer).toBeDefined();
    if (!childrenContainer) return;
    const result = handleTabSwitch(
      childrenContainer.id,
      'user_b',
      containers,
      dag,
      map,
    );

    // tabsMap 应该是同一个引用
    expect(result.updatedTabsMap).toBe(map);
  });

  it('ChildrenTabsContainer 切换应该更新路径', () => {
    const dag = expectDag(buildBranching());
    const { containers, map } = buildTabsContainers(dag);

    const childrenContainer = containers.find((c) => c.type === 'children');
    expect(childrenContainer).toBeDefined();
    if (!childrenContainer) return;
    const result = handleTabSwitch(
      childrenContainer.id,
      'user_b',
      containers,
      dag,
      map,
    );

    const pathIds = result.newPath.map((n) => n.id);
    // 路径应该经过 user_b
    expect(pathIds).toContain('user_b');
    expect(pathIds).toContain('assistant_b');
    // 不应该经过 user_c
    expect(pathIds).not.toContain('user_c');
  });

  it('ParentTabsContainer 切换应该更新 activeTab', () => {
    const dag = expectDag(buildMerging());
    const { containers, map } = buildTabsContainers(dag);

    const parentContainer = containers.find((c) => c.type === 'parent');
    expect(parentContainer).toBeDefined();
    if (!parentContainer) return;

    // 切换到 assistant_c
    const result = handleTabSwitch(
      parentContainer.id,
      'assistant_c',
      containers,
      dag,
      map,
    );

    const updatedContainer = result.updatedContainers.find(
      (c) => c.id === parentContainer.id,
    );
    expect(updatedContainer).toBeDefined();
    if (!updatedContainer) return;
    expect(updatedContainer.type).toBe('parent');
    if (updatedContainer.type === 'parent') {
      expect(updatedContainer.activeTab).toBe('assistant_c');
    }
  });

  it('ParentTabsContainer 切换应该更新路径', () => {
    const dag = expectDag(buildMerging());
    const { containers, map } = buildTabsContainers(dag);

    const parentContainer = containers.find((c) => c.type === 'parent');
    expect(parentContainer).toBeDefined();
    if (!parentContainer) return;

    // 切换到 assistant_c 作为来源
    const result = handleTabSwitch(
      parentContainer.id,
      'assistant_c',
      containers,
      dag,
      map,
    );

    const pathIds = result.newPath.map((n) => n.id);
    // 路径应该经过 assistant_c -> user_c -> ...
    expect(pathIds).toContain('assistant_c');
    expect(pathIds).toContain('user_c');
  });

  it('不存在的 container 应该返回原始状态', () => {
    const dag = expectDag(buildBranching());
    const { containers, map } = buildTabsContainers(dag);

    const result = handleTabSwitch(
      'nonexistent',
      'user_b',
      containers,
      dag,
      map,
    );

    expect(result.updatedContainers).toBe(containers);
    expect(result.updatedTabsMap).toBe(map);
  });

  it('切换后应该保持 Path-Container 一致性', () => {
    const dag = expectDag(buildBranching());
    const { containers, map } = buildTabsContainers(dag);

    const childrenContainer = containers.find((c) => c.type === 'children');
    expect(childrenContainer).toBeDefined();
    if (!childrenContainer) return;
    const result = handleTabSwitch(
      childrenContainer.id,
      'user_b',
      containers,
      dag,
      map,
    );

    // 路径中的 user 节点应该与 container activeTab 一致
    const userNodesInPath = result.newPath.filter((n) => n.role === 'user');
    for (const userNode of userNodesInPath) {
      const containerIds = map.get(userNode.id) || [];
      for (const containerId of containerIds) {
        const container = result.updatedContainers.find(
          (c) => c.id === containerId,
        );
        if (container?.type === 'children') {
          expect(container.activeTab).toBe(userNode.id);
        }
      }
    }
  });
});

// ========================================
// isValidTabSwitch 测试
// ========================================

describe('isValidTabSwitch', () => {
  it('有效的切换应该返回 true', () => {
    const dag = expectDag(buildBranching());
    const { containers } = buildTabsContainers(dag);

    const childrenContainer = containers.find((c) => c.type === 'children');
    expect(childrenContainer).toBeDefined();
    if (!childrenContainer) return;

    expect(isValidTabSwitch(childrenContainer.id, 'user_b', containers)).toBe(
      true,
    );
    expect(isValidTabSwitch(childrenContainer.id, 'user_c', containers)).toBe(
      true,
    );
  });

  it('不属于 container 的 tab 应该返回 false', () => {
    const dag = expectDag(buildBranching());
    const { containers } = buildTabsContainers(dag);

    const childrenContainer = containers.find((c) => c.type === 'children');
    expect(childrenContainer).toBeDefined();
    if (!childrenContainer) return;
    // user_a 不在 children container 中
    expect(isValidTabSwitch(childrenContainer.id, 'user_a', containers)).toBe(
      false,
    );
  });

  it('不存在的 container 应该返回 false', () => {
    const dag = expectDag(buildBranching());
    const { containers } = buildTabsContainers(dag);

    expect(isValidTabSwitch('nonexistent', 'user_b', containers)).toBe(false);
  });
});

// ========================================
// handleBatchTabSwitch 测试
// ========================================

describe('handleBatchTabSwitch', () => {
  it('应该批量应用多个切换', () => {
    const dag = expectDag(buildComplexDag());
    const { containers, map } = buildTabsContainers(dag);

    const childrenContainers = containers.filter((c) => c.type === 'children');

    const updates = childrenContainers.map((c) => ({
      containerId: c.id,
      newTabId: c.userMessages[0].id,
    }));

    const result = handleBatchTabSwitch(updates, containers, dag, map);

    // 所有更新都应该被应用
    for (const update of updates) {
      const container = result.updatedContainers.find(
        (c) => c.id === update.containerId,
      );
      expect(container).toBeDefined();
    }
  });

  it('空更新不应该改变 container 状态', () => {
    const dag = expectDag(buildBranching());
    const { containers, map } = buildTabsContainers(dag);

    const result = handleBatchTabSwitch([], containers, dag, map);

    // 所有 container 的 activeTab 应该保持不变
    for (const container of containers) {
      const resultContainer = result.updatedContainers.find(
        (c) => c.id === container.id,
      );
      expect(resultContainer).toEqual(container);
    }
  });
});

// ========================================
// predictPathAfterTabSwitch 测试
// ========================================

describe('predictPathAfterTabSwitch', () => {
  it('应该预测切换后的路径', () => {
    const dag = expectDag(buildBranching());
    const { containers, map } = buildTabsContainers(dag);

    const childrenContainer = containers.find((c) => c.type === 'children');
    expect(childrenContainer).toBeDefined();
    if (!childrenContainer) return;
    const predictedPath = predictPathAfterTabSwitch(
      childrenContainer.id,
      'user_b',
      containers,
      dag,
      map,
    );

    expect(predictedPath).not.toBeNull();
    if (predictedPath) {
      const pathIds = predictedPath.map((n) => n.id);
      expect(pathIds).toContain('user_b');
    }
  });

  it('无效的切换应该返回 null', () => {
    const dag = expectDag(buildBranching());
    const { containers, map } = buildTabsContainers(dag);

    const childrenContainer = containers.find((c) => c.type === 'children');
    expect(childrenContainer).toBeDefined();
    if (!childrenContainer) return;
    // user_a 不在 container 中
    const predictedPath = predictPathAfterTabSwitch(
      childrenContainer.id,
      'user_a',
      containers,
      dag,
      map,
    );

    expect(predictedPath).toBeNull();
  });
});
