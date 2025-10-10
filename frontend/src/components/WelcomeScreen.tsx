import React from 'react';

interface WelcomeScreenProps {
  inputMessage: string;
  isLoading: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyPress: (e: React.KeyboardEvent) => void;
  handleSendMessage: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  inputMessage,
  isLoading,
  textareaRef,
  handleInputChange,
  handleKeyPress,
  handleSendMessage
}) => {
  return (
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
  );
};

export default WelcomeScreen;