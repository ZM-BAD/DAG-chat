/**
 * TabsContainer 渲染组件
 *
 * 用于渲染 children-tabs-container 和 parent-tabs-container
 * 沿用现有 ConversationBranchTabs 的样式和结构
 */

import { FC } from 'react';
import {
  TabsContainer,
  ChildrenTabsContainer,
  ParentTabsContainer,
  isChildrenTabsContainer,
  isParentTabsContainer,
} from '../utils/dagUtils';

interface TabsComponentProps {
  container: TabsContainer;
  onTabClick: (containerId: string, tabId: string) => void;
}

/**
 * 统一的 TabsContainer 渲染组件
 */
export const TabsComponent: FC<TabsComponentProps> = ({
  container,
  onTabClick,
}) => {
  if (isChildrenTabsContainer(container)) {
    return (
      <ChildrenTabsComponent container={container} onTabClick={onTabClick} />
    );
  }

  if (isParentTabsContainer(container)) {
    return (
      <ParentTabsComponent container={container} onTabClick={onTabClick} />
    );
  }

  console.warn('未知的 container 类型:', container);
  return null;
};

/**
 * 生成标签显示文本
 * 至少显示 15 个字符，如果超长则截断并添加...
 */
const getTabLabel = (content: string): string => {
  const maxLength = 15;
  if (content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength) + '...';
};

/**
 * ChildrenTabsContainer 渲染组件
 *
 * 渲染同一个 assistant 下的多个 user 分支
 * 沿用 conversation-branch-tabs children-tabs-container 样式
 */
const ChildrenTabsComponent: FC<{
  container: ChildrenTabsContainer;
  onTabClick: (containerId: string, tabId: string) => void;
}> = ({ container, onTabClick }) => {
  // 如果只有一个分支，不显示 tabs
  if (container.userMessages.length <= 1) {
    return null;
  }

  return (
    <div
      id={container.id}
      className="conversation-branch-tabs children-tabs-container"
    >
      <div className="tabs-list">
        {container.userMessages.map((userNode) => (
          <button
            key={userNode.id}
            className={`branch-tab ${
              userNode.id === container.activeTab ? 'active' : ''
            }`}
            onClick={() => {
              console.log('Branch tab clicked:', userNode.id, userNode.content);
              onTabClick(container.id, userNode.id);
            }}
            title={userNode.content}
          >
            <span className="tab-label">
              <img
                src="/assets/branch.svg"
                alt="分支"
                className="branch-icon"
              />
              {getTabLabel(userNode.content)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * ParentTabsContainer 渲染组件
 *
 * 渲染指向同一个 user 的多个 assistant
 * 沿用 conversation-branch-tabs parent-tabs-container 样式
 */
const ParentTabsComponent: FC<{
  container: ParentTabsContainer;
  onTabClick: (containerId: string, tabId: string) => void;
}> = ({ container, onTabClick }) => {
  // 如果只有一个来源，不显示 tabs
  if (container.assistantMessages.length <= 1) {
    return null;
  }

  return (
    <div
      id={container.id}
      className="conversation-branch-tabs parent-tabs-container"
    >
      <div className="tabs-list">
        {container.assistantMessages.map((assistantNode) => (
          <button
            key={assistantNode.id}
            className={`branch-tab ${
              assistantNode.id === container.activeTab ? 'active' : ''
            }`}
            onClick={() => {
              console.log(
                'Merge tab clicked:',
                assistantNode.id,
                assistantNode.content,
              );
              onTabClick(container.id, assistantNode.id);
            }}
            title={`模型: ${assistantNode.model || '未知'}`}
          >
            <span className="tab-label">
              <img src="/assets/merge.svg" alt="合并" className="branch-icon" />
              {getTabLabel(assistantNode.content)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default TabsComponent;
