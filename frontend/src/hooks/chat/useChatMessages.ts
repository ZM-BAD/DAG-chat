import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  RefObject,
  ChangeEvent,
  KeyboardEvent,
} from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../contexts/ToastContext';
import {
  Message,
  DialogueHistoryResponse,
  PlaceholderResponse,
} from '../../types';
import { API_CONFIG, API_ENDPOINTS, buildApiUrl } from '../../config/api';
import { resolveApiError } from '../../utils/apiError';
import { Citation } from './useChatSettings';

// 定义提问类型
export type QuestionType = 'normal' | 'branch' | 'merge';

/**
 * 判断提问类型
 *
 * @param citations - 当前引用列表
 * @returns 提问类型
 */
export function determineQuestionType(citations: Citation[]): QuestionType {
  if (citations.length === 0) {
    return 'normal';
  }
  // 根据 citations[0].type 判断（同一批 citation 类型一致）
  return citations[0].type;
}

// 定义创建对话响应接口
interface CreateConversationResponse {
  conversation_id: string;
}

// 定义 SSE 数据接口
interface SSEData {
  reasoning?: string;
  content?: string;
  user_message_id?: string;
  assistant_message_id?: string;
  complete?: boolean;
  error?: string;
}

// 定义对话列表项接口
interface DialogueItem {
  id: string;
  title: string;
}

// 定义对话列表响应接口
interface DialogueListApiResponse {
  code: number;
  data: {
    list: DialogueItem[];
  };
}

interface UseChatMessagesProps {
  currentDialogueId: string | null;
  selectedModel: string;
  deepThinkingEnabled: boolean;
  searchEnabled: boolean;
  citations: Citation[];
  clearAllCitations: () => void;
  pathLastAssistantId: string | null;
}

interface UseChatMessagesReturn {
  messages: Message[];
  inputMessage: string;
  isLoading: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  shouldShowWelcome: boolean;
  handleSendMessage: () => Promise<void>;
  handleKeyPress: (e: KeyboardEvent) => void;
  handleInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  toggleThinkingExpansion: (messageId: string) => void;
  copyMessageToClipboard: (content: string) => Promise<void>;
  handleInterruptResponse: () => void;
  messagesDialogueId: string | null; // 当前消息所属的对话ID
}

