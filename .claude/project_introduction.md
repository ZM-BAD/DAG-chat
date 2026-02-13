# DAG-chat 项目介绍

## 技术栈

### 后端 (Python/FastAPI)
- **Python 版本**: >= 3.14（推荐使用 3.14.3）
- **框架**: FastAPI + Uvicorn
- **数据库**: MySQL (通过 SQLAlchemy ORM)
- **LLM SDK**:
  - OpenAI SDK
  - zai-sdk
- **其他依赖**:
  - Pydantic (数据验证)
  - mysql-connector-python
  - pymongo

### 前端 (React + TypeScript)
- **构建工具**: Vite
- **框架**: React 18
- **语言**: TypeScript
- **UI 相关**:
  - react-markdown (Markdown 渲染)
  - react-syntax-highlighter (代码高亮)
  - remark/rehyp 插件 (支持 GFM、数学公式、脚注等)
- **国际化**: i18next + react-i18next
- **HTTP 客户端**: axios

## 项目结构

```
DAG-chat/
├── backend/
│   ├── api/
│   │   ├── main.py           # FastAPI 应用入口
│   │   ├── router.py         # 路由注册
│   │   ├── routes/           # API 路由
│   │   │   ├── chat.py       # 聊天相关接口
│   │   │   └── conversation.py  # 对话管理接口
│   │   └── services/         # 业务逻辑层
│   │       ├── model_factory.py    # 模型工厂
│   │       ├── deepseek_service.py
│   │       ├── glm_service.py
│   │       ├── kimi_service.py
│   │       └── qwen_service.py
│   ├── database/             # 数据库相关
│   ├── models/               # 数据模型
│   ├── tests/                # 单元测试
│   ├── run_api.py            # 启动脚本
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/       # React 组件
│   │   ├── hooks/           # 自定义 Hooks
│   │   ├── contexts/        # React Context
│   │   ├── i18n/            # 国际化配置
│   │   ├── utils/           # 工具函数
│   │   ├── types.ts         # TypeScript 类型定义
│   │   └── App.tsx          # 应用入口
│   ├── package.json
│   └── vite.config.ts
├── sql/                      # 数据库脚本
├── start.sh                  # 快速启动脚本
└── README.md
```

## 核心功能

### 对话管理
- 对话列表的增删改查
- 支持分页查询

### 聊天功能

#### 问答对概念
- **问答对**是对话的**最小逻辑单元，不可分割**，由一个用户问题和一个大模型回答组成
- 在正常情况下（无异常中止）：
  - `user.message.children` 只有一个 id（即对应的 assistant.message.id）
  - `assistant.message.parent_ids` 中也只有一个 id（即对应的 user.message.id）
- 一问一答紧密关联，共同构成完整的交互单元

#### DAG 对话结构
- 使用有向无环图 (DAG) 表示对话历史
- 每条消息有 `parent_ids` 和 `children` 字段
- 支持线性、分支和合并对话
- **流式响应**: 通过 SSE (Server-Sent Events) 返回消息
- **深度思考模式**: 部分模型支持显示思考过程 (`thinkingContent`)
- **多模型支持**: DeepSeek、智谱 GLM、Kimi、Qwen 等

### 关键数据结构 (TypeScript)

```typescript
// 对话
interface Dialogue {
  id: string;
  user_id: string;
  title: string;
  model: string;
  create_time: string;
  update_time: string;
}

// 消息 (DAG 结构)
interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  thinkingContent?: string;       // 思考内容
  isThinkingExpanded?: boolean;
  parent_ids?: string[];          // 父消息ID列表
  children?: string[];             // 子消息ID列表
  model?: string;
  deepThinkingEnabled?: boolean;
}
```

## 启动方式

```bash
# 启动后端 (运行在 8000 端口)
cd backend && python run_api.py

# 启动前端 (开发模式)
cd frontend && npm run dev

# 或使用统一脚本
./start.sh
```

## 开发注意事项

1. **国际化**: 使用 i18next，新增文案需在 `src/i18n/` 下配置
2. **类型定义**: 主要类型定义在 `src/types.ts`
3. **API 基础路径**: 后端 API 运行在 `http://localhost:8000`
4. **数据库**: 使用 MySQL，SQL 脚本在 `sql/` 目录
