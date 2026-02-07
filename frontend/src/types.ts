// 定义对话接口
export interface Dialogue {
  id: string;
  user_id: string;
  title: string;
  model: string;
  create_time: string;
  update_time: string;
}

// 定义消息接口
export interface Message {
  id: string; // 消息唯一ID（新消息为前端临时生成，历史消息为MongoDB _id）
  content: string;
  role: 'user' | 'assistant';
  thinkingContent?: string; // 思考内容（仅assistant角色使用）
  isThinkingExpanded?: boolean; // 思考内容是否展开（仅assistant角色使用）
  isWaitingForFirstToken?: boolean; // 是否正在等待首token（仅assistant角色使用）
  parent_ids?: string[]; // 父消息ID列表（MongoDB _id）
  children?: string[]; // 子消息ID列表（MongoDB _id），仅历史消息有此字段
  model?: string; // 模型名称（仅assistant角色使用）
  deepThinkingEnabled?: boolean; // 是否启用了深度思考模式（仅assistant角色使用）
}

// 定义API响应接口
export interface ChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// 定义获取对话历史的响应接口
export interface DialogueHistoryResponse {
  code: number;
  message: string;
  data: Message[];
}

// 定义对话列表API响应接口
export interface DialogueListResponse {
  code: number;
  message: string;
  data: {
    list: Dialogue[];
    total: number;
    page: number;
    page_size: number;
  };
}