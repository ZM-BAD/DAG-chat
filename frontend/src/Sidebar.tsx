import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './styles/Sidebar.css';

// 定义对话接口
interface Dialogue {
  id: string;
  user_id: string;
  title: string;
  model: string;
  create_time: string;
  update_time: string;
}

// 定义对话列表API响应接口
interface DialogueListResponse {
  code: number;
  message: string;
  data: {
    list: Dialogue[];
    total: number;
    page: number;
    page_size: number;
  };
}

interface SidebarProps {
  onDialogueSelect: (dialogueId: string) => void;
  onNewDialogue: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onDialogueSelect, onNewDialogue }) => {
  const [dialogues, setDialogues] = useState<Dialogue[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [selectedDialogueId, setSelectedDialogueId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const listRef = useRef<HTMLDivElement>(null);

  // 获取对话列表
  const fetchDialogues = async (page: number = 1, append: boolean = false) => {
    // 如果是加载更多且已经没有更多数据或已经在加载中，则不再请求
    if ((append && (!hasMore || loadingMore)) || (page === 1 && loading)) {
      return;
    }

    // 设置加载状态
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await axios.get<DialogueListResponse>('/api/v1/dialogue/list', {
        params: {
          user_id: 'zm-bad', // 这里可以根据实际登录用户调整
          page: page,
          page_size: 20 // 每页加载20条，可根据需要调整
        }
      });
      
      if (response.data.code === 0) {
        const newDialogues = response.data.data.list;
        
        // 更新对话列表
        if (append) {
          setDialogues(prev => [...prev, ...newDialogues]);
        } else {
          setDialogues(newDialogues);
        }
        
        // 判断是否还有更多数据
        setHasMore(newDialogues.length === response.data.data.page_size);
        
        // 更新当前页码
        setCurrentPage(page);
      } else {
        console.error('获取对话列表失败:', response.data.message);
      }
    } catch (error) {
      console.error('获取对话列表时发生错误:', error);
    } finally {
      // 重置加载状态
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  };

  // 处理滚动加载
  const handleScroll = () => {
    if (!listRef.current || loadingMore || !hasMore) {
      return;
    }
    
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    
    // 当滚动到距离底部20px时触发加载更多
    if (scrollHeight - scrollTop - clientHeight < 20) {
      fetchDialogues(currentPage + 1, true);
    }
  };

  // 组件挂载时获取对话列表
  useEffect(() => {
    fetchDialogues();
  }, []);

  // 监听滚动事件
  useEffect(() => {
    const listElement = listRef.current;
    if (listElement) {
      listElement.addEventListener('scroll', handleScroll);
      return () => {
        listElement.removeEventListener('scroll', handleScroll);
      };
    }
  }, [currentPage, loadingMore, hasMore]);

  // 处理对话选择
  const handleDialogueClick = (dialogueId: string) => {
    setSelectedDialogueId(dialogueId);
    onDialogueSelect(dialogueId);
  };

  // 处理新建对话
  const handleNewDialogue = () => {
    setSelectedDialogueId(null);
    onNewDialogue();
  };

  return (
    <div className="sidebar">
      <div className="sidebar-branding">
        <h3>UniformLLM</h3>
        <p>一个统一的大语言模型交互平台</p>
      </div>
      <div className="sidebar-header">
        <h2>我的对话</h2>
        <button 
          className="new-dialogue-button" 
          onClick={handleNewDialogue}
          title="新建对话"
        >
          +
        </button>
      </div>
      
      <div className="dialogue-list" ref={listRef}>
        {loading ? (
          <div className="loading">加载中...</div>
        ) : dialogues.length === 0 ? (
          <div className="empty-state">暂无对话</div>
        ) : (
          [
            ...dialogues.map(dialogue => (
              <div
                key={dialogue.id}
                className={`dialogue-item ${selectedDialogueId === dialogue.id ? 'selected' : ''}`}
                onClick={() => handleDialogueClick(dialogue.id)}
              >
                <div className="dialogue-title">{dialogue.title}</div>
                <div className="dialogue-meta">
                  <span className="dialogue-time">
                    {new Date(dialogue.update_time).toLocaleDateString()}
                  </span>
                  <span className="dialogue-model">{dialogue.model}</span>
                </div>
              </div>
            )),
            // 显示加载更多的状态
            loadingMore && <div className="loading-more">加载更多...</div>
          ]
        )}
      </div>
    </div>
  );
};

export default Sidebar;