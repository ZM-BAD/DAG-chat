import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import './styles/Sidebar.css';

// 模型Logo映射组件
const ModelLogo: React.FC<{ model: string; size?: number }> = ({ model, size = 14 }) => {
  const getLogoPath = (modelName: string): string => {
    const modelMap: { [key: string]: string } = {
      'deepseek': 'deepseek',
      'kimi': 'kimi',
      'qwen': 'qwen',
      'glm': 'zai'  // GLM模型对应zai.svg
    };

    const normalizedModel = modelName.toLowerCase();
    const logoName = modelMap[normalizedModel] || 'deepseek'; // 默认使用deepseek logo

    return `/assets/logo/${logoName}.svg`;
  };

  return (
    <img
      src={getLogoPath(model)}
      alt={model}
      style={{
        width: size,
        height: size,
        objectFit: 'contain'
      }}
      className="dialogue-model-logo"
    />
  );
};

// 解析多模型字符串并返回模型数组
const parseMultipleModels = (modelString: string): string[] => {
  if (!modelString) return [];
  return modelString.split(',').map(m => m.trim()).filter(m => m);
};

// 常量定义
const CURRENT_USER_ID = 'zm-bad';
const MAX_TITLE_LENGTH = 64;
const DEFAULT_TITLE = '未命名对话';

// 定义对话接口
interface Dialogue {
  id: string;
  user_id: string;
  title: string;
  model: string;
  create_time: string;
  update_time: string;
}

// SVG图标组件
const MoreIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="#666">
    <circle cx="12" cy="5" r="2"/>
    <circle cx="12" cy="12" r="2"/>
    <circle cx="12" cy="19" r="2"/>
  </svg>
);

const EditIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="#666">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
    <path d="M2 20h20v2H2z" opacity="0.3"/>
  </svg>
);

const TrashIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="#dc3545">
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
  </svg>
);

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
  dialogues: Dialogue[];
  selectedDialogueId: string | null;
  onDialogueDeleted?: () => void;
  onDialogueRenamed?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  onDialogueSelect,
  onNewDialogue,
  dialogues,
  selectedDialogueId,
  onDialogueDeleted,
  onDialogueRenamed
}) => {
  const [loading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const listRef = useRef<HTMLDivElement>(null);

  // 获取更多对话列表（用于滚动加载）
  const fetchMoreDialogues = async (page: number = 1) => {
    // 如果已经没有更多数据或已经在加载中，则不再请求
    if (!hasMore || loadingMore) {
      return;
    }

    setLoadingMore(true);

    try {
      const response = await axios.get<DialogueListResponse>('/api/v1/dialogue/list', {
        params: {
          user_id: CURRENT_USER_ID,
          page: page,
          page_size: 20
        }
      });

      if (response.data.code === 0) {
        const newDialogues = response.data.data.list;

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
      setLoadingMore(false);
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
      fetchMoreDialogues(currentPage + 1);
    }
  };

  // 监听滚动事件
  useEffect(() => {
    const listElement = listRef.current;
    if (listElement) {
      listElement.addEventListener('scroll', handleScroll);
      return () => {
        listElement.removeEventListener('scroll', handleScroll);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, loadingMore, hasMore]);

  // 处理对话选择
  const handleDialogueClick = (dialogueId: string) => {
    onDialogueSelect(dialogueId);
  };

  // 处理新建对话
  const handleNewDialogue = () => {
    onNewDialogue();
  };

  // 删除对话
  const handleDeleteDialogue = useCallback(async (dialogueId: string) => {
    if (!window.confirm('确定要删除这个对话吗？此操作不可撤销。')) {
      return;
    }

    try {
      const response = await axios.delete('/api/v1/dialogue/delete', {
        params: {
          conversation_id: dialogueId,
          user_id: CURRENT_USER_ID
        }
      });

      if (response.data.code === 0) {
        // 删除成功，通知父组件刷新对话列表
        setOpenMenuId(null);
        onDialogueDeleted?.();
      } else {
        alert('删除失败：' + response.data.message);
      }
    } catch (error) {
      console.error('删除对话失败:', error);
      alert('删除失败，请稍后重试');
    }
  }, [onDialogueDeleted]);

  // 重命名对话
  const handleRenameDialogue = useCallback(async (dialogueId: string, newTitle: string) => {
    const trimmedTitle = newTitle.trim();

    if (!trimmedTitle) {
      alert('标题不能为空');
      return;
    }

    if (trimmedTitle.length > MAX_TITLE_LENGTH) {
      alert(`标题长度不能超过${MAX_TITLE_LENGTH}个字符`);
      return;
    }

    try {
      const response = await axios.put('/api/v1/dialogue/rename', null, {
        params: {
          conversation_id: dialogueId,
          user_id: CURRENT_USER_ID,
          new_title: trimmedTitle
        }
      });

      if (response.data.code === 0) {
        // 重命名成功，通知父组件刷新对话列表
        setEditingId(null);
        setEditingTitle('');
        setOpenMenuId(null);
        onDialogueRenamed?.();
      } else {
        alert('重命名失败：' + response.data.message);
      }
    } catch (error) {
      console.error('重命名对话失败:', error);
      alert('重命名失败，请稍后重试');
    }
  }, [onDialogueRenamed]);

  // 开始编辑标题
  const startEditing = useCallback((dialogue: Dialogue) => {
    setEditingId(dialogue.id);
    setEditingTitle(dialogue.title);
    setOpenMenuId(null);
  }, []);

  // 完成编辑
  const finishEditing = useCallback((dialogueId: string) => {
    handleRenameDialogue(dialogueId, editingTitle);
  }, [handleRenameDialogue, editingTitle]);

  // 取消编辑
  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditingTitle('');
  }, []);

  // 点击其他地方关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.dialogue-item')) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

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
                onClick={(e) => {
                  const target = e.target as Element;
                  if (!target.closest('.dialogue-actions') && !target.closest('.dialogue-menu')) {
                    handleDialogueClick(dialogue.id);
                  }
                }}
              >
                <div className="dialogue-content">
                  {editingId === dialogue.id ? (
                    <input
                      type="text"
                      className="rename-input"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          finishEditing(dialogue.id);
                        } else if (e.key === 'Escape') {
                          cancelEditing();
                        }
                      }}
                      onBlur={() => finishEditing(dialogue.id)}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <div className="dialogue-title">{dialogue.title || DEFAULT_TITLE}</div>
                      <div className="dialogue-meta">
                        <span className="dialogue-time">
                          {new Date(dialogue.update_time).toLocaleDateString()}
                        </span>
                        <div className="dialogue-model">
                          {(() => {
                            const models = parseMultipleModels(dialogue.model);
                            return models.length > 0 ? (
                              <div className="dialogue-model-logos">
                                {models.map((model, index) => (
                                  <ModelLogo
                                    key={`${model}-${index}`}
                                    model={model}
                                    size={12}
                                  />
                                ))}
                              </div>
                            ) : (
                              <span className="dialogue-model-text">{dialogue.model}</span>
                            );
                          })()}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="dialogue-actions">
                  <button
                    className="dialogue-more-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === dialogue.id ? null : dialogue.id);
                    }}
                    title="更多操作"
                  >
                    <MoreIcon />
                  </button>
                  {openMenuId === dialogue.id && (
                    <div className="dialogue-menu">
                      <button
                        className="dialogue-menu-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(dialogue);
                        }}
                      >
                        <EditIcon />
                        重命名
                      </button>
                      <button
                        className="dialogue-menu-item delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDialogue(dialogue.id);
                        }}
                      >
                        <TrashIcon />
                        删除
                      </button>
                    </div>
                  )}
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