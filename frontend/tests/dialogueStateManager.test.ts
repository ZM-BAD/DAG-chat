/**
 * dialogueStateManager.ts 单元测试
 *
 * 覆盖 DialogueStateManager 类的完整 API：
 * - DAG 管理: getDag / setDag / hasDag
 * - TabsMap 管理: getTabsMap / setTabsMap / hasTabsMap
 * - Path 管理: getPath / setPath / hasPath
 * - 完整状态: getState / setState
 * - 清理: clearDialogue / clearAll
 * - 验证: validateDagRoot / validatePathRoot
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DialogueStateManager } from '@/utils/dialogueStateManager';
import { buildDag } from '@/utils/dagBuilder';
import { buildTabsContainers } from '@/utils/tabsContainerBuilder';
import { buildPath } from '@/utils/pathBuilder';
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

/** 分支对话消息（会产生 tabsMap） */
function buildBranchingMessages(): Message[] {
  return [
    makeUser('user_a'),
    makeAssistant('assistant_a', ['user_a']),
    makeUser('user_b', ['assistant_a']),
    makeAssistant('assistant_b', ['user_b']),
    makeUser('user_c', ['assistant_a']),
    makeAssistant('assistant_c', ['user_c']),
  ];
}

/** 断言 buildDag 结果非 null，并返回 Dag */
function expectDag(messages: Message[]): Dag {
  const dag = buildDag(messages);
  if (!dag) throw new Error('buildDag returned null');
  return dag;
}

/** 构建完整的对话状态（使用分支结构以产生非空 tabsMap） */
function buildDialogueState() {
  const messages = buildBranchingMessages();
  const dag = expectDag(messages);
  const { containers, map } = buildTabsContainers(dag);
  const path = buildPath(dag, map, containers);
  return { dag, map, path };
}

// ========================================
// DAG 管理测试
// ========================================

describe('DialogueStateManager - DAG 管理', () => {
  let manager: DialogueStateManager;

  beforeEach(() => {
    manager = new DialogueStateManager();
  });

  it('setDag / getDag 应该正确存取', () => {
    const { dag } = buildDialogueState();
    manager.setDag('dlg_1', dag);

    expect(manager.getDag('dlg_1')).toBe(dag);
  });

  it('hasDag 应该正确判断', () => {
    expect(manager.hasDag('dlg_1')).toBe(false);

    const { dag } = buildDialogueState();
    manager.setDag('dlg_1', dag);

    expect(manager.hasDag('dlg_1')).toBe(true);
  });

  it('获取不存在的 DAG 应该返回 undefined', () => {
    expect(manager.getDag('nonexistent')).toBeUndefined();
  });

  it('不同的对话应该独立存储 DAG', () => {
    const { dag: dag1 } = buildDialogueState();
    const { dag: dag2 } = buildDialogueState();

    manager.setDag('dlg_1', dag1);
    manager.setDag('dlg_2', dag2);

    expect(manager.getDag('dlg_1')).toBe(dag1);
    expect(manager.getDag('dlg_2')).toBe(dag2);
  });
});

// ========================================
// TabsMap 管理测试
// ========================================

describe('DialogueStateManager - TabsMap 管理', () => {
  let manager: DialogueStateManager;

  beforeEach(() => {
    manager = new DialogueStateManager();
  });

  it('setTabsMap / getTabsMap 应该正确存取', () => {
    const { map } = buildDialogueState();
    manager.setTabsMap('dlg_1', map);

    expect(manager.getTabsMap('dlg_1')).toBe(map);
  });

  it('hasTabsMap 应该正确判断', () => {
    expect(manager.hasTabsMap('dlg_1')).toBe(false);

    const { map } = buildDialogueState();
    manager.setTabsMap('dlg_1', map);

    expect(manager.hasTabsMap('dlg_1')).toBe(true);
  });

  it('空的 tabsMap 应该返回 false', () => {
    manager.setTabsMap('dlg_1', new Map());

    expect(manager.hasTabsMap('dlg_1')).toBe(false);
  });
});

// ========================================
// Path 管理测试
// ========================================

