import {
  useState,
  useRef,
  useEffect,
  FC,
  RefObject,
  ChangeEvent,
  KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import ModelLogo from './common/ModelLogo';

// 自定义模型选择器组件
interface CustomModelSelectProps {
  selectedModel: string;
  availableModels: { value: string; label: string }[];
  onModelChange: (e: ChangeEvent<HTMLSelectElement>) => void;
}

const CustomModelSelect: FC<CustomModelSelectProps> = ({
  selectedModel,
  availableModels,
  onModelChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  // 检测下拉框位置
  const checkDropdownPosition = () => {
    if (!selectRef.current) return;

    const rect = selectRef.current.getBoundingClientRect();
    const dropdownHeight = 200; // 预估的下拉框高度
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // 如果下方空间不足，且上方空间更充足，则向上展开
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      setDropUp(true);
    } else {
      setDropUp(false);
    }
  };

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        selectRef.current &&
        !selectRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (modelValue: string) => {
    // 创建一个模拟的select事件
    const mockEvent = {
      target: {
        value: modelValue,
      },
    } as ChangeEvent<HTMLSelectElement>;

    onModelChange(mockEvent);
    setIsOpen(false);
  };

  const currentModel = availableModels.find((m) => m.value === selectedModel) ||
    availableModels[0] || { value: 'deepseek', label: 'DeepSeek' };

  const handleTriggerClick = () => {
    if (!isOpen) {
      checkDropdownPosition();
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="custom-model-select" ref={selectRef}>
      <div className="custom-select-trigger" onClick={handleTriggerClick}>
        <div className="selected-model-display">
          <ModelLogo model={currentModel.value} size={16} />
          <span className="model-label">{currentModel.label}</span>
        </div>
        <div className={`select-arrow ${isOpen ? 'open' : ''}`}>▼</div>
      </div>

      {isOpen && (
        <div className={`custom-select-dropdown ${dropUp ? 'drop-up' : ''}`}>
          {availableModels.map((model) => (
            <div
              key={model.value}
              className={`custom-select-option ${model.value === selectedModel ? 'selected' : ''}`}
              onClick={() => {
                handleSelect(model.value);
              }}
            >
              <ModelLogo model={model.value} size={16} />
              <span>{model.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface ChatInputProps {
  inputMessage: string;
  isLoading: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  handleInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyPress: (e: KeyboardEvent) => void;
  handleSendMessage: () => void;
  handleInterruptResponse?: () => void;
  onDeepThinkingChange?: (enabled: boolean) => void;
  onSearchChange?: (enabled: boolean) => void;
  onModelChange?: (model: string) => void;
  initialDeepThinking?: boolean;
  initialSearch?: boolean;
  initialModel?: string;
  availableModels?: { value: string; label: string }[];
  branchParentId?: string | null;
  branchParentContent?: string;
  onClearBranch?: () => void;
}

const ChatInput: FC<ChatInputProps> = ({
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
  availableModels = [],
  branchParentId = null,
  branchParentContent = '',
  onClearBranch,
}) => {
  const { t } = useTranslation();
  const isInputEmpty = inputMessage.trim() === '';
  const [deepThinkingEnabled, setDeepThinkingEnabled] =
    useState(initialDeepThinking);
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

  const handleModelChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setSelectedModel(newModel);
    if (onModelChange) {
      onModelChange(newModel);
    }
  };

  return (
    <div className="chat-input-wrapper">
      {/* 分支问引用效果 */}
      {branchParentId && (
        <div className="branch-citation">
          <img
            src="/assets/branch.svg"
            alt="分支"
            className="branch-citation-icon"
          />
          <span className="branch-citation-text">{branchParentContent}...</span>
          <button
            className="branch-citation-close"
            onClick={onClearBranch}
            aria-label="清除分支"
          >
            ✕
          </button>
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={inputMessage}
        onChange={handleInputChange}
        onKeyDown={handleKeyPress}
        placeholder={t('chat.placeholder')}
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
          title={t('chat.deepThinkingTitle')}
        >
          🧠 {t('chat.deepThinking')}
        </button>

        <button
          className={`control-button search ${searchEnabled ? 'active' : ''}`}
          onClick={handleSearchToggle}
          title={t('chat.searchTitle')}
        >
          🔍 {t('chat.search')}
        </button>

        <div className="model-selector">
          <CustomModelSelect
            selectedModel={selectedModel}
            availableModels={availableModels}
            onModelChange={handleModelChange}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatInput;
