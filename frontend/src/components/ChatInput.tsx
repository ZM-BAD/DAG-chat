import React, { useState } from 'react';

interface ChatInputProps {
  inputMessage: string;
  isLoading: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyPress: (e: React.KeyboardEvent) => void;
  handleSendMessage: () => void;
  handleInterruptResponse?: () => void;
  onDeepThinkingChange?: (enabled: boolean) => void;
  onSearchChange?: (enabled: boolean) => void;
  onModelChange?: (model: string) => void;
  initialDeepThinking?: boolean;
  initialSearch?: boolean;
  initialModel?: string;
  availableModels?: {value: string; label: string}[];
}

const ChatInput: React.FC<ChatInputProps> = ({
  inputMessage,
  isLoading,
  textareaRef,
  handleInputChange,
  handleKeyPress,
  handleSendMessage,
  handleInterruptResponse,
  onDeepThinkingChange,
  onSearchChange,
  onModelChange,
  initialDeepThinking = false,
  initialSearch = false,
  initialModel = 'deepseek',
  availableModels = []
}) => {
  const isInputEmpty = inputMessage.trim() === '';
  const [deepThinkingEnabled, setDeepThinkingEnabled] = useState(initialDeepThinking);
  const [searchEnabled, setSearchEnabled] = useState(initialSearch);
  const [selectedModel, setSelectedModel] = useState(initialModel);
  
  const handleButtonClick = () => {
    if (isLoading && handleInterruptResponse) {
      handleInterruptResponse();
      // 这里不需要额外操作，因为handleInterruptResponse会设置isLoading为false
      // React会自动重新渲染组件并移除loading类名
    } else {
      handleSendMessage();
    }
  };

  const handleDeepThinkingToggle = () => {
    const newValue = !deepThinkingEnabled;
    setDeepThinkingEnabled(newValue);
    if (onDeepThinkingChange) {
      onDeepThinkingChange(newValue);
    }
  };

  const handleSearchToggle = () => {
    const newValue = !searchEnabled;
    setSearchEnabled(newValue);
    if (onSearchChange) {
      onSearchChange(newValue);
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setSelectedModel(newModel);
    if (onModelChange) {
      onModelChange(newModel);
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

      {/* 功能按钮区域 */}
      <div className="input-controls">
        <button
          className={`control-button deep-thinking ${deepThinkingEnabled ? 'active' : ''}`}
          onClick={handleDeepThinkingToggle}
          title="深度思考模式"
        >
          🧠 深度思考
        </button>

        <button
          className={`control-button search ${searchEnabled ? 'active' : ''}`}
          onClick={handleSearchToggle}
          title="联网搜索"
        >
          🔍 联网搜索
        </button>

        <div className="model-selector">
          <select
            value={selectedModel}
            onChange={handleModelChange}
            className="model-dropdown"
            title="选择模型"
          >
            {availableModels.map(model => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export default ChatInput;