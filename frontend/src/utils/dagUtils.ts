/**
 * ============================================================
 * DAG 工具函数统一导出
 * ============================================================
 *
 * 这个文件统一导出所有 DAG 相关的工具函数，
 * 方便其他模块引用
 */

// ============ DAG 构建相关 ============
export {
  buildDag,
  validateDag,
  hasCycle,
  getRootNode,
  getParents,
  getChildren,
  isBranchingPoint,
  isMergePoint,
  dagNodeToMessage,
  flattenDagToMessages,
} from './dagBuilder';

// ============ Tabs Container 构建相关 ============
export {
  buildTabsContainers,
  updateContainerActiveTab,
  getContainersByIds,
  getContainersForMessage,
  getContainerForMessageByType,
  isMessageInContainer,
  getAllChildrenContainers,
  getAllParentContainers,
  getContainerById,
} from './tabsContainerBuilder';

// ============ 路径构建相关 ============
export {
  buildPath,
  buildPathWithContainers,
  getPathToNode,
  isPathValid,
  getPathLeaf,
  getPathRoot,
  pathContainsNode,
  getNodeIndexInPath,
  getSubPathAfterNode,
  getSubPathBeforeNode,
  // 新增：双向遍历函数
  buildPathToRoot,
  buildPathToLeaf,
  buildPathFromNodeToTarget,
  mergePaths,
  // 新增：校验函数
  validatePathContainerConsistency,
  logValidationResult,
  // 新增：路径比较函数
  arePathsEqual,
} from './pathBuilder';

// 新增：校验结果类型导出
export type { PathContainerValidationResult } from './pathBuilder';

// ============ Tab 切换处理相关 ============
export {
  handleTabSwitch,
  isValidTabSwitch,
  handleBatchTabSwitch,
  predictPathAfterTabSwitch,
} from './tabSwitchHandler';

// ============ 类型导出 ============
export type {
  DagNode,
  Dag,
  BaseTabsContainer,
  ChildrenTabsContainer,
  ParentTabsContainer,
  TabsContainer,
  MessageToTabsMap,
  ConversationPath,
  TabsContainerBuildResult,
  TabSwitchResult,
  DagValidationResult,
  MessageToDagNodeInput,
} from '../types/dag';

export { isChildrenTabsContainer, isParentTabsContainer } from '../types/dag';
