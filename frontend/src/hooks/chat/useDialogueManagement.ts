import { useState, useCallback } from 'react';
import { Message } from '../../types';

interface UseDialogueManagementReturn {
  currentDialogueId: string | null;
  handleDialogueSelect: (dialogueId: string) => Promise<void>;
  handleNewDialogue: () => void;
}

export const useDialogueManagement = (): UseDialogueManagementReturn => {
  const [currentDialogueId, setCurrentDialogueId] = useState<string | null>(null);

  // 处理对话选择
  const handleDialogueSelect = useCallback(async (dialogueId: string) => {
    setCurrentDialogueId(dialogueId);
  }, []);

  // 处理新建对话
  const handleNewDialogue = () => {
    setCurrentDialogueId(null);
  };

  return {
    currentDialogueId,
    handleDialogueSelect,
    handleNewDialogue
  };
};