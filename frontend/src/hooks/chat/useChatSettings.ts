import { useState } from 'react';

interface UseChatSettingsReturn {
  deepThinkingEnabled: boolean;
  searchEnabled: boolean;
  branchParentId: string | null;
  branchParentContent: string;
  handleDeepThinkingChange: (enabled: boolean) => void;
  handleSearchChange: (enabled: boolean) => void;
  handleBranchClick: (parentId: string, parentContent: string) => void;
  clearBranchState: () => void;
}

export const useChatSettings = (): UseChatSettingsReturn => {
  const [deepThinkingEnabled, setDeepThinkingEnabled] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [branchParentId, setBranchParentId] = useState<string | null>(null);
  const [branchParentContent, setBranchParentContent] = useState<string>('');

  // 处理分支问按钮点击
  const handleBranchClick = (parentId: string, parentContent: string): void => {
    // 分支问只能有一个parent_id，覆盖之前的值
    setBranchParentId(parentId);
    setBranchParentContent(parentContent);
  };

  // 清除分支问状态
  const clearBranchState = (): void => {
    setBranchParentId(null);
    setBranchParentContent('');
  };

  // 处理深度思考模式切换
  const handleDeepThinkingChange = (enabled: boolean): void => {
    setDeepThinkingEnabled(enabled);
    console.log('深度思考模式:', enabled ? '开启' : '关闭');
  };

  // 处理联网搜索切换
  const handleSearchChange = (enabled: boolean): void => {
    setSearchEnabled(enabled);
    console.log('联网搜索:', enabled ? '开启' : '关闭');
  };

  return {
    deepThinkingEnabled,
    searchEnabled,
    branchParentId,
    branchParentContent,
    handleDeepThinkingChange,
    handleSearchChange,
    handleBranchClick,
    clearBranchState
  };
};