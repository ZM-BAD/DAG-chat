/**
 * 类型定义统一导出
 *
 * 这个文件统一导出所有类型定义
 */

/**
 * ============================================================
 * 第一部分：基础类型（原 types.ts）
 * ============================================================
 */

/**
 * 对话接口
 */
export interface Dialogue {
  id: string;
  user_id: string;
  title: string;
  model: string;
  create_time: string;
  update_time: string;
}

/**
 * 消息接口
 */
export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  thinkingContent?: string; // 思考内容（仅assistant角色使用）
  isThinkingExpanded?: boolean; // 思考内容是否展开（仅assistant角色使用）
  isWaitingForFirstToken?: boolean; // 是否正在等待首token（仅assistant角色使用）
  parent_ids?: string[]; // 父消息ID列表
  children?: string[]; // 子消息ID列表
  model?: string; // 模型名称（仅assistant角色使用）
  deepThinkingEnabled?: boolean; // 是否启用了深度思考模式（仅assistant角色使用）
}

/**
 * API响应接口
 */
export interface ChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * 获取对话历史的响应接口
 */
export interface DialogueHistoryResponse {
  code: number;
  message: string;
  data: Message[];
}

/**
 * 创建消息占位符的响应接口
 */
export interface PlaceholderResponse {
  user_message_id: string;
  assistant_message_id: string;
}

/**
 * 对话列表API响应接口
 */
export interface DialogueListResponse {
  code: number;
  message: string;
  data: {
    list: Dialogue[];
    total: number;
    page: number;
    page_size: number;
  };
}

/**
 * ============================================================
 * 第二部分：DAG 相关类型
 * ============================================================
 */

/**
 * DAG 节点（包含双向引用）
 *
 * 设计说明：
 * - parent_ids: 指向父节点的 ID 数组
 * - children: 指向子节点的引用数组
 * - dag: 所属 DAG 的引用，用于访问全局节点集合
 */
export interface DagNode {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  parent_ids: string[]; // 父节点 ID 列表
  children: DagNode[]; // 子节点引用数组
  dag: Dag; // 所属 DAG 的引用
  model?: string;
  thinkingContent?: string;
  isThinkingExpanded?: boolean;
  deepThinkingEnabled?: boolean;
  isWaitingForFirstToken?: boolean;
}

/**
 * DAG 结构
 *
 * 包含对话的所有消息节点及其关系
 * 每个 DAG 有且仅有一个根节点（没有 parent_ids 的用户消息）
 */
export interface Dag {
  nodes: Map<string, DagNode>; // 所有节点的 ID -> 节点映射
  rootId: string | null; // 根节点 ID（唯一）
}

/**
 * ============================================================
 * 第三部分：Tabs Container 类型定义
 * ============================================================
 */

/**
 * Tabs Container 基类
 */
export interface BaseTabsContainer {
  id: string; // container 唯一标识
  activeTab: string; // 当前选中的 tab (message id)
}

/**
 * Children Tabs Container
 *
 * 管理同一个 assistant.message 下的多个 user.message 分支
 */
export interface ChildrenTabsContainer extends BaseTabsContainer {
  type: 'children';
  assistantMessageId: string; // 共同的父节点 (assistant)
  userMessages: DagNode[]; // 子节点列表 (user messages，引用)
}

/**
 * Parent Tabs Container
 *
 * 管理指向同一个 user.message 的多个 assistant.message
 */
export interface ParentTabsContainer extends BaseTabsContainer {
  type: 'parent';
  userMessageId: string; // 共同的子节点 (user)
  assistantMessages: DagNode[]; // 父节点列表 (assistant messages，引用)
}

/**
 * Tabs Container 联合类型
 */
export type TabsContainer = ChildrenTabsContainer | ParentTabsContainer;

/**
 * ============================================================
 * 第四部分：Map 和路径定义
 * ============================================================
 */

/**
 * Message ID 到 Tabs Container IDs 的映射
 */
export type MessageToTabsMap = Map<string, string[]>;

/**
 * 对话路径（从根到叶子的线性序列）
 */
export type ConversationPath = DagNode[];

/**
 * ============================================================
 * 第五部分：辅助类型和接口
 * ============================================================
 */

/**
 * Tabs Container 构建结果
 */
export interface TabsContainerBuildResult {
  containers: TabsContainer[];
  map: MessageToTabsMap;
}

/**
 * Tab 切换结果
 */
export interface TabSwitchResult {
  updatedContainers: TabsContainer[];
  updatedTabsMap: MessageToTabsMap;
  newPath: ConversationPath;
}

/**
 * DAG 验证结果
 */
export interface DagValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 从 Message 转换为 DagNode（部分字段）
 */
export type MessageToDagNodeInput = Omit<
  DagNode,
  'children' | 'dag' | 'parent_ids'
> & {
  parent_ids?: string[];
};

/**
 * ============================================================
 * 第六部分：类型守卫
 * ============================================================
 */

/**
 * 类型守卫：判断是否是 ChildrenTabsContainer
 */
export function isChildrenTabsContainer(
  container: TabsContainer,
): container is ChildrenTabsContainer {
  return container.type === 'children';
}

/**
 * 类型守卫：判断是否是 ParentTabsContainer
 */
export function isParentTabsContainer(
  container: TabsContainer,
): container is ParentTabsContainer {
  return container.type === 'parent';
}
