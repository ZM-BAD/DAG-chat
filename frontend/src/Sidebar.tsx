import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { API_CONFIG } from './config/api';
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
const MAX_TITLE_LENGTH = 64;

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

const CollapseIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
  </svg>
);

const ExpandIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
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
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  onDialogueSelect,
  onNewDialogue,
  dialogues,
  selectedDialogueId,
  onDialogueDeleted,
  onDialogueRenamed,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const { t } = useTranslation();
  const [loading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<'bottom' | 'top'>('bottom');
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
          user_id: API_CONFIG.defaultUserId,
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
    if (!window.confirm(t('dialogue.deleteConfirm'))) {
      return;
    }

    try {
      const response = await axios.delete('/api/v1/dialogue/delete', {
        params: {
          conversation_id: dialogueId,
          user_id: API_CONFIG.defaultUserId
        }
      });

      if (response.data.code === 0) {
        // 删除成功，通知父组件刷新对话列表
        setOpenMenuId(null);
        onDialogueDeleted?.();
      } else {
        alert(t('dialogue.deleteFailed') + response.data.message);
      }
    } catch (error) {
      console.error('删除对话失败:', error);
      alert(t('dialogue.deleteFailedRetry'));
    }
  }, [onDialogueDeleted]);

  // 重命名对话
  const handleRenameDialogue = useCallback(async (dialogueId: string, newTitle: string) => {
    const trimmedTitle = newTitle.trim();

    if (!trimmedTitle) {
      alert(t('dialogue.titleCannotBeEmpty'));
      return;
    }

    if (trimmedTitle.length > MAX_TITLE_LENGTH) {
      alert(t('dialogue.titleTooLong', { maxLength: MAX_TITLE_LENGTH }));
      return;
    }

    try {
      const response = await axios.put('/api/v1/dialogue/rename', null, {
        params: {
          conversation_id: dialogueId,
          user_id: API_CONFIG.defaultUserId,
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
        alert(t('dialogue.renameFailed') + response.data.message);
      }
    } catch (error) {
      console.error('重命名对话失败:', error);
      alert(t('dialogue.renameFailedRetry'));
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
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      {/* 收起状态下的展开按钮 */}
      {isCollapsed && (
        <div className="sidebar-collapsed-controls">
          <button 
            className="sidebar-expand-button" 
            onClick={onToggleCollapse}
            title={t('sidebar.expand')}
          >
            <ExpandIcon />
          </button>
          <button 
            className="sidebar-new-button" 
            onClick={handleNewDialogue}
            title={t('chat.newChat')}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
        </div>
      )}

      {/* 展开状态下的完整侧边栏 */}
      {!isCollapsed && (
        <>
          <div className="sidebar-branding">
            <h3>DAG-chat</h3>
            <p>{t('sidebar.description')}</p>
          </div>
          <div className="sidebar-header">
            <h2>{t('sidebar.title')}</h2>
            <div className="sidebar-header-buttons">
              <button 
                className="sidebar-collapse-button" 
                onClick={onToggleCollapse}
                title={t('sidebar.collapse')}
              >
                <CollapseIcon />
              </button>
              <button 
                className="new-dialogue-button" 
                onClick={handleNewDialogue}
                title={t('chat.newChat')}
              >
                +
              </button>
            </div>
          </div>
          
          <div className="dialogue-list" ref={listRef}>
            {loading ? (
              <div className="loading">{t('sidebar.loading')}</div>
            ) : dialogues.length === 0 ? (
              <div className="empty-state">{t('sidebar.empty')}</div>
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
                          <div className="dialogue-title">{dialogue.title || t('dialogue.defaultTitle')}</div>
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
                                ) : null;
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
                              
                              // 计算菜单位置
                              const buttonElement = e.currentTarget;
                              const dialogueItemElement = buttonElement.closest('.dialogue-item');
                              if (dialogueItemElement) {
                                const rect = dialogueItemElement.getBoundingClientRect();
                                const viewportHeight = window.innerHeight;
                                const menuHeight = 80; // 预估菜单高度
                                
                                // 判断显示在底部是否会溢出屏幕
                                if (rect.bottom + menuHeight > viewportHeight) {
                                  setMenuPosition('top');
                                } else {
                                  setMenuPosition('bottom');
                                }
                              }
                              
                              setOpenMenuId(openMenuId === dialogue.id ? null : dialogue.id);
                            }}
                            title={t('sidebar.moreActions')}
                          >
                            <MoreIcon />
                          </button>
                          {openMenuId === dialogue.id && (
                            <div className={`dialogue-menu ${menuPosition === 'top' ? 'dialogue-menu-top' : ''}`}>
                              <button
                                className="dialogue-menu-item"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditing(dialogue);
                                }}
                              >
                                <EditIcon />
                                {t('dialogue.rename')}
                              </button>
                              <button
                                className="dialogue-menu-item delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteDialogue(dialogue.id);
                                }}
                              >
                                <TrashIcon />
                                {t('dialogue.delete')}
                              </button>
                            </div>
                          )}
                    </div>
                  </div>
                )),
                // 显示加载更多的状态
                loadingMore && <div className="loading-more">{t('sidebar.loadingMore')}</div>
              ]
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Sidebar;