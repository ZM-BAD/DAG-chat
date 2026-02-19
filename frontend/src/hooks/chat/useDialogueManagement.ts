import { useState, useCallback, useEffect } from 'react';

// 定义对话创建事件详情接口
interface DialogueCreatedEventDetail {
  conversationId: string;
  title: string;
}

interface UseDialogueManagementReturn {
  currentDialogueId: string | null;
  handleDialogueSelect: (dialogueId: string) => void;
  handleNewDialogue: () => void;
}

export const useDialogueManagement = (): UseDialogueManagementReturn => {
  const [currentDialogueId, setCurrentDialogueId] = useState<string | null>(
    null,
  );

  // 处理对话选择
  const handleDialogueSelect = useCallback((dialogueId: string): void => {
    setCurrentDialogueId(dialogueId);
  }, []);

  // 处理新建对话
  const handleNewDialogue = useCallback((): void => {
    setCurrentDialogueId(null);
  }, []);

  // 监听新对话创建事件，自动切换到新创建的对话
  useEffect(() => {
    const handleDialogueCreated = (event: Event): void => {
      const customEvent = event as CustomEvent<DialogueCreatedEventDetail>;
      const { conversationId } = customEvent.detail;

      // 更新当前对话ID为新创建的对话ID
      setCurrentDialogueId(conversationId);
    };

    // 添加事件监听器
    window.addEventListener(
      'dialogueCreated',
      handleDialogueCreated as EventListener,
    );

    // 清理事件监听器
    return () => {
      window.removeEventListener(
        'dialogueCreated',
        handleDialogueCreated as EventListener,
      );
    };
  }, []);

  return {
    currentDialogueId,
    handleDialogueSelect,
    handleNewDialogue,
  };
};
