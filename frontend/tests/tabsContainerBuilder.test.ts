/**
 * tabsContainerBuilder.ts 单元测试
 *
 * 覆盖：
 * - buildTabsContainers: 从 DAG 构建 tabs containers
 * - updateContainerActiveTab: 更新 activeTab
 * - getContainersByIds / getContainerById: 容器查找
 * - getAllChildrenContainers / getAllParentContainers: 类型过滤
 */

import { describe, it, expect } from 'vitest';
import {
  buildTabsContainers,
  updateContainerActiveTab,
  getContainersByIds,
  getContainerById,
  getAllChildrenContainers,
  getAllParentContainers,
  getContainerForMessageByType,
} from '@/utils/tabsContainerBuilder';
import { buildDag } from '@/utils/dagBuilder';
import { Message } from '@/types';
import { Dag, TabsContainer } from '@/types/dag';

// ========================================
// 测试数据工厂
// ========================================

function makeUserMessage(
  id: string,
  content: string,
  parent_ids: string[] = [],
): Message {
  return { id, content, role: 'user', parent_ids };
}

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

/** 线性对话 */
function buildLinear(): Message[] {
  return [
    makeUserMessage('user_a', 'A'),
    makeAssistantMessage('assistant_a', '回答A', ['user_a']),
    makeUserMessage('user_b', 'B', ['assistant_a']),
    makeAssistantMessage('assistant_b', '回答B', ['user_b']),
  ];
}

/** 分支对话: assistant_a 有 user_b 和 user_c 两个子节点 */
function buildBranching(): Message[] {
  return [
    makeUserMessage('user_a', 'A'),
    makeAssistantMessage('assistant_a', '回答A', ['user_a']),
    makeUserMessage('user_b', 'B', ['assistant_a']),
    makeAssistantMessage('assistant_b', '回答B', ['user_b']),
    makeUserMessage('user_c', 'C', ['assistant_a']),
    makeAssistantMessage('assistant_c', '回答C', ['user_c']),
  ];
}

/** 合并对话: user_d 有两个 parent (assistant_b, assistant_c) */
function buildMerging(): Message[] {
  return [
    makeUserMessage('user_a', 'A'),
    makeAssistantMessage('assistant_a', '回答A', ['user_a']),
    makeUserMessage('user_b', 'B', ['assistant_a']),
    makeAssistantMessage('assistant_b', '回答B', ['user_b']),
    makeUserMessage('user_c', 'C', ['assistant_a']),
    makeAssistantMessage('assistant_c', '回答C', ['user_c']),
    makeUserMessage('user_d', 'D', ['assistant_b', 'assistant_c']),
    makeAssistantMessage('assistant_d', '回答D', ['user_d']),
  ];
}

/** 查找指定类型的 container，断言存在 */
function expectContainerByType(
  containers: TabsContainer[],
  type: 'children' | 'parent',
) {
  const found = containers.find((c) => c.type === type);
  expect(found).toBeDefined();
  return found as TabsContainer;
}

// ========================================
// buildTabsContainers 测试
// ========================================

describe('buildTabsContainers', () => {
  it('线性对话不应该产生任何 container', () => {
    const dag = expectDag(buildLinear());
    const { containers, map } = buildTabsContainers(dag);

    expect(containers).toHaveLength(0);
    expect(map.size).toBe(0);
  });

  it('分支对话应该产生一个 ChildrenTabsContainer', () => {
    const dag = expectDag(buildBranching());
    const { containers } = buildTabsContainers(dag);

    expect(containers).toHaveLength(1);
    expect(containers[0].type).toBe('children');
    expect(containers[0].id).toBe('children-assistant_a');
  });

  it('ChildrenTabsContainer 应该包含所有 user 子节点', () => {
    const dag = expectDag(buildBranching());
    const { containers } = buildTabsContainers(dag);
    const container = expectContainerByType(containers, 'children');

    if (container.type !== 'children')
      throw new Error('Expected children container');
    expect(container.assistantMessageId).toBe('assistant_a');
    expect(container.userMessages).toHaveLength(2);
    const userIds = container.userMessages.map((u) => u.id).sort();
    expect(userIds).toEqual(['user_b', 'user_c']);
  });

  it('ChildrenTabsContainer 默认选中最后一个 tab', () => {
    const dag = expectDag(buildBranching());
    const { containers } = buildTabsContainers(dag);

    // 默认选中最后一个 (user_c)
    expect(containers[0].activeTab).toBe('user_c');
  });

  it('合并对话应该产生一个 ParentTabsContainer', () => {
    const dag = expectDag(buildMerging());
    const { containers } = buildTabsContainers(dag);

    // 有一个 ChildrenTabsContainer (assistant_a 有 b 和 c 两个子节点)
    // 有一个 ParentTabsContainer (user_d 有两个 parent)
    expect(containers).toHaveLength(2);

    const parentContainers = containers.filter((c) => c.type === 'parent');
    expect(parentContainers).toHaveLength(1);
    expect(parentContainers[0].id).toBe('parent-user_d');
  });

  it('ParentTabsContainer 应该包含所有 assistant 父节点', () => {
    const dag = expectDag(buildMerging());
    const { containers } = buildTabsContainers(dag);
    const parentContainer = expectContainerByType(containers, 'parent');

    if (parentContainer.type !== 'parent')
      throw new Error('Expected parent container');
    expect(parentContainer.userMessageId).toBe('user_d');
    expect(parentContainer.assistantMessages).toHaveLength(2);
    const assistantIds = parentContainer.assistantMessages
      .map((a) => a.id)
      .sort();
    expect(assistantIds).toEqual(['assistant_b', 'assistant_c']);
  });

  it('tabsMap 应该正确映射消息到 container ID', () => {
    const dag = expectDag(buildBranching());
    const { containers, map } = buildTabsContainers(dag);

    const containerId = containers[0].id;

    // assistant_a 应该在 map 中
    expect(map.get('assistant_a')).toEqual([containerId]);

    // user_b 和 user_c 应该在 map 中
    expect(map.get('user_b')).toEqual([containerId]);
    expect(map.get('user_c')).toEqual([containerId]);

    // 不在 container 中的消息不应该在 map 中
    expect(map.has('user_a')).toBe(false);
    expect(map.has('assistant_b')).toBe(false);
  });

  it('tabsMap 只存储 container ID，不存储对象引用', () => {
    const dag = expectDag(buildBranching());
    const { map } = buildTabsContainers(dag);

    for (const [, containerIds] of map) {
      for (const id of containerIds) {
        // ID 是字符串，不是对象引用
        expect(typeof id).toBe('string');
      }
    }
  });

  it('空 DAG 应该返回空结果', () => {
    const { containers, map } = buildTabsContainers({
      nodes: new Map(),
      rootId: null,
    });

    expect(containers).toHaveLength(0);
    expect(map.size).toBe(0);
  });
});