export const useChatMessages = ({
  currentDialogueId,
  selectedModel,
  deepThinkingEnabled,
  searchEnabled,
  citations,
  clearAllCitations,
  pathLastAssistantId,
}: UseChatMessagesProps): UseChatMessagesReturn => {
  const { t } = useTranslation();
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 追踪当前 messages 属于哪个对话
  const [messagesDialogueId, setMessagesDialogueId] = useState<string | null>(
    null,
  );

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
    textarea.style.height = `${String(newHeight)}px`;
  };

  // 自适应调整输入框高度，使用useLayoutEffect确保DOM更新后立即执行
  useLayoutEffect(() => {
    adjustTextareaHeight();
  }, [inputMessage]);

  // 获取对话历史
  const fetchDialogueHistory = async (
    dialogueId: string,
  ): Promise<Message[]> => {
    const maxRetries = 3;
    let retryCount = 0;

    const waitForRetry = (delay: number): Promise<void> => {
      return new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
    };

    while (retryCount < maxRetries) {
      try {
        const response = await axios.get<DialogueHistoryResponse>(
          buildApiUrl(API_ENDPOINTS.DIALOGUE_HISTORY),
          {
            params: {
              dialogue_id: dialogueId,
            },
          },
        );

        if (response.data.code === 0) {
          // 处理返回的消息，确保 deepThinkingEnabled 和 isThinkingExpanded 属性正确设置
          const processedMessages = response.data.data.map((message) => {
            if (message.role === 'assistant' && message.thinkingContent) {
              return {
                ...message,
                deepThinkingEnabled: true,
                isThinkingExpanded: true,
              };
            }
            return message;
          });
          return processedMessages;
        }
      } catch (error) {
        retryCount++;
        console.error(
          `获取对话历史失败 (尝试 ${String(retryCount)}/${String(maxRetries)}):`,
          error,
        );

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

          // 打印简化的DAG摘要日志
          const nodeCount = historyMessages.length;
          const branchCount = historyMessages.filter(
            (msg) => (msg.children?.length ?? 0) > 1,
          ).length;
          const mergeCount = historyMessages.filter(
            (msg) => (msg.parent_ids?.length ?? 0) > 1,
          ).length;
          console.log(
            `[DAG] 对话 ${currentDialogueId}: ${String(nodeCount)}节点, ${String(branchCount)}分支点, ${String(mergeCount)}合并点`,
          );

          setMessages(historyMessages);
          // 记录这些消息属于哪个对话
          setMessagesDialogueId(currentDialogueId);
        } catch (error) {
          console.error('加载对话历史失败:', error);
          setMessages([]);
          setMessagesDialogueId(null);
        }
      };

      void loadHistory();
    } else if (!currentDialogueId) {
      // 如果没有对话ID，清空消息列表（新对话状态）
      setMessages([]);
      setMessagesDialogueId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDialogueId]);

  // 切换思考内容的展开/折叠状态
  const toggleThinkingExpansion = (messageId: string): void => {
    setMessages((prevMessages) =>
      prevMessages.map((msg) =>
        msg.id === messageId
          ? { ...msg, isThinkingExpanded: !msg.isThinkingExpanded }
          : msg,
      ),
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
        // eslint-disable-next-line @typescript-eslint/no-deprecated
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
  const handleKeyPress = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  // 处理输入变化
  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    setInputMessage(e.target.value);
  };

  // 处理发送消息
  const handleSendMessage = async (): Promise<void> => {
    if (!inputMessage.trim() || isLoading) return;

    // 在清空前保存发送内容
    const sentMessageContent = inputMessage;

    // 如果有未完成的请求，先清理
    cleanupInterruptedState();

    // 创建新的AbortController用于这次请求
    abortControllerRef.current = new AbortController();

    // 获取上一条已保存的助手消息的ID作为parent_ids
    let parentIds: string[] = [];
    if (citations.length > 0) {
      parentIds = citations.map((c) => c.id);
    } else {
      // 使用当前 path 中最后一个 assistant 消息的 ID
      parentIds = pathLastAssistantId ? [pathLastAssistantId] : [];
    }

    setInputMessage('');
    setIsLoading(true);

    let conversationId = currentDialogueId;

    try {
      // 如果是新对话，先创建对话获取conversation_id
      if (!conversationId) {
        const createResponse = await axios.post<CreateConversationResponse>(
          buildApiUrl(API_ENDPOINTS.CREATE_CONVERSATION),
          {
            user_id: API_CONFIG.defaultUserId,
            model: selectedModel,
            message: sentMessageContent,
          },
        );
        conversationId = createResponse.data.conversation_id;

        // 触发侧边栏刷新，显示新创建的对话
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('dialogueCreated', {
              detail: {
                conversationId,
                title: t('dialogue.defaultTitle'),
              },
            }),
          );
        }, 100);
      }

      // === Placeholder 模式：先创建消息占位符，拿到 realId ===
      const placeholderResponse = await axios.post<PlaceholderResponse>(
        buildApiUrl(API_ENDPOINTS.CREATE_MESSAGE_PLACEHOLDERS),
        {
          conversation_id: conversationId,
          message: sentMessageContent,
          parent_ids: parentIds,
          model: selectedModel,
        },
      );

      const userMessageRealId = placeholderResponse.data.user_message_id;
      const assistantMessageRealId =
        placeholderResponse.data.assistant_message_id;

      // 用 realId 构造消息对象，添加到前端状态
      const newUserMessage: Message = {
        id: userMessageRealId,
        content: sentMessageContent,
        role: 'user',
        parent_ids: parentIds,
        children: [assistantMessageRealId],
      };

      // 更新父节点的 children
      setMessages((prev) =>
        prev.map((msg) => {
          if (parentIds.includes(msg.id)) {
            return {
              ...msg,
              children: [...(msg.children || []), userMessageRealId],
            };
          }
          return msg;
        }),
      );
      setMessages((prev) => [...prev, newUserMessage]);

      // 创建助手的消息占位符（使用 realId）
      const assistantMessage: Message = {
        id: assistantMessageRealId,
        content: '',
        role: 'assistant',
        model: selectedModel,
        isWaitingForFirstToken: true,
        deepThinkingEnabled: deepThinkingEnabled,
        parent_ids: [userMessageRealId],
      };
      setMessages((prevMessages) => [...prevMessages, assistantMessage]);

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
          message: sentMessageContent,
          parent_ids: parentIds,
          deep_thinking: deepThinkingEnabled,
          search_enabled: searchEnabled,
          user_message_id: userMessageRealId,
          assistant_message_id: assistantMessageRealId,
        }),
        signal: abortControllerRef.current.signal,
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
      let isThinkingPhase = true;

      // 创建安全的更新函数
      const updateThinkingContent = (currentReasoning: string): void => {
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg.id === assistantMessageRealId
              ? {
                  ...msg,
                  thinkingContent: currentReasoning,
                  isThinkingExpanded: true,
                  isWaitingForFirstToken: false,
                  content: '',
                }
              : msg,
          ),
        );
      };

      const updateContent = (
        currentContent: string,
        currentIsThinkingPhase: boolean,
      ): void => {
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg.id === assistantMessageRealId
              ? {
                  ...msg,
                  content: currentContent,
                  isThinkingExpanded: !currentIsThinkingPhase,
                  isWaitingForFirstToken: false,
                }
              : msg,
          ),
        );
      };

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const dataStr = line.slice(6).trim();
              if (!dataStr) continue;

              const data = JSON.parse(dataStr) as SSEData;

              // 处理思考内容
              if (data.reasoning) {
                fullReasoning += data.reasoning;
                isThinkingPhase = true;
                updateThinkingContent(fullReasoning);
              }

              // 处理正式回答内容
              if (data.content) {
                if (fullContent === '') {
                  isThinkingPhase = false;
                }
                fullContent += data.content;
                updateContent(fullContent, isThinkingPhase);
              }

              // 处理完成事件（placeholder 模式下前端已有 realId，跳过替换）
              if (
                data.user_message_id &&
                data.assistant_message_id &&
                data.complete
              ) {
                // realId 已通过 placeholder 获取，无需替换
              }

              // 处理错误响应
              if (data.error) {
                throw new Error(resolveApiError(data.error));
              }
            } catch (parseError) {
              console.warn('解析SSE数据失败:', parseError, '原始数据:', line);
            }
          }
        }
      }

      // 如果是新对话，AI回答完成后检查标题是否已更新
      if (!currentDialogueId && conversationId) {
        setTimeout(() => {
          const checkTitleUpdate = async (): Promise<void> => {
            try {
              const response = await axios.get<DialogueListApiResponse>(
                buildApiUrl(API_ENDPOINTS.DIALOGUE_LIST),
                {
                  params: {
                    user_id: API_CONFIG.defaultUserId,
                    page: 1,
                    page_size: 20,
                  },
                },
              );

              if (response.data.code === 0) {
                const updatedDialogue = response.data.data.list.find(
                  (dialogue) => dialogue.id === conversationId,
                );

                if (
                  updatedDialogue &&
                  updatedDialogue.title &&
                  updatedDialogue.title !== t('dialogue.defaultTitle')
                ) {
                  window.dispatchEvent(
                    new CustomEvent('titleUpdated', {
                      detail: {
                        conversationId,
                        newTitle: updatedDialogue.title,
                      },
                    }),
                  );
                }
              }
            } catch (error) {
              console.error('检查标题更新失败:', error);
            }
          };

          void checkTitleUpdate();
        }, 2000);
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // 用户手动中止：保留已累积的内容
        console.log('聊天请求被用户中止');
        // 只需清除等待状态，realId 已通过 placeholder 获取
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg.isWaitingForFirstToken
              ? { ...msg, isWaitingForFirstToken: false }
              : msg,
          ),
        );

        // 中止时后端用 fallback 标题落库，通知侧边栏更新
        if (!currentDialogueId && conversationId) {
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('titleUpdated', {
                detail: {
                  conversationId,
                  newTitle: sentMessageContent.slice(0, 20),
                },
              }),
            );
          }, 500);
        }
      } else if (
        error instanceof TypeError &&
        error.message.includes('fetch')
      ) {
        console.error('网络连接错误:', error);
        setMessages((prevMessages) => {
          // 找到 waiting 状态的 assistant 消息并移除
          const assistantToRemove = prevMessages.find(
            (msg) => msg.isWaitingForFirstToken,
          );
          if (assistantToRemove) {
            return prevMessages.filter(
              (msg) => msg.id !== assistantToRemove.id,
            );
          }
          return prevMessages;
        });
        const errorMessage: Message = {
          id: `msg-${String(Date.now() + 2)}`,
          content: t('chat.networkError'),
          role: 'assistant',
        };
        setMessages((prevMessages) => [...prevMessages, errorMessage]);
      } else {
        console.error('发送消息时发生未知错误:', error);
        setMessages((prevMessages) => {
          const assistantToRemove = prevMessages.find(
            (msg) => msg.isWaitingForFirstToken,
          );
          if (assistantToRemove) {
            return prevMessages.filter(
              (msg) => msg.id !== assistantToRemove.id,
            );
          }
          return prevMessages;
        });
        const errorMessage: Message = {
          id: `msg-${String(Date.now() + 2)}`,
          content: t('chat.sendFailed'),
          role: 'assistant',
        };
        setMessages((prevMessages) => [...prevMessages, errorMessage]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      resetTextareaHeight();
      clearAllCitations();

      // 触发侧边栏刷新，更新对话的模型信息
      if (conversationId) {
        window.dispatchEvent(
          new CustomEvent('dialogueUpdated', {
            detail: {
              conversationId,
              model: selectedModel,
            },
          }),
        );
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
    handleInterruptResponse,
    messagesDialogueId,
  };
};
