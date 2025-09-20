import React, { useState, useEffect, useRef } from 'react';
import axios, { AxiosResponse } from 'axios';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import Sidebar from './Sidebar';
import './App.css';

// 定义对话接口
interface Dialogue {
  id: string;
  user_id: string;
  title: string;
  model: string;
  create_time: string;
  update_time: string;
}

// 定义消息接口
interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  thinkingContent?: string; // 思考内容（仅assistant角色使用）
  isThinkingExpanded?: boolean; // 思考内容是否展开（仅assistant角色使用）
}

// 定义API响应接口
interface ChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// 定义获取对话历史的响应接口
interface DialogueHistoryResponse {
  code: number;
  message: string;
  data: Message[];
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentDialogueId, setCurrentDialogueId] = useState<string | null>(null);
  const [dialogues, setDialogues] = useState<Dialogue[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 获取对话列表
  useEffect(() => {
    const fetchDialogues = async () => {
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
        }
      } catch (error) {
        console.error('获取对话列表失败:', error);
      }
    };

    fetchDialogues();
  }, []);

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
        role: 'assistant'
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // 处理思考内容
              if (data.reasoning) {
                fullReasoning += data.reasoning;
              }
              
              // 处理正式回答内容
              if (data.content) {
                fullContent += data.content;
              }
              
              // 更新助手消息的内容
              setMessages(prevMessages => 
                prevMessages.map(msg => 
                  msg.id === assistantMessageId 
                    ? { 
                        ...msg, 
                        content: fullContent,
                        thinkingContent: fullReasoning,
                        isThinkingExpanded: false // 默认折叠思考内容
                      }
                    : msg
                )
              );
              
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
      console.error('获取对话历史时发生错误:', error);
      // 如果API不可用，返回模拟数据
      return getMockDialogueHistory();
    }
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
        isThinkingExpanded: false
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
        isThinkingExpanded: false
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
      
      // 更新对话列表
      const fetchDialogues = async () => {
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
          }
        } catch (error) {
          console.error('获取对话列表失败:', error);
        }
      };

      fetchDialogues();
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

  // 获取当前对话的标题
  const getCurrentDialogueTitle = () => {
    if (!currentDialogueId) {
      return '新对话';
    }
    
    const currentDialogue = dialogues.find(dialogue => dialogue.id === currentDialogueId);
    return currentDialogue ? currentDialogue.title : `对话 ${currentDialogueId.substring(0, 8)}`;
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

  return (
    <div className="app">
      <Sidebar 
        onDialogueSelect={handleDialogueSelect} 
        onNewDialogue={handleNewDialogue}
      />
      <div className="main-content">
        {!shouldShowWelcome && (
          <div className="chat-header">
            <h1>{getCurrentDialogueTitle()}</h1>
          </div>
        )}
        <main className={`chat-container ${shouldShowWelcome ? 'welcome-mode' : ''}`}>
          {shouldShowWelcome ? (
            <div className="welcome-container">
              <div className="welcome-content">
                <h2 className="welcome-title">今天有什么可以帮到你？</h2>
                <div className="chat-input-wrapper">
                  <textarea
                    ref={textareaRef}
                    value={inputMessage}
                    onChange={handleInputChange}
                    onKeyPress={handleKeyPress}
                    placeholder="输入您的消息..."
                    disabled={isLoading}
                    className="message-input"
                    rows={1}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isLoading}
                    className="send-button"
                    aria-label={isLoading ? '发送中' : '发送'}
                  >
                    {/* 按钮内容由CSS伪元素控制 */}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="chat-messages">
              {messages.map(message => (
                <div key={message.id} className={`message-wrapper ${message.role}`}>
                  <div className={`message ${message.role}`}>
                    <div className="message-content">
                      {message.role === 'assistant' ? (
                        <div className="assistant-content">
                          {/* 思考内容区域 */}
                          {message.thinkingContent && (
                            <div className="thinking-section">
                              <div className="thinking-header">
                                <button 
                                  className="thinking-toggle"
                                  onClick={() => toggleThinkingExpansion(message.id)}
                                  aria-label={message.isThinkingExpanded ? "折叠思考内容" : "展开思考内容"}
                                >
                                  <span className="thinking-icon">
                                    {message.isThinkingExpanded ? '▼' : '▶'}
                                  </span>
                                  <span className="thinking-label">思考过程</span>
                                </button>
                              </div>
                              {message.isThinkingExpanded && (
                                <div className="thinking-content">
                                  <div className="thinking-border"></div>
                                  <div className="thinking-text">
                                    <ReactMarkdown 
                                      rehypePlugins={[rehypeRaw]} 
                                      remarkPlugins={[remarkGfm]}
                                    >
                                      {message.thinkingContent}
                                    </ReactMarkdown>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* 正式回答内容区域 */}
                          <div className="answer-content">
                            <ReactMarkdown 
                              rehypePlugins={[rehypeRaw]} 
                              remarkPlugins={[remarkGfm]}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ) : (
                        message.content
                      )}
                    </div>
                  </div>
                  <div className="message-actions">
                    <button
                      className="copy-button"
                      onClick={() => copyMessageToClipboard(message.content)}
                      title="复制消息"
                      aria-label="复制消息"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="message assistant">
                  <div className="message-content">
                    <span className="typing-indicator">正在输入...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
        {!shouldShowWelcome && (
          <div className="chat-input-wrapper">
            <textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="输入您的消息..."
              disabled={isLoading}
              className="message-input"
              rows={1}
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading}
              className="send-button"
              aria-label={isLoading ? '发送中' : '发送'}
            >
              {/* 按钮内容由CSS伪元素控制 */}
            </button>
          </div>
        )}
        <footer className="footer">
          <p>© {new Date().getFullYear()} UniformLLM Platform. All Rights Reserved.</p>
        </footer>
      </div>
    </div>
  );
}

export default App;