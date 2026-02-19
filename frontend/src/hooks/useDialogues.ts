import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Dialogue, DialogueListResponse } from '../types';
import { API_ENDPOINTS, API_CONFIG, buildApiUrl } from '../config/api';

// 定义对话创建事件详情接口
interface DialogueCreatedEventDetail {
  conversationId: string;
  title: string;
}

// 定义标题更新事件详情接口
interface TitleUpdatedEventDetail {
  conversationId: string;
  newTitle: string;
}

// 定义对话更新事件详情接口
interface DialogueUpdatedEventDetail {
  conversationId: string;
  model: string;
}

export const useDialogues = () => {
  const { t } = useTranslation();
  const [dialogues, setDialogues] = useState<Dialogue[]>([]);

  // 获取对话列表
  useEffect(() => {
    const fetchDialogues = async (): Promise<void> => {
      const maxRetries = 5;
      let retryCount = 0;

      const waitForRetry = (delay: number): Promise<void> => {
        return new Promise((resolve) => {
          setTimeout(resolve, delay);
        });
      };

      while (retryCount < maxRetries) {
        try {
          const response = await axios.get<DialogueListResponse>(
            buildApiUrl(API_ENDPOINTS.DIALOGUE_LIST),
            {
              params: {
                user_id: API_CONFIG.defaultUserId,
                page: 1,
                page_size: 100, // 获取足够多的对话
              },
            },
          );

          if (response.data.code === 0) {
            setDialogues(response.data.data.list);
            return; // 成功获取数据后退出
          }
        } catch (error) {
          retryCount++;
          console.error(
            `获取对话列表失败 (尝试 ${String(retryCount)}/${String(maxRetries)}):`,
            error,
          );

          if (retryCount < maxRetries) {
            // 等待一段时间后重试，使用指数退避
            await waitForRetry(1000 * retryCount);
          } else {
            console.error('获取对话列表失败，使用模拟数据');
            // 如果所有重试都失败，使用模拟数据
            setDialogues([]);
          }
        }
      }
    };

    // 延迟1秒再开始获取数据，给后端更多启动时间
    const timer = setTimeout(() => {
      void fetchDialogues();
    }, 1000);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  // 更新对话列表
  const refreshDialogues = async (): Promise<void> => {
    try {
      const response = await axios.get<DialogueListResponse>(
        buildApiUrl(API_ENDPOINTS.DIALOGUE_LIST),
        {
          params: {
            user_id: API_CONFIG.defaultUserId,
            page: 1,
            page_size: 100, // 获取足够多的对话
          },
        },
      );

      if (response.data.code === 0) {
        setDialogues(response.data.data.list);
      }
    } catch (error) {
      console.error('获取对话列表失败:', error);
    }
  };

  // 获取当前对话的标题
  const getCurrentDialogueTitle = (
    currentDialogueId: string | null,
  ): string => {
    if (!currentDialogueId) {
      return t('dialogue.newDialogue');
    }

    const currentDialogue = dialogues.find(
      (dialogue) => dialogue.id === currentDialogueId,
    );
    // 如果标题为空，使用默认标题
    const title = currentDialogue ? currentDialogue.title : '';
    return title || t('dialogue.defaultTitle');
  };

  // 监听对话创建事件
  useEffect(() => {
    const handleDialogueCreated = (
      event: CustomEvent<DialogueCreatedEventDetail>,
    ): void => {
      const { conversationId, title } = event.detail;

      // 立即在对话列表中添加新对话
      // 初始时不设置模型，只有当模型实际回答后才显示logo
      const newDialogue: Dialogue = {
        id: conversationId,
        user_id: API_CONFIG.defaultUserId,
        title: title,
        model: '', // 空字符串表示还没有模型回答
        create_time: new Date().toISOString(),
        update_time: new Date().toISOString(),
      };

      setDialogues((prev) => [newDialogue, ...prev]);
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

  // 监听标题更新事件
  useEffect(() => {
    const handleTitleUpdated = (
      event: CustomEvent<TitleUpdatedEventDetail>,
    ): void => {
      const { conversationId, newTitle } = event.detail;

      // 更新对话列表中的标题
      setDialogues((prev) =>
        prev.map((dialogue) =>
          dialogue.id === conversationId
            ? {
                ...dialogue,
                title: newTitle,
                update_time: new Date().toISOString(),
              }
            : dialogue,
        ),
      );
    };

    // 添加事件监听器
    window.addEventListener(
      'titleUpdated',
      handleTitleUpdated as EventListener,
    );

    // 清理事件监听器
    return () => {
      window.removeEventListener(
        'titleUpdated',
        handleTitleUpdated as EventListener,
      );
    };
  }, []);

  // 监听对话更新事件（模型变更）
  useEffect(() => {
    const handleDialogueUpdated = (
      event: CustomEvent<DialogueUpdatedEventDetail>,
    ): void => {
      const { conversationId, model } = event.detail;

      // 更新对话列表中的模型信息，支持增量添加，并将更新的对话移到列表顶部
      setDialogues((prev) => {
        let updatedDialogue: Dialogue | null = null;
        const otherDialogues: Dialogue[] = [];

        // 遍历所有对话，更新目标对话并收集其他对话
        for (const dialogue of prev) {
          if (dialogue.id === conversationId) {
            // 解析现有的模型列表
            const existingModels = dialogue.model
              ? dialogue.model
                  .split(',')
                  .map((m) => m.trim())
                  .filter((m) => m)
              : [];

            // 如果新模型不在列表中，则添加
            if (!existingModels.includes(model)) {
              const updatedModels = [...existingModels, model].join(', ');
              updatedDialogue = {
                ...dialogue,
                model: updatedModels,
                update_time: new Date().toISOString(),
              };
            } else {
              // 如果模型已存在，仍然更新时间并移到顶部
              updatedDialogue = {
                ...dialogue,
                update_time: new Date().toISOString(),
              };
            }
          } else {
            otherDialogues.push(dialogue);
          }
        }

        // 如果找到了更新的对话，将其放在列表最前面
        if (updatedDialogue) {
          return [updatedDialogue, ...otherDialogues];
        }

        // 如果没找到，返回原列表
        return prev;
      });
    };

    // 添加事件监听器
    window.addEventListener(
      'dialogueUpdated',
      handleDialogueUpdated as EventListener,
    );

    // 清理事件监听器
    return () => {
      window.removeEventListener(
        'dialogueUpdated',
        handleDialogueUpdated as EventListener,
      );
    };
  }, []);

  return {
    dialogues,
    refreshDialogues,
    getCurrentDialogueTitle,
  };
};
