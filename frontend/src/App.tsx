import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

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

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
        }))
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
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>UniformLLM 聊天界面</h1>
        <p>与统一大语言模型接口交互</p>
      </header>
      <main className="chat-container">
        <div className="chat-messages">
          {messages.map(message => (
            <div key={message.id} className={`message ${message.role}`}>
              <div className="message-content">{message.content}</div>
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
        <div className="chat-input-area">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入您的消息..."
            disabled={isLoading}
            className="message-input"
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading}
            className="send-button"
          >
            {isLoading ? '发送中...' : '发送'}
          </button>
        </div>
      </main>
      <footer className="footer">
        <p>© 2023 UniformLLM 前端界面</p>
      </footer>
    </div>
  );
}

export default App;