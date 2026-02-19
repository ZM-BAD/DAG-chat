import { useState, useRef, useEffect, FC } from 'react';
import i18n from '../i18n/config';

interface LanguageSwitcherProps {
  className?: string;
}

interface LanguageOption {
  value: string;
  label: string;
  nativeLabel: string;
}

const LanguageSwitcher: FC<LanguageSwitcherProps> = ({ className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const languages: LanguageOption[] = [
    { value: 'en-US', label: 'English', nativeLabel: 'English' },
    { value: 'zh-CN', label: 'Chinese', nativeLabel: '中文' },
  ];

  const handleLanguageChange = (language: string) => {
    void i18n.changeLanguage(language);
    localStorage.setItem('language', language);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div
      className={`language-switcher-container ${className || ''}`}
      ref={dropdownRef}
    >
      <button
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        className="language-switcher-button"
        title="Change Language"
        aria-label="Change Language"
      >
        <div className="language-icon">
          <span className="language-icon-zh">文</span>
          <span className="language-icon-en">A</span>
        </div>
        <span className={`language-arrow ${isOpen ? 'open' : ''}`}>▼</span>
      </button>

      {isOpen && (
        <div className="language-dropdown">
          {languages.map((lang) => (
            <button
              key={lang.value}
              onClick={() => {
                handleLanguageChange(lang.value);
              }}
              className={`language-option ${i18n.language === lang.value ? 'active' : ''}`}
            >
              {lang.value === 'zh-CN' ? '中文' : 'English'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
