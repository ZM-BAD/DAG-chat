import { useState, useEffect } from 'react';
import axios from 'axios';
import { Dialogue, DialogueListResponse } from '../types';

export const useDialogues = () => {
  const [dialogues, setDialogues] = useState<Dialogue[]>([]);

  // 获取对话列表
  useEffect(() => {
    const fetchDialogues = async () => {
      const maxRetries = 5;
      let retryCount = 0;

      while (retryCount < maxRetries) {
        try {
          const response = await axios.get('/api/v1/dialogue/list', {
            params: {
              user_id: 'zm-bad',
              page: 1,
              page_size: 100 // 获取足够多的对话
            }
          });

          if (response.data.code === 0) {
            setDialogues(response.data.data.list);
            return; // 成功获取数据后退出
          }
        } catch (error) {
          retryCount++;
          console.error(`获取对话列表失败 (尝试 ${retryCount}/${maxRetries}):`, error);

          if (retryCount < maxRetries) {
            // 等待一段时间后重试，使用指数退避
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
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
      fetchDialogues();
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // 更新对话列表
  const refreshDialogues = async () => {
    try {
      const response = await axios.get<DialogueListResponse>('/api/v1/dialogue/list', {
        params: {
          user_id: 'zm-bad',
          page: 1,
          page_size: 100 // 获取足够多的对话
        }
      });

      if (response.data.code === 0) {
        setDialogues(response.data.data.list);
      }
    } catch (error) {
      console.error('获取对话列表失败:', error);
    }
  };

  // 获取当前对话的标题
  const getCurrentDialogueTitle = (currentDialogueId: string | null) => {
    if (!currentDialogueId) {
      return '新对话';
    }

    const currentDialogue = dialogues.find(dialogue => dialogue.id === currentDialogueId);
    return currentDialogue ? currentDialogue.title : `对话 ${currentDialogueId.substring(0, 8)}`;
  };

  return {
    dialogues,
    refreshDialogues,
    getCurrentDialogueTitle
  };
};