// ========================================
// updateContainerActiveTab 测试
// ========================================

describe('updateContainerActiveTab', () => {
  it('应该更新指定 container 的 activeTab', () => {
    const dag = expectDag(buildBranching());
    const { containers } = buildTabsContainers(dag);

    const containerId = containers[0].id;
    const updated = updateContainerActiveTab(containers, containerId, 'user_b');

    expect(updated[0].activeTab).toBe('user_b');
  });

  it('不应该影响其他 container', () => {
    const dag = expectDag(buildMerging());
    const { containers } = buildTabsContainers(dag);

    const childrenContainer = containers.find((c) => c.type === 'children');
    const parentContainer = containers.find((c) => c.type === 'parent');
    expect(childrenContainer).toBeDefined();
    expect(parentContainer).toBeDefined();

    if (!childrenContainer || !parentContainer)
      throw new Error('Containers not found');

    const updated = updateContainerActiveTab(
      containers,
      childrenContainer.id,
      'user_b',
    );

    // parent container 不受影响
    const updatedParent = updated.find((c) => c.id === parentContainer.id);
    expect(updatedParent).toBeDefined();
    if (updatedParent) {
      expect(updatedParent.activeTab).toBe(parentContainer.activeTab);
    }
  });

  it('不存在的 containerId 不应该报错', () => {
    const dag = expectDag(buildBranching());
    const { containers } = buildTabsContainers(dag);

    const updated = updateContainerActiveTab(
      containers,
      'nonexistent',
      'user_b',
    );
    expect(updated).toEqual(containers);
  });
});

// ========================================
// 容器查找测试
// ========================================

describe('getContainersByIds', () => {
  it('应该根据 ID 数组查找 containers', () => {
    const dag = expectDag(buildMerging());
    const { containers } = buildTabsContainers(dag);

    const allIds = containers.map((c) => c.id);
    const found = getContainersByIds(allIds, containers);

    expect(found).toHaveLength(2);
  });

  it('不存在的 ID 应该被忽略', () => {
    const dag = expectDag(buildBranching());
    const { containers } = buildTabsContainers(dag);

    const found = getContainersByIds(
      [containers[0].id, 'nonexistent'],
      containers,
    );
    expect(found).toHaveLength(1);
  });
});

describe('getContainerById', () => {
  it('应该根据 ID 查找 container', () => {
    const dag = expectDag(buildBranching());
    const { containers } = buildTabsContainers(dag);

    const found = getContainerById(containers, containers[0].id);
    expect(found).not.toBeNull();
    if (found) {
      expect(found.id).toBe(containers[0].id);
    }
  });

  it('不存在的 ID 应该返回 null', () => {
    const dag = expectDag(buildBranching());
    const { containers } = buildTabsContainers(dag);

    const found = getContainerById(containers, 'nonexistent');
    expect(found).toBeNull();
  });
});

// ========================================
// 类型过滤测试
// ========================================

describe('getAllChildrenContainers / getAllParentContainers', () => {
  it('应该正确过滤 ChildrenTabsContainer', () => {
    const dag = expectDag(buildMerging());
    const { containers } = buildTabsContainers(dag);

    const childrenContainers = getAllChildrenContainers(containers);
    expect(childrenContainers).toHaveLength(1);
    expect(childrenContainers[0].type).toBe('children');
  });

  it('应该正确过滤 ParentTabsContainer', () => {
    const dag = expectDag(buildMerging());
    const { containers } = buildTabsContainers(dag);

    const parentContainers = getAllParentContainers(containers);
    expect(parentContainers).toHaveLength(1);
    expect(parentContainers[0].type).toBe('parent');
  });
});

describe('getContainerForMessageByType', () => {
  it('应该找到消息所属的指定类型的 container', () => {
    const dag = expectDag(buildMerging());
    const { containers, map } = buildTabsContainers(dag);

    // user_d 属于一个 parent container
    const containerIds = map.get('user_d') || [];
    const parentContainer = getContainerForMessageByType(
      'user_d',
      containerIds,
      containers,
      'parent',
    );

    expect(parentContainer).not.toBeNull();
    if (parentContainer) {
      expect(parentContainer.type).toBe('parent');
    }
  });

  it('如果消息不属于指定类型的 container，应该返回 null', () => {
    const dag = expectDag(buildMerging());
    const { containers, map } = buildTabsContainers(dag);

    // user_b 属于 children container，不属于 parent container
    const containerIds = map.get('user_b') || [];
    const parentContainer = getContainerForMessageByType(
      'user_b',
      containerIds,
      containers,
      'parent',
    );

    expect(parentContainer).toBeNull();
  });
});
