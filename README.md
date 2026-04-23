# AI Dev Workflow

AI 驱动的软件开发全流程工作流平台。通过 AI 主导执行、人工审批确认的模式，自动化软件开发的各个阶段。

## 核心功能

- **可视化工作流画布** — 拖拽节点构建自定义开发流程，支持节点连线、缩放平移、撤销/重做
- **9 种节点类型** — PRD 审核、需求评审、代码开发、代码自测、代码 Review、项目提测、代码上线、AI 自定义任务、人工审批节点
- **AI 主导 + 人工审批** — 每个阶段由 AI 自动执行，人工确认后流转至下一阶段
- **Prompt 三层模板** — 系统默认 / 项目级 / 节点级三层 Prompt，高层覆盖低层，灵活配置
- **AI 实时对话** — 在每个节点内与 AI 实时对话（SSE 流式输出），自动读取节点 Prompt 作为 system message
- **多模型支持** — 兼容 OpenAI API 格式，可对接 DeepSeek、GPT、Qwen、Claude 等模型
- **项目管理** — 创建项目、管理工作流、统计数据

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 8 |
| UI 组件 | Ant Design 6 |
| 画布引擎 | React Flow (@xyflow/react) |
| 状态管理 | Zustand 5 |
| 路由 | React Router v7 |
| 后端 | NestJS 11 + TypeScript |
| 数据库 | MySQL + TypeORM |
| AI 接口 | OpenAI SDK（兼容 DeepSeek / GPT / Qwen 等） |
| 认证 | JWT + Passport + bcrypt |
| 包管理 | pnpm workspace (monorepo) |

## 项目结构

```
ai-workflow/
├── packages/
│   ├── frontend/                # React 前端应用
│   │   ├── src/
│   │   │   ├── api/             # 接口请求 (auth, workbench, workflow)
│   │   │   ├── components/      # 公共组件 (Header, Layout, AuthRoute)
│   │   │   ├── pages/
│   │   │   │   ├── Login/       # 登录/注册
│   │   │   │   ├── Dashboard/   # 项目工作台
│   │   │   │   ├── Pipeline/    # 工作流画布
│   │   │   │   │   └── components/
│   │   │   │   │       ├── stageNode/    # 自定义画布节点
│   │   │   │   │       ├── stageEdge/    # 自定义画布连线
│   │   │   │   │       ├── nodePanel/    # 左侧节点面板
│   │   │   │   │       ├── nodePages/    # 画布主区域
│   │   │   │   │       ├── nodeDrawer/   # 节点详情抽屉
│   │   │   │   │       ├── nodeConfig/   # 节点配置面板
│   │   │   │   │       └── nodeChat/     # AI 对话面板
│   │   │   │   └── Settings/    # 系统设置
│   │   │   ├── store/           # Zustand 状态管理
│   │   │   └── utils/           # 工具函数 (Axios 封装, Auth)
│   │   └── vite.config.ts
│   ├── backend/                 # NestJS 后端服务
│   │   ├── src/
│   │   │   ├── common/          # 公共模块 (JWT Guard)
│   │   │   └── modules/
│   │   │       ├── auth/        # 认证模块 (注册/登录/JWT)
│   │   │       ├── workbench/   # 工作台模块 (项目 CRUD/统计)
│   │   │       ├── workflow/    # 工作流模块 (画布/节点配置)
│   │   │       └── ai/         # AI 模块 (对话/SSE 流式)
│   │   └── .env
│   └── shared/                  # 共享类型定义
│       └── src/types/           # User, Project, Workflow 类型
├── prototype/                   # HTML 原型文件
├── pnpm-workspace.yaml
└── package.json
```

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 10
- MySQL >= 8.0

### 1. 安装依赖

```bash
pnpm install
```

### 2. 构建共享包

```bash
cd packages/shared && pnpm build
```

### 3. 配置环境变量

```bash
cp packages/backend/.env.example packages/backend/.env
```

编辑 `packages/backend/.env`：

```env
# 数据库
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_DATABASE=ai_workflow

# JWT
JWT_SECRET=your_jwt_secret

# AI 模型（OpenAI 兼容格式）
AI_API_KEY=your_api_key
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
```

### 4. 创建数据库

```sql
CREATE DATABASE ai_workflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 5. 启动开发服务

```bash
# 启动后端 (端口 3000)
pnpm dev:back

