/**
 * ============================================================
 * 对话状态管理器
 * ============================================================
 *
 * 统一管理每个对话的三个核心状态：
 * 1. DAG - 对话的有向无环图结构
 * 2. TabsMap - 消息到 TabsContainer 的映射
 * 3. Path - 当前渲染的对话路径
 *
 * 核心原则：
 * - 每个对话的状态完全独立
 * - 状态的缓存 key 是 dialogueId
 * - 切换对话时直接从缓存读取，无需重建
 */

import { Dag, MessageToTabsMap, ConversationPath } from '../types/dag';

/**
 * 单个对话的完整状态
 */
interface DialogueState {
  dag: Dag | null;
  tabsMap: MessageToTabsMap;
  path: ConversationPath;
}

/**
 * 对话状态管理器类
 *
 * 使用 Map 存储每个对话的状态
 * key: dialogueId
 * value: DialogueState
 */
export class DialogueStateManager {
  private states: Map<string, DialogueState> = new Map();

  // ========================================
  // DAG 管理
  // ========================================

  /**
   * 获取指定对话的 DAG
   * @param dialogueId - 对话 ID
   * @returns DAG，如果不存在则返回 undefined
   */
  getDag(dialogueId: string): Dag | null | undefined {
    const state = this.states.get(dialogueId);
    return state?.dag;
  }

  /**
   * 设置指定对话的 DAG
   * @param dialogueId - 对话 ID
   * @param dag - DAG 对象
   */
  setDag(dialogueId: string, dag: Dag | null): void {
    const state = this.states.get(dialogueId) || this.createEmptyState();
    state.dag = dag;
    this.states.set(dialogueId, state);
  }

  /**
   * 检查是否有指定对话的 DAG 缓存
   * @param dialogueId - 对话 ID
   * @returns 是否存在
   */
  hasDag(dialogueId: string): boolean {
    const state = this.states.get(dialogueId);
    return state !== undefined && state.dag !== null;
  }

  // ========================================
  // TabsMap 管理
  // ========================================

  /**
   * 获取指定对话的 TabsMap
   * @param dialogueId - 对话 ID
   * @returns TabsMap，如果不存在则返回 undefined
   */
  getTabsMap(dialogueId: string): MessageToTabsMap | undefined {
    const state = this.states.get(dialogueId);
    return state?.tabsMap;
  }

  /**
   * 设置指定对话的 TabsMap
   * @param dialogueId - 对话 ID
   * @param tabsMap - TabsMap 对象
   */
  setTabsMap(dialogueId: string, tabsMap: MessageToTabsMap): void {
    const state = this.states.get(dialogueId) || this.createEmptyState();
    state.tabsMap = tabsMap;
    this.states.set(dialogueId, state);
  }

  /**
   * 检查是否有指定对话的 TabsMap 缓存
   * @param dialogueId - 对话 ID
   * @returns 是否存在
   */
  hasTabsMap(dialogueId: string): boolean {
    const state = this.states.get(dialogueId);
    return state !== undefined && state.tabsMap.size > 0;
  }

  // ========================================
  // Path 管理
  // ========================================

  /**
   * 获取指定对话的 Path
   * @param dialogueId - 对话 ID
   * @returns Path，如果不存在则返回 undefined
   */
  getPath(dialogueId: string): ConversationPath | undefined {
    const state = this.states.get(dialogueId);
    return state?.path;
  }

  /**
   * 设置指定对话的 Path
   * @param dialogueId - 对话 ID
   * @param path - Path 对象
   */
  setPath(dialogueId: string, path: ConversationPath): void {
    const state = this.states.get(dialogueId) || this.createEmptyState();
    state.path = path;
    this.states.set(dialogueId, state);
  }

  /**
   * 检查是否有指定对话的 Path 缓存
   * @param dialogueId - 对话 ID
   * @returns 是否存在
   */
  hasPath(dialogueId: string): boolean {
    const state = this.states.get(dialogueId);
    return state !== undefined && state.path.length > 0;
  }

  // ========================================
  // 完整状态管理
  // ========================================

  /**
   * 获取指定对话的完整状态
   * @param dialogueId - 对话 ID
   * @returns 完整状态，如果不存在则返回 undefined
   */
  getState(dialogueId: string): DialogueState | undefined {
    return this.states.get(dialogueId);
  }

  /**
   * 设置指定对话的完整状态
   * @param dialogueId - 对话 ID
   * @param dag - DAG 对象
   * @param tabsMap - TabsMap 对象
   * @param path - Path 对象
   */
  setState(
    dialogueId: string,
    dag: Dag | null,
    tabsMap: MessageToTabsMap,
    path: ConversationPath,
  ): void {
    this.states.set(dialogueId, { dag, tabsMap, path });
  }

  /**
   * 清除指定对话的所有状态
   * @param dialogueId - 对话 ID
   */
  clearDialogue(dialogueId: string): void {
    this.states.delete(dialogueId);
  }

  /**
   * 清除所有对话的状态
   */
  clearAll(): void {
    this.states.clear();
  }

  // ========================================
  // 辅助方法
  // ========================================

  /**
   * 创建空的状态对象
   */
  private createEmptyState(): DialogueState {
    return {
      dag: null,
      tabsMap: new Map(),
      path: [],
    };
  }

  /**
   * 获取当前存储的对话数量
   */
  get size(): number {
    return this.states.size;
  }

  /**
   * 检查是否有指定对话的任何状态
   * @param dialogueId - 对话 ID
   * @returns 是否存在
   */
  hasDialogue(dialogueId: string): boolean {
    return this.states.has(dialogueId);
  }

  /**
   * 验证缓存的 DAG 是否与给定的 rootId 匹配
   * @param dialogueId - 对话 ID
   * @param rootId - 期望的 rootId
   * @returns 是否匹配
   */
  validateDagRoot(dialogueId: string, rootId: string | null): boolean {
    const cachedDag = this.getDag(dialogueId);
    if (!cachedDag) {
      return false;
    }
    return cachedDag.rootId === rootId;
  }

  /**
   * 验证缓存的 Path 是否与给定的 rootId 匹配
   * @param dialogueId - 对话 ID
   * @param rootId - 期望的 rootId
   * @returns 是否匹配
   */
  validatePathRoot(dialogueId: string, rootId: string | null): boolean {
    const cachedPath = this.getPath(dialogueId);
    if (!cachedPath || cachedPath.length === 0) {
      return false;
    }
    return cachedPath[0].id === rootId;
  }
}

/**
 * 全局单例
 *
 * 注意：页面刷新后状态会丢失
 */
export const dialogueStateManager = new DialogueStateManager();

/**
 * React Hook: 使用对话状态管理器
 *
 * 提供类型安全的访问方式
 */
export function useDialogueStateManager() {
  return dialogueStateManager;
}

export default dialogueStateManager;
