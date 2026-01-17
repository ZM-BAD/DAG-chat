import React from 'react';
import { Message } from '../types';

interface ConversationBranchTabsProps {
  branches: Message[];
  onBranchSelect: (branchId: string) => void;
  selectedBranchId: string;
}

const ConversationBranchTabs: React.FC<ConversationBranchTabsProps> = ({
  branches,
  onBranchSelect,
  selectedBranchId
}) => {
  // 生成标签显示文本，最少显示6个字符，如果超长则截断并添加...
  const getTabLabel = (content: string, index: number) => {
    const maxLength = 15;
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength) + '...';
  };

  if (branches.length <= 1) {
    return null;
  }

  return (
    <div className="conversation-branch-tabs">
      <div className="tabs-container">
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
                src="/assets/branch.svg"
                alt="分支"
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