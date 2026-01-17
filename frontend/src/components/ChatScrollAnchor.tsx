import React, { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';

interface ChatScrollAnchorProps {
  trackVisibility: boolean; // 是否跟踪可见性（对应 isLoading）
  isAtBottom: boolean; // 用户是否在底部
  scrollAreaRef: React.RefObject<HTMLDivElement>; // 滚动容器引用
}

export const ChatScrollAnchor: React.FC<ChatScrollAnchorProps> = ({
  trackVisibility,
  isAtBottom,
  scrollAreaRef,
}) => {
  const { ref, inView, entry } = useInView({
    trackVisibility,
    delay: 100,
  });

  useEffect(() => {
    // 只有当用户在底部、正在跟踪可见性、且锚点不在视口中时才自动滚动
    if (isAtBottom && trackVisibility && !inView) {
      if (!scrollAreaRef.current) return;

      const scrollAreaElement = scrollAreaRef.current;

      // 使用平滑滚动到底部
      scrollAreaElement.scrollTop =
        scrollAreaElement.scrollHeight - scrollAreaElement.clientHeight;
    }
  }, [inView, entry, isAtBottom, trackVisibility, scrollAreaRef]);

  // 返回一个不可见的锚点元素
  return <div ref={ref} className="scroll-anchor" />;
};
