import { useCallback } from 'react';
import { useDialogueManagement } from './useDialogueManagement';
import { useChatMessages } from './useChatMessages';
import { useChatSettings, Citation } from './useChatSettings';
import { useModelSelection } from './useModelSelection';

// 重新组合所有hook，保持原有API不变
export const useChat = () => {
  // 1. 对话管理
  const {
    currentDialogueId,
    handleDialogueSelect: handleDialogueSelectBase,
    handleNewDialogue,
  } = useDialogueManagement();

  // 2. 模型选择
  const { selectedModel, availableModels, handleModelChange } =
    useModelSelection();

  // 3. 聊天设置
  const {
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
  } = useChatSettings();

  // 4. 聊天消息管理
  const {
    messages,
    inputMessage,
    isLoading,
    textareaRef,
    shouldShowWelcome,
    handleSendMessage,
    handleKeyPress,
    handleInputChange,
    toggleThinkingExpansion,
    copyMessageToClipboard,
    handleInterruptResponse,
    messagesDialogueId,
  } = useChatMessages({
    currentDialogueId,
    selectedModel,
    deepThinkingEnabled,
    searchEnabled,
    citations,
    clearAllCitations,
  });

  // 5. 扩展对话选择功能
  // 切换对话时，清除引用关系
  const handleDialogueSelect = useCallback(
    (dialogueId: string) => {
      handleDialogueSelectBase(dialogueId);
      clearAllCitations(); // 切换对话时清除引用关系
    },
    [handleDialogueSelectBase, clearAllCitations],
  );

  // 6. 导出所有状态和方法，保持原有API不变
  return {
    messages,
    inputMessage,
    isLoading,
    currentDialogueId,
    textareaRef,
    shouldShowWelcome,
    handleSendMessage,
    handleKeyPress,
    handleInputChange,
    handleDialogueSelect,
    handleNewDialogue,
    toggleThinkingExpansion,
    copyMessageToClipboard,
    handleInterruptResponse,
    deepThinkingEnabled,
    searchEnabled,
    selectedModel,
    availableModels,
    handleDeepThinkingChange,
    handleSearchChange,
    handleModelChange,
    // 新的引用系统
    citations,
    handleBranchClick,
    handleMergeClick,
    removeCitation,
    clearAllCitations,
    getCitationMode,
    messagesDialogueId,
  };
};

// 导出类型供外部使用
export type { Citation };
