# AI Dev Workflow

AI 驱动的软件开发全流程工作流平台。通过 AI 主导执行、人工审批确认的模式，自动化软件开发的各个阶段。

## 核心功能

- **可视化工作流画布** — 拖拽节点构建自定义开发流程，支持节点连线、缩放平移
- **7 个标准开发阶段** — PRD 审核 → 需求评审 → 代码开发 → 代码自测 → 代码 Review → 项目提测 → 代码上线
- **AI 主导 + 人工审批** — 每个阶段由 AI 自动执行，人工确认后流转至下一阶段
- **多模型支持** — 支持 OpenAI、Claude、自部署模型，可为每个阶段指定不同的 AI 模型
- **项目管理** — 创建项目、关联 Git 仓库、管理工作流
- **实时对话** — 在每个节点内与 AI 实时对话，修改产出内容

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 8 |
| UI 组件 | Ant Design 6 |
| 状态管理 | Zustand |
| 路由 | React Router v7 |
| 后端 | NestJS 11 + TypeScript |
| 数据库 | MySQL + TypeORM |
| 认证 | JWT + Passport + bcrypt |
| 包管理 | pnpm workspace (monorepo) |

## 项目结构

```
ai-workflow/
├── packages/
│   ├── frontend/          # React 前端应用
│   │   ├── src/
│   │   │   ├── api/       # 接口请求
│   │   │   ├── components/# 公共组件 (Header, Layout, PageTip, AuthRoute)
│   │   │   ├── pages/     # 页面 (Login, Dashboard, Pipeline, Settings, StageDetail)
│   │   │   ├── store/     # Zustand 状态管理
│   │   │   └── utils/     # 工具函数 (Axios 封装)
│   │   └── vite.config.ts
│   ├── backend/           # NestJS 后端服务
│   │   ├── src/
│   │   │   ├── common/    # 公共模块 (JWT Guard)
│   │   │   └── modules/
│   │   │       ├── auth/      # 认证模块 (注册/登录/JWT)
│   │   │       └── workbench/ # 工作台模块 (项目 CRUD/统计)
│   │   └── .env
│   └── shared/            # 共享类型定义
├── prototype/             # HTML 原型文件
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

### 2. 配置后端环境变量

```bash
cp packages/backend/.env.example packages/backend/.env
```

编辑 `packages/backend/.env`：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_DATABASE=ai_dev_workflow
JWT_SECRET=your_jwt_secret
```

### 3. 创建数据库

```sql
CREATE DATABASE ai_dev_workflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. 启动开发服务

```bash
# 启动后端 (端口 3000)
cd packages/backend
pnpm start:dev

# 启动前端 (端口 5173)
cd packages/frontend
pnpm dev
```

访问 http://localhost:5173

## API 接口

### 认证模块

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/register` | 注册 |
| POST | `/auth/login` | 登录，返回 JWT Token |

### 工作台模块（需要 JWT）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/workbench/stats` | 获取统计数据 |
| GET | `/workbench/projects` | 获取项目列表 |
| GET | `/workbench/project/:id` | 获取项目详情 |
| POST | `/workbench/projects` | 创建项目 |

## 开发进度

- [x] 项目脚手架搭建 (monorepo)
- [x] 用户认证模块 (注册/登录/JWT)
- [x] 工作台模块 (项目 CRUD/统计)
- [x] 前端登录/注册页
- [x] 前端工作台页 (统计卡片/项目列表/新建项目)
- [x] 前端流水线页 (占位)
- [x] 前端系统设置页 (占位)
- [x] UI 原型 (4 页完整原型)
- [ ] 工作流画布 (React Flow)
- [ ] 工作流引擎 (状态机/阶段流转)
- [ ] AI Gateway (多模型适配)
- [ ] Git 集成 (GitHub/GitLab)
- [ ] 阶段 AI 对话 (SSE 流式输出)
- [ ] 系统设置 (AI 模型配置/Git 凭证)
- [ ] Docker 部署

## License

待定
