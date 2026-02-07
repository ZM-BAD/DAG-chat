import { useCallback } from 'react';
import { useDialogueManagement } from './useDialogueManagement';
import { useChatMessages } from './useChatMessages';
import { useChatSettings } from './useChatSettings';
import { useModelSelection } from './useModelSelection';

// 重新组合所有hook，保持原有API不变
export const useChat = () => {
  // 1. 对话管理
  const {
    currentDialogueId,
    handleDialogueSelect: handleDialogueSelectBase,
    handleNewDialogue
  } = useDialogueManagement();

  // 2. 模型选择
  const {
    selectedModel,
    availableModels,
    handleModelChange
  } = useModelSelection();

  // 3. 聊天设置
  const {
    deepThinkingEnabled,
    searchEnabled,
    branchParentId,
    branchParentContent,
    handleDeepThinkingChange,
    handleSearchChange,
    handleBranchClick,
    clearBranchState
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
    branchQuestionInfo
  } = useChatMessages({
    currentDialogueId,
    selectedModel,
    deepThinkingEnabled,
    searchEnabled,
    branchParentId,
    clearBranchState
  });

  // 5. 扩展对话选择功能
  // 注意：对话历史现在由 useChatMessages hook 自动加载，无需在此处手动获取
  const handleDialogueSelect = useCallback(async (dialogueId: string) => {
    await handleDialogueSelectBase(dialogueId);
  }, [handleDialogueSelectBase]);

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
    branchParentId,
    branchParentContent,
    handleBranchClick,
    clearBranchState,
    branchQuestionInfo
  };
};