describe('DialogueStateManager - Path 管理', () => {
  let manager: DialogueStateManager;

  beforeEach(() => {
    manager = new DialogueStateManager();
  });

  it('setPath / getPath 应该正确存取', () => {
    const { path } = buildDialogueState();
    manager.setPath('dlg_1', path);

    expect(manager.getPath('dlg_1')).toBe(path);
  });

  it('hasPath 应该正确判断', () => {
    expect(manager.hasPath('dlg_1')).toBe(false);

    const { path } = buildDialogueState();
    manager.setPath('dlg_1', path);

    expect(manager.hasPath('dlg_1')).toBe(true);
  });

  it('空的 path 应该返回 false', () => {
    manager.setPath('dlg_1', []);

    expect(manager.hasPath('dlg_1')).toBe(false);
  });
});

// ========================================
// 完整状态管理测试
// ========================================

describe('DialogueStateManager - 完整状态管理', () => {
  let manager: DialogueStateManager;

  beforeEach(() => {
    manager = new DialogueStateManager();
  });

  it('setState / getState 应该正确存取', () => {
    const { dag, map, path } = buildDialogueState();
    manager.setState('dlg_1', dag, map, path);

    const state = manager.getState('dlg_1');
    expect(state).toBeDefined();
    if (state) {
      expect(state.dag).toBe(dag);
      expect(state.tabsMap).toBe(map);
      expect(state.path).toBe(path);
    }
  });

  it('获取不存在的状态应该返回 undefined', () => {
    expect(manager.getState('nonexistent')).toBeUndefined();
  });
});

// ========================================
// 清理测试
// ========================================

describe('DialogueStateManager - 清理', () => {
  let manager: DialogueStateManager;

  beforeEach(() => {
    manager = new DialogueStateManager();
  });

  it('clearDialogue 应该只清除指定对话', () => {
    const { dag: dag1, map: map1, path: path1 } = buildDialogueState();
    const { dag: dag2, map: map2, path: path2 } = buildDialogueState();

    manager.setState('dlg_1', dag1, map1, path1);
    manager.setState('dlg_2', dag2, map2, path2);

    manager.clearDialogue('dlg_1');

    expect(manager.hasDialogue('dlg_1')).toBe(false);
    expect(manager.hasDialogue('dlg_2')).toBe(true);
    expect(manager.getDag('dlg_2')).toBe(dag2);
  });

  it('clearAll 应该清除所有对话', () => {
    const { dag, map, path } = buildDialogueState();
    manager.setState('dlg_1', dag, map, path);

    manager.clearAll();

    expect(manager.hasDialogue('dlg_1')).toBe(false);
    expect(manager.size).toBe(0);
  });
});

// ========================================
// 验证测试
// ========================================

describe('DialogueStateManager - 验证', () => {
  let manager: DialogueStateManager;

  beforeEach(() => {
    manager = new DialogueStateManager();
  });

  it('validateDagRoot 应该正确验证', () => {
    const { dag, map, path } = buildDialogueState();
    manager.setState('dlg_1', dag, map, path);

    expect(manager.validateDagRoot('dlg_1', 'user_a')).toBe(true);
    expect(manager.validateDagRoot('dlg_1', 'wrong_root')).toBe(false);
  });

  it('validatePathRoot 应该正确验证', () => {
    const { dag, map, path } = buildDialogueState();
    manager.setState('dlg_1', dag, map, path);

    expect(manager.validatePathRoot('dlg_1', 'user_a')).toBe(true);
    expect(manager.validatePathRoot('dlg_1', 'wrong_root')).toBe(false);
  });

  it('不存在的对话验证应该返回 false', () => {
    expect(manager.validateDagRoot('nonexistent', 'user_a')).toBe(false);
    expect(manager.validatePathRoot('nonexistent', 'user_a')).toBe(false);
  });
});

// ========================================
// size 属性测试
// ========================================

describe('DialogueStateManager - size', () => {
  let manager: DialogueStateManager;

  beforeEach(() => {
    manager = new DialogueStateManager();
  });

  it('空管理器 size 应该为 0', () => {
    expect(manager.size).toBe(0);
  });

  it('添加对话后 size 应该增加', () => {
    const { dag, map, path } = buildDialogueState();
    manager.setState('dlg_1', dag, map, path);

    expect(manager.size).toBe(1);

    const { dag: dag2, map: map2, path: path2 } = buildDialogueState();
    manager.setState('dlg_2', dag2, map2, path2);

    expect(manager.size).toBe(2);
  });
});
