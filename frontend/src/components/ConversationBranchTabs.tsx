import React from 'react';
import { Message } from '../types';
import { DagNode } from '../utils/conversationDag';

interface ConversationBranchTabsProps {
  branches: (Message | DagNode)[];
  onBranchSelect: (branchId: string) => void;
  selectedBranchId: string;
  iconType?: 'branch' | 'merge';
}

const ConversationBranchTabs: React.FC<ConversationBranchTabsProps> = ({
  branches,
  onBranchSelect,
  selectedBranchId,
  iconType = 'branch',
}) => {
  // 生成标签显示文本，最少显示6个字符，如果超长则截断并添加...
  const getTabLabel = (content: string, _index: number) => {
    const maxLength = 15;
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength) + '...';
  };

  if (branches.length <= 1) {
    return null;
  }

  const containerClass =
    iconType === 'merge' ? 'parent-tabs-container' : 'children-tabs-container';

  return (
    <div className={`conversation-branch-tabs ${containerClass}`}>
      <div className="tabs-list">
        {branches.map((branch, index) => (
          <button
            key={branch.id}
            className={`branch-tab ${selectedBranchId === branch.id ? 'active' : ''}`}
            onClick={() => {
              console.log('Branch tab clicked:', branch.id, branch.content);
              onBranchSelect(branch.id);
            }}
            title={branch.content}
          >
            <span className="tab-label">
              <img
                src={`/assets/${iconType}.svg`}
                alt={iconType === 'merge' ? '合并' : '分支'}
                className="branch-icon"
              />
              {getTabLabel(branch.content, index)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ConversationBranchTabs;
