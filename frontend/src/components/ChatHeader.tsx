import { FC } from 'react';

interface ChatHeaderProps {
  title: string;
}

const ChatHeader: FC<ChatHeaderProps> = ({ title }) => {
  return (
    <div className="chat-header">
      <h1>{title}</h1>
    </div>
  );
};

export default ChatHeader;
