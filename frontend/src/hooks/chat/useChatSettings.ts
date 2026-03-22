import { useState } from 'react';

// 引用类型
export type CitationType = 'branch' | 'merge';

// 单个引用
export interface Citation {
  id: string;
  content: string;
  type: CitationType;
}

interface UseChatSettingsReturn {
  deepThinkingEnabled: boolean;
  searchEnabled: boolean;
  citations: Citation[];
  handleDeepThinkingChange: (enabled: boolean) => void;
  handleSearchChange: (enabled: boolean) => void;
  handleBranchClick: (parentId: string, parentContent: string) => void;
  handleMergeClick: (parentId: string, parentContent: string) => void;
  removeCitation: (id: string) => void;
  clearAllCitations: () => void;
  getCitationMode: () => 'none' | 'branch' | 'merge';
}

export const useChatSettings = (): UseChatSettingsReturn => {
  const [deepThinkingEnabled, setDeepThinkingEnabled] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [citations, setCitations] = useState<Citation[]>([]);

  // 获取当前引用模式
  const getCitationMode = (): 'none' | 'branch' | 'merge' => {
    if (citations.length === 0) return 'none';
    return citations[0].type;
  };

  // 处理分支问按钮点击
  // branch 模式：单一引用，覆盖之前的内容
  const handleBranchClick = (parentId: string, parentContent: string): void => {
    setCitations([
      {
        id: parentId,
        content: parentContent,
        type: 'branch',
      },
    ]);
  };

  // 处理合并问按钮点击
  // merge 模式：多引用，添加到列表（去重）
  const handleMergeClick = (parentId: string, parentContent: string): void => {
    setCitations((prev) => {
      // 如果当前是 branch 模式，切换到 merge 模式
      if (prev.length > 0 && prev[0].type === 'branch') {
        return [
          {
            id: parentId,
            content: parentContent,
            type: 'merge',
          },
        ];
      }

      // merge 模式：检查是否已存在
      const exists = prev.some((c) => c.id === parentId);
      if (exists) {
        return prev; // 已存在，不重复添加
      }

      // 添加新的 merge 引用
      return [
        ...prev,
        {
          id: parentId,
          content: parentContent,
          type: 'merge',
        },
      ];
    });
  };

  // 移除指定引用
  const removeCitation = (id: string): void => {
    setCitations((prev) => prev.filter((c) => c.id !== id));
  };

  // 清除所有引用状态
  const clearAllCitations = (): void => {
    setCitations([]);
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
    citations,
    handleDeepThinkingChange,
    handleSearchChange,
    handleBranchClick,
    handleMergeClick,
    removeCitation,
    clearAllCitations,
    getCitationMode,
  };
};
