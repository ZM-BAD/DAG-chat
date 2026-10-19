import { useEffect, useState, FC } from 'react';
import '../styles/Toast.css';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose: () => void;
}

const Toast: FC<ToastProps> = ({
  message,
  type = 'success',
  duration = 3000,
  onClose,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    let closeTimer: ReturnType<typeof setTimeout>;
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
      closeTimer = setTimeout(onClose, 200);
    }, duration);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(closeTimer);
    };
  }, [duration, onClose]);

  return (
    <div
      className={`toast toast-${type} ${isVisible ? 'toast-visible' : 'toast-hidden'}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
};

export default Toast;
