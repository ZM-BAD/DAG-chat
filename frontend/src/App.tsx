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
      const response = await axios.post<ChatResponse>('/api/v1/chat', {
        messages: [...messages, newUserMessage].map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        dialogue_id: currentDialogueId // 传递当前对话ID
      });

      const assistantMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        content: response.data.choices[0]?.message?.content || '无法获取响应',
        role: 'assistant'
      };

      setMessages(prevMessages => [...prevMessages, assistantMessage]);
    } catch (error: unknown) {
      console.error('Error sending message:', error);
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
        role: 'assistant'
      },
      {
        id: 'msg-4',
        content: '你能帮我解释一下什么是人工智能吗？',
        role: 'user'
      },
      {
        id: 'msg-5',
        content: '人工智能（Artificial Intelligence，简称AI）是计算机科学的一个分支，旨在开发能够执行通常需要人类智能的任务的机器。这些任务包括学习、推理、解决问题、理解自然语言、识别模式、感知环境等。\n\n人工智能可以分为弱AI（也称为狭义AI）和强AI（也称为通用AI）。弱AI是为执行特定任务而设计的系统，如语音识别、图像识别或推荐系统。强AI则是指具有与人类相当或超越人类智能的系统，能够执行任何智力任务。\n\n近年来，机器学习（尤其是深度学习）的进步推动了AI技术的快速发展，使其在许多领域取得了突破性进展。',
        role: 'assistant'
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
        <div className="chat-header">
          <h1>{getCurrentDialogueTitle()}</h1>
        </div>
        <main className="chat-container">
          <div className="chat-messages">
            {messages.map(message => (
              <div key={message.id} className={`message-wrapper ${message.role}`}>
                <div className={`message ${message.role}`}>
                  <div className="message-content">
                    {message.role === 'assistant' ? (
                      <div className="markdown-content">
                        <ReactMarkdown 
                          rehypePlugins={[rehypeRaw]} 
                          remarkPlugins={[remarkGfm]}
                        >
                          {message.content}
                        </ReactMarkdown>
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
        </main>
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
        <footer className="footer">
          <p>© {new Date().getFullYear()} UniformLLM Platform. All Rights Reserved.</p>
        </footer>
      </div>
    </div>
  );
}

export default App;