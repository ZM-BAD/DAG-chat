import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Message, DialogueHistoryResponse } from '../types';

export const useChat = () => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentDialogueId, setCurrentDialogueId] = useState<string | null>(null);
  const [deepThinkingEnabled, setDeepThinkingEnabled] = useState(false);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [selectedModel, setSelectedModel] = useState('deepseek'); // 默认使用第一个可用模型
  const [availableModels, setAvailableModels] = useState<{value: string; label: string}[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 获取可用模型列表
  const fetchAvailableModels = useCallback(async (): Promise<void> => {
    try {
      const response = await axios.get('http://localhost:8000/api/v1/models');
      if (response.data.models) {
        const models = response.data.models.map((model: any) => ({
          value: model.name,
          label: model.display_name
        }));
        setAvailableModels(models);

        // 如果当前选择的模型不在列表中，选择第一个可用模型
        if (!models.some((m: {value: string; label: string}) => m.value === selectedModel)) {
          setSelectedModel(models[0]?.value || 'deepseek');
        }
      }
    } catch (error) {
      console.error('获取模型列表失败:', error);
      // 使用默认模型列表作为降级方案
      const defaultModels = [
        { value: 'deepseek', label: 'DeepSeek' },
        { value: 'qwen', label: 'Qwen' },
        { value: 'kimi', label: 'Kimi' },
        { value: 'glm', label: 'GLM' }
      ];
      setAvailableModels(defaultModels);
    }
  }, [selectedModel]);

  // 组件加载时获取模型列表
  useEffect(() => {
    fetchAvailableModels();
  }, [fetchAvailableModels]);

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

  const handleSendMessage = async (): Promise<void> => {
    if (!inputMessage.trim() || isLoading) return;

    // 如果有未完成的请求，先清理
    cleanupInterruptedState();

    // 创建新的AbortController用于这次请求
    abortControllerRef.current = new AbortController();

    const newUserMessage: Message = {
      id: `msg-${Date.now()}`,
      content: inputMessage,
      role: 'user'
    };

    // 创建助手的消息ID，在更大作用域中使用
    const assistantMessageId = `msg-${Date.now() + 1}`;

    setMessages([...messages, newUserMessage]);
    setInputMessage('');
    setIsLoading(true);

    let conversationId = currentDialogueId;

    try {
      // 如果是新对话，先创建对话获取conversation_id
      if (!conversationId) {
        const createResponse = await axios.post('http://localhost:8000/api/v1/create-conversation', {
          user_id: 'zm-bad',
          model: selectedModel,
          message: inputMessage
        });
        conversationId = createResponse.data.conversation_id;
        setCurrentDialogueId(conversationId);

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
        id: assistantMessageId,
        content: '',
        role: 'assistant',
        model: selectedModel, // 添加模型信息
        isWaitingForFirstToken: true // 设置等待首token状态
      };
      setMessages(prevMessages => [...prevMessages, assistantMessage]);

      // 获取上一条已保存的助手消息的MongoDB ID作为parent_ids
      // 优先使用_id字段（新对话完成后设置），其次使用id字段（历史对话）
      const lastAssistantMessage = messages.filter(msg => msg.role === 'assistant' && (msg._id || msg.id)).pop();
      const mongoId = lastAssistantMessage?._id || lastAssistantMessage?.id;
      const parentIds = mongoId ? [mongoId] : [];

      // 发送聊天请求并处理流式响应
      const response = await fetch('http://localhost:8000/api/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          user_id: 'zm-bad',
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
            msg.id === assistantMessageId
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
            msg.id === assistantMessageId
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
              if (data.message_id && data.complete) {
                // 保存助手消息的MongoDB ID
                setMessages(prevMessages =>
                  prevMessages.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, _id: data.message_id }
                      : msg
                  )
                );
              }

              // 处理错误响应
              if (data.error) {
                throw new Error(data.error);
              }
            } catch (parseError) {
              // 只在开发环境显示详细的解析错误
              if (process.env.NODE_ENV === 'development') {
                console.warn('解析SSE数据失败:', parseError, '原始数据:', line);
              }
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
            const response = await axios.get('/api/v1/dialogue/list', {
              params: {
                user_id: 'zm-bad',
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
          // 移除未完成的助手消息，但不显示错误提示
          setMessages(prevMessages =>
            prevMessages.filter(msg => msg.id !== assistantMessageId)
          );
        } else if (error instanceof TypeError && error.message.includes('fetch')) {
          // 网络连接错误，可能是网络问题
          console.error('网络连接错误:', error);
          setMessages(prevMessages =>
            prevMessages.filter(msg => msg.id !== assistantMessageId)
          );
          const errorMessage: Message = {
            id: `msg-${Date.now() + 2}`,
            content: '网络连接失败，请检查网络后重试',
            role: 'assistant'
          };
          setMessages(prevMessages => [...prevMessages, errorMessage]);
        } else {
          console.error('发送消息时发生未知错误:', error);
          // 移除助手消息并显示错误
          setMessages(prevMessages =>
            prevMessages.filter(msg => msg.id !== assistantMessageId)
          );
          const errorMessage: Message = {
            id: `msg-${Date.now() + 2}`,
            content: '发送消息失败，请稍后重试',
            role: 'assistant'
          };
          setMessages(prevMessages => [...prevMessages, errorMessage]);
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null; // 清理AbortController
        // 发送消息后重置输入框高度
        resetTextareaHeight();

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

  const handleKeyPress = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
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

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setInputMessage(e.target.value);
    // 使用setTimeout确保DOM更新后再调整高度
    setTimeout(adjustTextareaHeight, 0);
  };

  // 获取对话历史
  const fetchDialogueHistory = async (dialogueId: string): Promise<Message[]> => {
    const maxRetries = 3;
    let retryCount = 0;

    const waitForRetry = (delay: number): Promise<void> => {
      return new Promise(resolve => setTimeout(resolve, delay));
    };

    while (retryCount < maxRetries) {
      try {
        const response = await axios.get<DialogueHistoryResponse>('http://localhost:8000/api/v1/dialogue/history', {
          params: {
            dialogue_id: dialogueId
          }
        });

        if (response.data.code === 0) {
          return response.data.data;
        } else {
          console.error('获取对话历史失败:', response.data.message);
          return [];
        }
      } catch (error) {
        retryCount++;
        console.error(`获取对话历史时发生错误 (尝试 ${retryCount}/${maxRetries}):`, error);

        if (retryCount < maxRetries) {
          // 等待一段时间后重试
          await waitForRetry(500 * retryCount);
        }
      }
    }

    // 如果所有重试都失败，返回模拟数据
    console.warn('获取对话历史失败，使用模拟数据');
    return getMockDialogueHistory();
  };

  // 模拟对话历史数据，用于演示
  const getMockDialogueHistory = (): Message[] => {
    return [
      {
        id: 'msg-1',
        content: '你好，我是UniformLLM助手，有什么可以帮助你的吗？',
        role: 'assistant'
      },
      {
        id: 'msg-2',
        content: '请介绍一下你自己',
        role: 'user'
      },
      {
        id: 'msg-3',
        content: '我是一个基于大语言模型的智能助手，可以回答问题、提供信息、帮助完成各种任务。我可以协助你进行写作、学习、解决问题等多种场景的应用。',
        role: 'assistant',
        thinkingContent: '用户询问我的自我介绍，我需要简洁明了地说明我的能力和用途。我应该提到我是基于大语言模型的，这样可以设定正确的期望。',
        isThinkingExpanded: false,
        isWaitingForFirstToken: false
      },
      {
        id: 'msg-4',
        content: '你能帮我解释一下什么是人工智能吗？',
        role: 'user'
      },
      {
        id: 'msg-5',
        content: '人工智能（Artificial Intelligence，简称AI）是计算机科学的一个分支，旨在开发能够执行通常需要人类智能的任务的机器。这些任务包括学习、推理、解决问题、理解自然语言、识别模式、感知环境等。\n\n人工智能可以分为弱AI（也称为狭义AI）和强AI（也称为通用AI）。弱AI是为执行特定任务而设计的系统，如语音识别、图像识别或推荐系统。强AI则是指具有与人类相当或超越人类智能的系统，能够执行任何智力任务。\n\n近年来，机器学习（尤其是深度学习）的进步推动了AI技术的快速发展，使其在许多领域取得了突破性进展。',
        role: 'assistant',
        thinkingContent: '用户问了一个很宽泛的问题。我需要从定义、分类和应用三个方面来解释人工智能。我应该从计算机科学的角度开始，然后解释不同类型的AI，最后提到最新的发展。这样可以让用户获得全面的理解。',
        isThinkingExpanded: false,
        isWaitingForFirstToken: false
      }
    ];
  };

  // 处理对话选择
  const handleDialogueSelect = async (dialogueId: string) => {
    setCurrentDialogueId(dialogueId);
    setIsLoading(true);

    try {
      // 获取对话历史消息
      const historyMessages = await fetchDialogueHistory(dialogueId);
      setMessages(historyMessages);
    } catch (error) {
      console.error('获取对话历史失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理新建对话
  const handleNewDialogue = () => {
    setCurrentDialogueId(null);
    setMessages([]);
  };

  // 判断是否显示欢迎界面（没有消息时显示）
  const shouldShowWelcome = messages.length === 0;

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
      // 可以在这里添加一个提示，表示复制成功
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
        console.log('消息已复制到剪贴板（降级方案）');
      } catch (err) {
        console.error('复制失败（降级方案）:', err);
      }
      document.body.removeChild(textArea);
    }
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

  // 处理模型选择
  const handleModelChange = (model: string): void => {
    setSelectedModel(model);
    console.log('选择模型:', model);
  };

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
    handleModelChange
  };
};