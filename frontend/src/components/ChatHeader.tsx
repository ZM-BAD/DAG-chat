import React from 'react';

interface ChatHeaderProps {
  title: string;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ title }) => {
  return (
    <div className="chat-header">
      <h1>{title}</h1>
    </div>
  );
};

export default ChatHeader;
