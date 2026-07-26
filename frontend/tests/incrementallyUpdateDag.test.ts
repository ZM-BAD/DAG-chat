/**
 * incrementallyUpdateDag.ts 单元测试
 *
 * 覆盖：
 * - incrementallyUpdateDag: 增量更新 DAG（normal/branch/merge 三种场景）
 * - 验证增量更新与全量重建结果一致
 */

import { describe, it, expect } from 'vitest';
import { incrementallyUpdateDag } from '@/utils/incrementallyUpdateDag';
import { buildDag } from '@/utils/dagBuilder';
import { buildTabsContainers } from '@/utils/tabsContainerBuilder';
import { buildPath } from '@/utils/pathBuilder';
import { Message, Dag, DagNode } from '@/types';

// ========================================
// 测试数据工厂
// ========================================

function makeUser(id: string, parent_ids: string[] = []): Message {
  return { id, content: `${id}内容`, role: 'user', parent_ids };
}

function makeAssistant(id: string, parent_ids: string[] = []): Message {
  return { id, content: `${id}内容`, role: 'assistant', parent_ids };
}

/** 初始线性对话 */
function buildInitialMessages(): Message[] {
  return [
    makeUser('user_a'),
    makeAssistant('assistant_a', ['user_a']),
    makeUser('user_b', ['assistant_a']),
    makeAssistant('assistant_b', ['user_b']),
  ];
}

/** 断言 dag 不为 null并返回 */
function expectDag(dag: Dag | null): Dag {
  if (!dag) throw new Error('buildDag returned null');
  return dag;
}

/** 断言节点存在并返回 */
function expectNode(dag: Dag, id: string): DagNode {
  const node = dag.nodes.get(id);
  if (!node) throw new Error(`Node ${id} not found`);
  return node;
}

/** 构建初始状态 */
function buildInitialState() {
  const messages = buildInitialMessages();
  const dag = expectDag(buildDag(messages));
  const { containers, map } = buildTabsContainers(dag);
  const path = buildPath(dag, map, containers);
  return { dag, containers, map, path };
}

// ========================================
// normal 场景测试
// ========================================

describe('incrementallyUpdateDag - normal 场景', () => {
  it('应该在路径末尾追加新节点', () => {
    const { dag, containers, map, path } = buildInitialState();

    const newUser = makeUser('user_c', ['assistant_b']);
    const newAssistant = makeAssistant('assistant_c', ['user_c']);

    const result = incrementallyUpdateDag(
      dag,
      containers,
      map,
      path,
      [newUser, newAssistant],
      'normal',
    );

    expect(result.success).toBe(true);
    const resultDag = expectDag(result.dag);
    expect(resultDag.nodes.size).toBe(6); // 原有 4 + 新增 2
    expect(result.path.length).toBe(6); // 原有 4 + 新增 2
    expect(result.path[result.path.length - 2].id).toBe('user_c');
    expect(result.path[result.path.length - 1].id).toBe('assistant_c');
  });

  it('应该正确建立双向引用', () => {
    const { dag, containers, map, path } = buildInitialState();

    const newUser = makeUser('user_c', ['assistant_b']);
    const newAssistant = makeAssistant('assistant_c', ['user_c']);

    const result = incrementallyUpdateDag(
      dag,
      containers,
      map,
      path,
      [newUser, newAssistant],
      'normal',
    );

    // assistant_b 的 children 应该包含 user_c
    const resultDag = expectDag(result.dag);
    const assistantB = expectNode(resultDag, 'assistant_b');
    const childIds = assistantB.children.map((c) => c.id);
    expect(childIds).toContain('user_c');

    // user_c 的 parent_ids 应该包含 assistant_b
    const userC = expectNode(resultDag, 'user_c');
    expect(userC.parent_ids).toContain('assistant_b');
  });
});

// ========================================
// branch 场景测试
// ========================================

describe('incrementallyUpdateDag - branch 场景', () => {
  it('应该创建分支并创建 ChildrenTabsContainer', () => {
    // 构建一个已有分支点的 DAG: assistant_a 已有 user_b
    const messages = buildInitialMessages();
    const dag = expectDag(buildDag(messages));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPath(dag, map, containers);

    // 从 assistant_a 分支（它已有 user_b 作为子节点）
    const newUser = makeUser('user_c', ['assistant_a']);
    const newAssistant = makeAssistant('assistant_c', ['user_c']);

    const result = incrementallyUpdateDag(
      dag,
      containers,
      map,
      path,
      [newUser, newAssistant],
      'branch',
    );

    expect(result.success).toBe(true);

    // 应该创建 ChildrenTabsContainer
    const childrenContainers = result.containers.filter(
      (c) => c.type === 'children',
    );
    expect(childrenContainers.length).toBeGreaterThan(0);

    const container = childrenContainers[0];
    expect(container.assistantMessageId).toBe('assistant_a');
    expect(container.userMessages.length).toBeGreaterThanOrEqual(2);
  });

  it('branch 场景应该更新 tabsMap', () => {
    const messages = buildInitialMessages();
    const dag = expectDag(buildDag(messages));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPath(dag, map, containers);

    const newUser = makeUser('user_c', ['assistant_a']);
    const newAssistant = makeAssistant('assistant_c', ['user_c']);

    const result = incrementallyUpdateDag(
      dag,
      containers,
      map,
      path,
      [newUser, newAssistant],
      'branch',
    );

    // 新节点应该在 tabsMap 中
    expect(result.tabsMap.has('user_c')).toBe(true);
  });
});

