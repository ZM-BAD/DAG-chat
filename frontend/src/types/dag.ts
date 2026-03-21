/**
 * DAG 类型定义
 *
 * @deprecated 请直接从 'types/index' 或 'types' 导入
 * 这个文件保留是为了向后兼容
 */

export {
  // 基础类型
  type Dialogue,
  type Message,
  type ChatResponse,
  type DialogueHistoryResponse,
  type DialogueListResponse,
  // DAG 节点和图结构
  type DagNode,
  type Dag,
  // Tabs Container 类型
  type BaseTabsContainer,
  type ChildrenTabsContainer,
  type ParentTabsContainer,
  type TabsContainer,
  // Map 和路径定义
  type MessageToTabsMap,
  type ConversationPath,
  // 辅助类型
  type TabsContainerBuildResult,
  type TabSwitchResult,
  type DagValidationResult,
  type MessageToDagNodeInput,
  // 类型守卫
  isChildrenTabsContainer,
  isParentTabsContainer,
} from './index';
