import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../contexts/ToastContext';
import { Message, DialogueHistoryResponse } from '../../types';
import { API_CONFIG, API_ENDPOINTS, buildApiUrl } from '../../config/api';

interface UseChatMessagesProps {
  currentDialogueId: string | null;
  selectedModel: string;
  deepThinkingEnabled: boolean;
  searchEnabled: boolean;
  branchParentId: string | null;
  clearBranchState: () => void;
}

interface UseChatMessagesReturn {
  messages: Message[];
  inputMessage: string;
  isLoading: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  shouldShowWelcome: boolean;
  handleSendMessage: () => Promise<void>;
  handleKeyPress: (e: React.KeyboardEvent) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  toggleThinkingExpansion: (messageId: string) => void;
  copyMessageToClipboard: (content: string) => Promise<void>;
  handleInterruptResponse: () => void;
}

export const useChatMessages = ({
  currentDialogueId,
  selectedModel,
  deepThinkingEnabled,
  searchEnabled,
  branchParentId,
  clearBranchState
}: UseChatMessagesProps): UseChatMessagesReturn => {
  const { t } = useTranslation();
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 中断大模型回答
  const handleInterruptResponse = (): void => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      console.log('已中断大模型回答');
    }
  };

  // 清理中断状态，准备新的请求
  const cleanupInterruptedState = (): void => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  // 重置输入框高度
  const resetTextareaHeight = (): void => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
    }
  };

  // 自适应调整输入框高度
  const adjustTextareaHeight = (): void => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // 重置高度以获取正确的scrollHeight
    textarea.style.height = 'auto';

    // 计算新的高度，最大不超过360px（默认高度的3倍）
    const newHeight = Math.min(textarea.scrollHeight, 360);
    textarea.style.height = newHeight + 'px';
  };

  // 自适应调整输入框高度，使用useLayoutEffect确保DOM更新后立即执行
  useLayoutEffect(() => {
    adjustTextareaHeight();
  }, [inputMessage]);

  // 获取对话历史
  const fetchDialogueHistory = async (dialogueId: string): Promise<Message[]> => {
    const maxRetries = 3;
    let retryCount = 0;

    const waitForRetry = (delay: number): Promise<void> => {
      return new Promise(resolve => setTimeout(resolve, delay));
    };

    while (retryCount < maxRetries) {
      try {
        const response = await axios.get<DialogueHistoryResponse>(buildApiUrl(API_ENDPOINTS.DIALOGUE_HISTORY), {
          params: {
            dialogue_id: dialogueId
          }
        });

        if (response.data.code === 0) {
          // 处理返回的消息，确保 deepThinkingEnabled 和 isThinkingExpanded 属性正确设置
          const processedMessages = response.data.data.map(message => {
            if (message.role === 'assistant' && message.thinkingContent) {
              return {
                ...message,
                deepThinkingEnabled: true,
                isThinkingExpanded: true
              };
            }
            return message;
          });
          return processedMessages;
        }
      } catch (error) {
        retryCount++;
        console.error(`获取对话历史失败 (尝试 ${retryCount}/${maxRetries}):`, error);

        if (retryCount < maxRetries) {
          // 等待一段时间后重试
          await waitForRetry(500 * retryCount);
        }
      }
    }

    // 如果所有重试都失败，返回空数组
    console.warn('获取对话历史失败，使用空数据');
    return [];
  };

  // 监听 currentDialogueId 的变化，加载对话历史
  useEffect(() => {
    // 只在有对话ID且不在加载状态时加载历史
    if (currentDialogueId && !isLoading) {
      const loadHistory = async () => {
        try {
          const historyMessages = await fetchDialogueHistory(currentDialogueId);
          setMessages(historyMessages);
        } catch (error) {
          console.error('加载对话历史失败:', error);
          setMessages([]);
        }
      };

      loadHistory();
    } else if (!currentDialogueId) {
      // 如果没有对话ID，清空消息列表（新对话状态）
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDialogueId]);

  // 切换思考内容的展开/折叠状态
  const toggleThinkingExpansion = (messageId: string): void => {
    setMessages(prevMessages =>
      prevMessages.map(msg =>
        msg.id === messageId
          ? { ...msg, isThinkingExpanded: !msg.isThinkingExpanded }
          : msg
      )
    );
  };

  // 复制消息内容到剪贴板
  const copyMessageToClipboard = async (content: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(content);
      // 显示复制成功的Toast
      toast.showToast(t('chat.copySuccess'), 'success', 2000);
      console.log('消息已复制到剪贴板');
    } catch (error) {
      console.error('复制失败:', error);
      // 降级方案：使用document.execCommand
      const textArea = document.createElement('textarea');
      textArea.value = content;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        toast.showToast(t('chat.copySuccess'), 'success', 2000);
        console.log('消息已复制到剪贴板（降级方案）');
      } catch (err) {
        toast.showToast(t('chat.copyFailed'), 'error', 2000);
        console.error('复制失败（降级方案）:', err);
      }
      document.body.removeChild(textArea);
    }
  };

  // 处理按键事件
  const handleKeyPress = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setInputMessage(e.target.value);
  };

  // 处理发送消息
  const handleSendMessage = async (): Promise<void> => {
    if (!inputMessage.trim() || isLoading) return;

    // 如果有未完成的请求，先清理
    cleanupInterruptedState();

    // 创建新的AbortController用于这次请求
    abortControllerRef.current = new AbortController();

    // 生成临时ID，用于前端临时标识消息
    const generateTempId = () => `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const userMessageTempId = generateTempId();
    const assistantMessageTempId = generateTempId();

    // 获取上一条已保存的助手消息的ID作为parent_ids
    // 如果有分支问状态，使用分支的parent_id，否则使用默认逻辑
    let parentIds: string[] = [];
    if (branchParentId) {
      parentIds = [branchParentId];
    } else {
      // 使用历史对话中最后一条assistant消息的id
      const lastAssistantMessage = messages.filter(msg => msg.role === 'assistant' && msg.id).pop();
      const mongoId = lastAssistantMessage?.id;
      parentIds = mongoId ? [mongoId] : [];
    }

    const newUserMessage: Message = {
      id: userMessageTempId,
      content: inputMessage,
      role: 'user',
      parent_ids: parentIds
    };

    setMessages([...messages, newUserMessage]);
    setInputMessage('');
    setIsLoading(true);

    let conversationId = currentDialogueId;

    try {
      // 如果是新对话，先创建对话获取conversation_id
      if (!conversationId) {
        const createResponse = await axios.post(buildApiUrl(API_ENDPOINTS.CREATE_CONVERSATION), {
          user_id: API_CONFIG.defaultUserId,
          model: selectedModel,
          message: inputMessage
        });
        conversationId = createResponse.data.conversation_id;

        // 触发侧边栏刷新，显示新创建的对话
        setTimeout(() => {
          // 通过触发window事件通知侧边栏刷新
          window.dispatchEvent(new CustomEvent('dialogueCreated', {
            detail: {
              conversationId,
              title: t('dialogue.defaultTitle')
            }
          }));
        }, 100);
      }

      // 创建助手的消息占位符
      const assistantMessage: Message = {
        id: assistantMessageTempId,
        content: '',
        role: 'assistant',
        model: selectedModel, // 添加模型信息
        isWaitingForFirstToken: true, // 设置等待首token状态
        deepThinkingEnabled: deepThinkingEnabled, // 记录是否启用了深度思考
        parent_ids: [userMessageTempId] // 临时设置为user消息的临时ID
      };
      setMessages(prevMessages => [...prevMessages, assistantMessage]);

      // 发送聊天请求并处理流式响应
      const response = await fetch(buildApiUrl(API_ENDPOINTS.CHAT), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          user_id: API_CONFIG.defaultUserId,
          model: selectedModel,
          message: inputMessage,
          parent_ids: parentIds,
          deep_thinking: deepThinkingEnabled,
          search_enabled: searchEnabled
        }),
        signal: abortControllerRef.current.signal // 添加中止信号
      });

      if (!response.ok) {
        throw new Error('聊天请求失败');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法获取响应流');
      }

      const decoder = new TextDecoder();
      let fullContent = '';
      let fullReasoning = '';
      let isThinkingPhase = true; // 标记是否处于思考阶段

      // 创建安全的更新函数来避免循环中的不安全引用
      const updateThinkingContent = (currentReasoning: string) => {
        setMessages(prevMessages =>
          prevMessages.map(msg =>
            msg.id === assistantMessageTempId
              ? {
                  ...msg,
                  thinkingContent: currentReasoning,
                  isThinkingExpanded: true,
                  isWaitingForFirstToken: false,
                  content: ''
                }
              : msg
          )
        );
      };

      const updateContent = (currentContent: string, currentIsThinkingPhase: boolean) => {
        setMessages(prevMessages =>
          prevMessages.map(msg =>
            msg.id === assistantMessageTempId
              ? {
                  ...msg,
                  content: currentContent,
                  isThinkingExpanded: !currentIsThinkingPhase,
                  isWaitingForFirstToken: false
                }
              : msg
          )
        );
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const dataStr = line.slice(6).trim();
              if (!dataStr) continue; // 跳过空数据行

              const data = JSON.parse(dataStr);

              // 处理思考内容（优先显示思考过程）
              if (data.reasoning) {
                fullReasoning += data.reasoning;
                isThinkingPhase = true; // 还在思考阶段

                // 立即更新思考内容，实现逐token打字机效果
                updateThinkingContent(fullReasoning);
              }

              // 处理正式回答内容
              if (data.content) {
                // 第一次收到正文内容时，标记思考阶段结束
                if (fullContent === '' && data.content) {
                  isThinkingPhase = false;
                }

                fullContent += data.content;

                // 立即更新内容，实现逐token打字机效果
                updateContent(fullContent, isThinkingPhase);
              }

              // 处理消息ID（在流式响应结束时）
              if (data.user_message_id && data.assistant_message_id && data.complete) {
                const userMessageRealId = data.user_message_id;
                const assistantMessageRealId = data.assistant_message_id;

                // 更新消息：
                // 1. 更新user.message.id为真实ID
                // 2. 更新user.message.children为assistant.message.id
                // 3. 更新assistant.message.id为真实ID
                // 4. 更新assistant.message.parent_ids为user.message.id
                // 5. 根据请求入参的parent_ids，将parent的children加上本次user.message.id
                setMessages(prevMessages => {
                  return prevMessages.map(msg => {
                    // 更新用户消息：替换临时ID为真实ID，并设置children
                    if (msg.id === userMessageTempId) {
                      return {
                        ...msg,
                        id: userMessageRealId,
                        children: msg.children ? [...msg.children, assistantMessageRealId] : [assistantMessageRealId]
                      };
                    }
                    // 更新助手消息：替换临时ID为真实ID，并更新parent_ids
                    if (msg.id === assistantMessageTempId) {
                      return {
                        ...msg,
                        id: assistantMessageRealId,
                        parent_ids: [userMessageRealId]
                      };
                    }
                    // 更新父消息的children：如果当前消息是parent_ids中的某一个，添加user消息ID到其children
                    if (parentIds.includes(msg.id)) {
                      return {
                        ...msg,
                        children: [...(msg.children || []), userMessageRealId]
                      };
                    }
                    return msg;
                  });
                });
              }

              // 处理错误响应
              if (data.error) {
                throw new Error(data.error);
              }
            } catch (parseError) {
              // 记录解析错误，生产环境也需要知道发生了错误
              console.warn('解析SSE数据失败:', parseError, '原始数据:', line);
              // 继续处理下一行，不中断整个流
            }
          }
        }
      }

      // 如果是新对话，AI回答完成后检查标题是否已更新
      if (!currentDialogueId && conversationId) {
        // 延迟检查标题更新，给后端生成标题的时间
        setTimeout(async () => {
          try {
            // 刷新对话列表获取最新标题
            const response = await axios.get(buildApiUrl(API_ENDPOINTS.DIALOGUE_LIST), {
              params: {
                user_id: API_CONFIG.defaultUserId,
                page: 1,
                page_size: 20
              }
            });

            if (response.data.code === 0) {
              const updatedDialogue = response.data.data.list.find(
                (dialogue: any) => dialogue.id === conversationId
              );

              if (updatedDialogue && updatedDialogue.title && updatedDialogue.title !== t('dialogue.defaultTitle')) {
                // 触发标题更新事件
                window.dispatchEvent(new CustomEvent('titleUpdated', {
                  detail: {
                    conversationId,
                    newTitle: updatedDialogue.title
                  }
                }));
              }
            }
          } catch (error) {
            console.error('检查标题更新失败:', error);
          }
        }, 2000); // 2秒后检查标题更新
      }

    } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          // 请求被中止，这是预期的行为
          console.log('聊天请求被中止');
          // 移除未完成的助手消息，并显示中止提示
          setMessages(prevMessages =>
            prevMessages.filter(msg => msg.id !== assistantMessageTempId)
          );
          const abortMessage: Message = {
            id: `msg-${Date.now() + 2}`,
            content: t('chat.abortMessage'),
            role: 'assistant'
          };
          setMessages(prevMessages => [...prevMessages, abortMessage]);
        } else if (error instanceof TypeError && error.message.includes('fetch')) {
          // 网络连接错误，可能是网络问题
          console.error('网络连接错误:', error);
          setMessages(prevMessages =>
            prevMessages.filter(msg => msg.id !== assistantMessageTempId)
          );
          const errorMessage: Message = {
            id: `msg-${Date.now() + 2}`,
            content: t('chat.networkError'),
            role: 'assistant'
          };
          setMessages(prevMessages => [...prevMessages, errorMessage]);
        } else {
          console.error('发送消息时发生未知错误:', error);
          // 移除助手消息并显示错误
          setMessages(prevMessages =>
            prevMessages.filter(msg => msg.id !== assistantMessageTempId)
          );
          const errorMessage: Message = {
            id: `msg-${Date.now() + 2}`,
            content: t('chat.sendFailed'),
            role: 'assistant'
          };
          setMessages(prevMessages => [...prevMessages, errorMessage]);
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null; // 清理AbortController
        // 发送消息后重置输入框高度
        resetTextareaHeight();
        // 清除分支问状态
        clearBranchState();

        // 触发侧边栏刷新，更新对话的模型信息
        if (conversationId) {
          window.dispatchEvent(new CustomEvent('dialogueUpdated', {
            detail: {
              conversationId,
              model: selectedModel
            }
          }));
        }
      }
  };

  // 判断是否显示欢迎界面（没有消息时显示）
  const shouldShowWelcome = messages.length === 0;

  return {
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
    handleInterruptResponse
  };
};