import React from 'react';

interface ChatInputProps {
  inputMessage: string;
  isLoading: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyPress: (e: React.KeyboardEvent) => void;
  handleSendMessage: () => void;
  handleInterruptResponse?: () => void;
}

const ChatInput: React.FC<ChatInputProps> = ({
  inputMessage,
  isLoading,
  textareaRef,
  handleInputChange,
  handleKeyPress,
  handleSendMessage,
  handleInterruptResponse
}) => {
  const isInputEmpty = inputMessage.trim() === '';
  
  const handleButtonClick = () => {
    if (isLoading && handleInterruptResponse) {
      handleInterruptResponse();
      // 这里不需要额外操作，因为handleInterruptResponse会设置isLoading为false
      // React会自动重新渲染组件并移除loading类名
    } else {
      handleSendMessage();
    }
  };
  
  return (
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
        onClick={handleButtonClick}
        disabled={isInputEmpty && !isLoading}
        className={`send-button ${isLoading ? 'loading' : ''}`}
        aria-label={isLoading ? '中断回答' : '发送'}
      >
        {/* 按钮内容由CSS伪元素控制 */}
      </button>
    </div>
  );
};

export default ChatInput;