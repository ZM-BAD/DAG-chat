import { useState, useRef } from 'react';
import axios, { AxiosResponse } from 'axios';
import { Message, DialogueHistoryResponse } from '../types';

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentDialogueId, setCurrentDialogueId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 重置输入框高度
  const resetTextareaHeight = (): void => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
    }
  };

  const handleSendMessage = async (): Promise<void> => {
    if (!inputMessage.trim() || isLoading) return;

    const newUserMessage: Message = {
      id: `msg-${Date.now()}`,
      content: inputMessage,
      role: 'user'
    };

    setMessages([...messages, newUserMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      let conversationId = currentDialogueId;

      // 如果是新对话，先创建对话获取conversation_id
      if (!conversationId) {
        const createResponse = await axios.post('/api/v1/create-conversation', {
          user_id: 'zm-bad',
          model: 'deepseek-r1',
          message: inputMessage
        });
        conversationId = createResponse.data.conversation_id;
        setCurrentDialogueId(conversationId);
      }

      // 创建助手的消息占位符
      const assistantMessageId = `msg-${Date.now() + 1}`;
      const assistantMessage: Message = {
        id: assistantMessageId,
        content: '',
        role: 'assistant',
        isWaitingForFirstToken: true // 设置等待首token状态
      };
      setMessages(prevMessages => [...prevMessages, assistantMessage]);

      // 发送聊天请求并处理流式响应
      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          user_id: 'zm-bad',
          model: 'deepseek-r1',
          message: inputMessage
        })
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              // 处理思考内容（优先显示思考过程）
              if (data.reasoning) {
                fullReasoning += data.reasoning;
                isThinkingPhase = true; // 还在思考阶段

                // 立即更新思考内容，实现逐token打字机效果
                setMessages(prevMessages =>
                  prevMessages.map(msg =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          thinkingContent: fullReasoning,
                          isThinkingExpanded: true, // 思考阶段自动展开
                          isWaitingForFirstToken: false,
                          content: '' // 思考阶段不显示正文
                        }
                      : msg
                  )
                );
              }

              // 处理正式回答内容
              if (data.content) {
                // 第一次收到正文内容时，标记思考阶段结束
                if (fullContent === '' && data.content) {
                  isThinkingPhase = false;
                }

                fullContent += data.content;

                // 立即更新内容，实现逐token打字机效果
                setMessages(prevMessages =>
                  prevMessages.map(msg =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: fullContent,
                          isThinkingExpanded: !isThinkingPhase, // 正文阶段折叠思考内容
                          isWaitingForFirstToken: false
                        }
                      : msg
                  )
                );
              }

              if (data.error) {
                throw new Error(data.error);
              }
            } catch (e) {
              // 忽略解析错误的行
              console.warn('解析SSE数据失败:', e);
            }
          }
        }
      }

    } catch (error: unknown) {
      console.error('Error sending message:', error);
      // 移除助手消息并显示错误
      setMessages(prevMessages =>
        prevMessages.filter(msg => msg.id !== `msg-${Date.now() + 1}`)
      );
      const errorMessage: Message = {
        id: `msg-${Date.now() + 2}`,
        content: '发送消息失败，请稍后重试',
        role: 'assistant'
      };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
      // 发送消息后重置输入框高度
      resetTextareaHeight();
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

    while (retryCount < maxRetries) {
      try {
        const response = await axios.get<DialogueHistoryResponse>('/api/v1/dialogue/history', {
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
          await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
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
    copyMessageToClipboard
  };
};