# 启动前端 (端口 5173)
pnpm dev:web
```

访问 http://localhost:5173

## API 接口

### 认证模块

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录，返回 JWT Token |

### 工作台模块（需要 JWT）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/workbench/stats` | 获取统计数据 |
| GET | `/api/workbench/projects` | 获取项目列表 |
| GET | `/api/workbench/project/:id` | 获取项目详情 |
| POST | `/api/workbench/projects` | 创建项目 |

### 工作流模块（需要 JWT）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/workflows` | 创建工作流 |
| GET | `/api/workflows/project/:projectId` | 获取项目下的工作流列表 |
| GET | `/api/workflows/:id` | 获取工作流详情 |
| GET | `/api/workflows/:id/canvas` | 获取画布数据 |
| PUT | `/api/workflows/:id/canvas` | 保存画布数据 |
| POST | `/api/workflows/:id/nodes` | 创建节点配置 |
| GET | `/api/workflows/:id/nodes/:nodeKey` | 获取节点配置 |
| PUT | `/api/workflows/:id/nodes/:nodeKey` | 更新节点配置 |
| DELETE | `/api/workflows/:id/nodes/:nodeKey` | 删除节点配置 |
| GET | `/api/node-categories` | 获取节点分类列表 |

### AI 模块（需要 JWT）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/chat` | AI 对话（SSE 流式返回） |
| GET | `/api/ai/chat-history/:workflowId/:nodeKey` | 获取对话历史 |
| DELETE | `/api/ai/chat-history/:workflowId/:nodeKey` | 清空对话历史 |

## 部署

### 服务器要求

- Node.js >= 18
- MySQL >= 8.0
- Nginx
- PM2

### 部署步骤

```bash
# 1. 构建
cd packages/shared && pnpm build
cd ../backend && pnpm build
cd ../frontend && pnpm build

# 2. 上传到服务器
# 后端：项目根目录（含 packages/backend/dist, packages/shared/dist）
# 前端：packages/frontend/dist/ 下的文件

# 3. 服务器安装依赖
pnpm install --prod

# 4. PM2 启动后端
cd packages/backend
pm2 start dist/main.js --name ai-workflow

# 5. Nginx 配置
```

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your_domain;

    root /path/to/frontend/dist;
    index index.html;

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # SSE 流式支持
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
    }

    # 前端路由兜底（SPA）
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## 开发进度

### 已完成

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 | 基础修复（CORS、全局前缀、外键、共享类型包） | ✅ |
| P1 | 工作流后端模块（实体、DTO、Service、Controller） | ✅ |
| P2 | 前端 API 对接（替换所有 mock 数据为真实接口） | ✅ |
| P3 | AI 对话集成（OpenAI 兼容 API + SSE 流式输出 + 对话历史） | ✅ |

### 进行中 / 计划中

#### P4-A：工作流执行引擎（基础版）

按画布连线顺序串行执行节点，跑通完整流程。

- [ ] 解析画布 edges 确定执行顺序（拓扑排序）
- [ ] 节点输入优先级：AI 对话内容 > 可编辑的默认输入 > 上一个节点的输出
- [ ] 每个节点调用 AI 模型，上一个输出作为下一个输入
- [ ] 节点状态实时更新（pending → running → approved / failed）
- [ ] 暂停 / 恢复功能
- [ ] 执行失败时停在当前节点，记录错误信息

#### P4-B：Git 集成

AI 拉取代码、修改文件、自动提交。

- [ ] 项目设置页：关联 Git 仓库地址 + 分支
- [ ] AI 执行时拉取代码到服务器临时目录
- [ ] AI 根据执行结果修改代码 / 文档，写入文件
- [ ] 自动 Git commit + push 到指定分支

#### P4-C：执行日志

节点抽屉中的「执行日志」Tab。

- [ ] 记录每次执行的输入、输出、状态、耗时
- [ ] 执行失败时展示错误详情
- [ ] 支持查看历史执行记录

#### P5：功能增强

- [ ] 人工审批节点（暂停等待审批 → 通过/驳回 → 继续执行）
- [ ] 系统设置（AI 模型配置、Git 凭证管理）
- [ ] UI 优化（Markdown 渲染、节点状态动画）
- [ ] Docker 部署

## License

MIT
