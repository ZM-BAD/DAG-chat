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
import { useToast } from '../contexts/ToastContext';

// 自定义模型选择器组件
interface CustomModelSelectProps {
  selectedModel: string;
  availableModels: { value: string; label: string }[];
  onModelChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  dropUp?: boolean; // 是否向上展开
}

const CustomModelSelect: FC<CustomModelSelectProps> = ({
  selectedModel,
  availableModels,
  onModelChange,
  dropUp = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [internalDropUp, setInternalDropUp] = useState(dropUp);
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
      setInternalDropUp(true);
    } else {
      setInternalDropUp(false);
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
        <div
          className={`custom-select-dropdown ${internalDropUp ? 'drop-up' : ''}`}
        >
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

interface WelcomeScreenProps {
  inputMessage: string;
  isLoading: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  handleInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  handleKeyPress: (e: KeyboardEvent) => void;
  handleSendMessage: () => void;
  onDeepThinkingChange?: (enabled: boolean) => void;
  onSearchChange?: (enabled: boolean) => void;
  onModelChange?: (model: string) => void;
  initialDeepThinking?: boolean;
  initialSearch?: boolean;
  initialModel?: string;
  availableModels?: { value: string; label: string }[];
}

const WelcomeScreen: FC<WelcomeScreenProps> = ({
  inputMessage,
  isLoading,
  textareaRef,
  handleInputChange,
  handleKeyPress,
  handleSendMessage,
  onDeepThinkingChange,
  onSearchChange,
  onModelChange,
  initialDeepThinking = false,
  initialSearch = false,
  initialModel = 'deepseek',
  availableModels = [],
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [deepThinkingEnabled, setDeepThinkingEnabled] =
    useState(initialDeepThinking);
  const [searchEnabled, setSearchEnabled] = useState(initialSearch);
  const [selectedModel, setSelectedModel] = useState(initialModel);

  // 同步 hook 层的状态变化到组件本地状态
  useEffect(() => {
    setDeepThinkingEnabled(initialDeepThinking);
  }, [initialDeepThinking]);

  const handleDeepThinkingToggle = () => {
    // MiniMax 强制开启思考，禁止关闭
    if (
      deepThinkingEnabled &&
      selectedModel.toLowerCase().includes('minimax')
    ) {
      toast.showToast(t('chat.minimaxThinkingLocked'), 'info', 2000);
      return;
    }
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
    // MiniMax 深度思考联动逻辑统一在 useChat.handleModelChangeWithDeepThinking 中处理
  };
  return (
    <div className="welcome-container">
      <div className="welcome-content">
        <h2 className="welcome-title">{t('welcome.title')}</h2>
        <div className="chat-input-wrapper">
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
            onClick={handleSendMessage}
            disabled={isLoading}
            className="send-button"
            aria-label={isLoading ? '发送中' : '发送'}
          >
            {/* 按钮内容由CSS伪元素控制 */}
          </button>
        </div>

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
    </div>
  );
};

export default WelcomeScreen;