// ========================================
// merge 场景测试
// ========================================

describe('incrementallyUpdateDag - merge 场景', () => {
  it('应该创建合并点并创建 ParentTabsContainer', () => {
    // 构建一个有分支的 DAG
    const messages = [
      ...buildInitialMessages(),
      makeUser('user_c', ['assistant_b']),
      makeAssistant('assistant_c', ['user_c']),
    ];
    const dag = expectDag(buildDag(messages));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPath(dag, map, containers);

    // user_d 合并了 assistant_b 和 assistant_c
    const newUser = makeUser('user_d', ['assistant_b', 'assistant_c']);
    const newAssistant = makeAssistant('assistant_d', ['user_d']);

    const result = incrementallyUpdateDag(
      dag,
      containers,
      map,
      path,
      [newUser, newAssistant],
      'merge',
    );

    expect(result.success).toBe(true);

    // 应该创建 ParentTabsContainer
    const parentContainers = result.containers.filter(
      (c) => c.type === 'parent',
    );
    expect(parentContainers.length).toBeGreaterThan(0);

    const parentContainer = parentContainers[0];
    expect(parentContainer.userMessageId).toBe('user_d');
    expect(parentContainer.assistantMessages.length).toBe(2);
  });

  it('合并点的 parent_ids 应该正确', () => {
    const messages = [
      ...buildInitialMessages(),
      makeUser('user_c', ['assistant_b']),
      makeAssistant('assistant_c', ['user_c']),
    ];
    const dag = expectDag(buildDag(messages));
    const { containers, map } = buildTabsContainers(dag);
    const path = buildPath(dag, map, containers);

    const newUser = makeUser('user_d', ['assistant_b', 'assistant_c']);
    const newAssistant = makeAssistant('assistant_d', ['user_d']);

    const result = incrementallyUpdateDag(
      dag,
      containers,
      map,
      path,
      [newUser, newAssistant],
      'merge',
    );

    const resultDag = expectDag(result.dag);
    const userD = expectNode(resultDag, 'user_d');
    expect(userD.parent_ids).toEqual(['assistant_b', 'assistant_c']);
  });
});

// ========================================
// 边界情况测试
// ========================================

describe('incrementallyUpdateDag - 边界情况', () => {
  it('无效输入应该降级到全量重建', () => {
    const { dag, containers, map, path } = buildInitialState();

    // 只传一个消息（无效输入）
    const newUser = makeUser('user_c', ['assistant_b']);

    const result = incrementallyUpdateDag(
      dag,
      containers,
      map,
      path,
      [newUser],
      'normal',
    );

    // 应该降级到 fullRebuild
    expect(result.success).toBe(true);
  });

  it('null DAG 应该降级到全量重建', () => {
    const newUser = makeUser('user_a');
    const newAssistant = makeAssistant('assistant_a', ['user_a']);

    const result = incrementallyUpdateDag(
      null,
      [],
      new Map(),
      [],
      [newUser, newAssistant],
      'normal',
    );

    expect(result.success).toBe(true);
    const dag = expectDag(result.dag);
    expect(dag.nodes.size).toBe(2);
  });

  it('空路径应该降级到全量重建', () => {
    const { dag, containers, map } = buildInitialState();

    const newUser = makeUser('user_c', ['assistant_b']);
    const newAssistant = makeAssistant('assistant_c', ['user_c']);

    const result = incrementallyUpdateDag(
      dag,
      containers,
      map,
      [],
      [newUser, newAssistant],
      'normal',
    );

    expect(result.success).toBe(true);
  });
});

// ========================================
// 全量重建一致性测试
// ========================================

describe('incrementallyUpdateDag - 全量重建一致性', () => {
  it('normal 增量结果应该与全量重建一致', () => {
    const { dag, containers, map, path } = buildInitialState();

    const newUser = makeUser('user_c', ['assistant_b']);
    const newAssistant = makeAssistant('assistant_c', ['user_c']);

    const incrementalResult = incrementallyUpdateDag(
      dag,
      containers,
      map,
      path,
      [newUser, newAssistant],
      'normal',
    );

    // 全量重建
    const allMessages = [
      ...buildInitialMessages(),
      { ...newUser, children: ['assistant_c'] },
      { ...newAssistant, parent_ids: ['user_c'] },
    ];
    const fullDag = expectDag(buildDag(allMessages));
    const { containers: fullContainers, map: fullMap } =
      buildTabsContainers(fullDag);
    const fullPath = buildPath(fullDag, fullMap, fullContainers);

    // 节点数量应该一致
    const incrementalDag = expectDag(incrementalResult.dag);
    expect(incrementalDag.nodes.size).toBe(fullDag.nodes.size);

    // 路径长度应该一致
    expect(incrementalResult.path.length).toBe(fullPath.length);
  });
});
