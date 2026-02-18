// 从环境变量获取配置，添加默认值防止未定义
// 从环境变量获取配置，添加默认值防止未定义
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const DEFAULT_USER_ID = import.meta.env.VITE_DEFAULT_USER_ID || 'test-user';

// API路径配置
export const API_ENDPOINTS = {
  // 模型相关
  GET_MODELS: '/api/v1/models',

  // 对话相关
  CREATE_CONVERSATION: '/api/v1/create-conversation',
  CHAT: '/api/v1/chat',
  DIALOGUE_LIST: '/api/v1/dialogue/list',
  DIALOGUE_HISTORY: '/api/v1/dialogue/history',
};

// API配置导出
export const API_CONFIG = {
  baseUrl: API_BASE_URL,
  defaultUserId: DEFAULT_USER_ID,
};

// 构建完整API URL
export const buildApiUrl = (endpoint: string): string => {
  return `${API_BASE_URL}${endpoint}`;
};
