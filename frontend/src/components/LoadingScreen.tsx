import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import '../styles/LoadingScreen.css';

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: FC<LoadingScreenProps> = ({ message }) => {
  const { t } = useTranslation();
  return (
    <div className="loading-screen">
      <div className="loading-spinner"></div>
      <p className="loading-message">{message || t('common.loading')}</p>
    </div>
  );
};

export default LoadingScreen;
