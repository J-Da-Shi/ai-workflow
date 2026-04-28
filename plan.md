 P5-A：Prompt 模板优化 + 清理 P4-A 遗留                                                                                                   │
     │                                                                                                                                          │
     │ Context                                                                                                                                  │
     │                                                                                                                                          │
     │ P4-A 工作流执行引擎已基本跑通（节点执行、审批、串行传递均可用）。当前问题：                                                              │
     │ 1. 后端/前端遗留了调试用的 console.log，需要清理                                                                                         │
     │ 2. 节点 prompt 模板过于简短（一句话），AI 产出质量低，不可用                                                                             │
     │ 3. 前端 stageNode 里遗留了不再需要的 sync-executions 事件逻辑                                                                            │
     │                                                                                                                                          │
     │ 团队技术栈：React + NestJS + TypeORM + MySQL，代码托管在 GitHub。                                                                        │
     │                                                                                                                                          │
     │ 整体路线图（本次只做 P5-A）                                                                                                              │
     │                                                                                                                                          │
     │ P5-A：Prompt 模板优化 + 清理遗留  ← 当前                                                                                                 │
     │ P5-B：Claude Code SDK 接入                                                                                                               │
     │ P5-C：在线代码编辑器                                                                                                                     │
     │ P5-D：GitHub 集成（分支/提交/PR）                                                                                                        │
     │ P5-E：异常处理与回滚                                                                                                                     │
     │                                                                                                                                          │
     │ ---                                                                                                                                      │
     │ 步骤 1：清理 P4-A 遗留 debug 日志                                                                                                        │
     │                                                                                                                                          │
     │ 后端                                                                                                                                     │
     │                                                                                                                                          │
     │ 改 backend/src/modules/execution/execution.service.ts                                                                                    │
     │                                                                                                                                          │
     │ 删除 approveNode 中的 3 处 console.log：                                                                                                 │
     │ - console.log('[approveNode] userId:', userId, ...)                                                                                      │
     │ - console.log('[approveNode] 准备调用 continueWorkflow')                                                                                 │
     │ - console.log('[approveNode] userId 为空，跳过 continueWorkflow')                                                                        │
     │                                                                                                                                          │
     │ 删除 continueWorkflow 中的 3 处 console.log：                                                                                            │
     │ - console.log('[continueWorkflow] 开始, nodeKey:', ...)                                                                                  │
     │ - console.log('[continueWorkflow] nodes:', ...)                                                                                          │
     │ - console.log('[continueWorkflow] edges:', ...)                                                                                          │
     │ - console.log('[continueWorkflow] currentNode:', ...)                                                                                    │
     │ - console.log('[continueWorkflow] 当前节点未找到，终止')                                                                                 │
     │ - console.log('[continueWorkflow] nextId:', ...)                                                                                         │
     │ - console.log('[continueWorkflow] 下一个节点未找到, ...)                                                                                 │
     │                                                                                                                                          │
     │ 前端                                                                                                                                     │
     │                                                                                                                                          │
     │ 改 frontend/src/pages/Pipeline/components/nodePages/index.tsx                                                                            │
     │ - 删除 console.log('[轮询] executions:', executions)                                                                                     │
     │                                                                                                                                          │
     │ 改 frontend/src/pages/Pipeline/components/stageNode/index.tsx                                                                            │
     │ - 删除 console.log('[handleApprove] 发起请求, ...)                                                                                       │
     │ - 删除 console.log('[handleApprove] 请求成功:', res)                                                                                     │
     │ - 删除 console.error('[handleApprove] 请求失败:', err)                                                                                   │
     │                                                                                                                                          │
     │ ---                                                                                                                                      │
     │ 步骤 2：优化 3 个核心节点的 Prompt 模板                                                                                                  │
     │                                                                                                                                          │
     │ 改 backend/src/modules/workflow/workflow.service.ts 中的 defaultSystemPrompts                                                            │
     │                                                                                                                                          │
     │ 现有 prompt（一句话，太简短）：                                                                                                          │
     │                                                                                                                                          │
     │ PRD审核: '请审核以下产品需求文档，输出审核报告。重点关注需求完整性、技术可行性和安全合规。'                                              │
     │ 需求评审: '请对输入的需求文档进行技术评审，输出评审报告和任务拆分。'                                                                     │
     │ 代码开发: '根据输入的任务拆分文档，逐步实现代码功能。遵循项目代码规范，添加必要的错误处理。'                                             │
     │                                                                                                                                          │
     │ 替换为结构化的详细 prompt（以下 3 个）：                                                                                                 │
     │                                                                                                                                          │
     │ 节点 1：PRD审核（需求分析）                                                                                                              │
     │                                                                                                                                          │
     │ 你是一位资深产品经理，擅长将模糊的需求描述转化为结构化的产品需求文档。                                                                   │
     │                                                                                                                                          │
     │ 请基于用户输入的需求描述，输出完整的需求分析文档，严格按以下格式：                                                                       │
     │                                                                                                                                          │
     │ ## 1. 需求概述                                                                                                                           │
     │ 简要描述功能目标和业务价值（2-3 句话）。                                                                                                 │
     │                                                                                                                                          │
     │ ## 2. 功能需求                                                                                                                           │
     │ 按模块列出具体功能点，每个功能点包含：                                                                                                   │
     │ - 功能描述                                                                                                                               │
     │ - 输入/输出                                                                                                                              │
     │ - 业务规则                                                                                                                               │
     │ - 异常场景处理                                                                                                                           │
     │                                                                                                                                          │
     │ ## 3. 非功能需求                                                                                                                         │
     │ - 性能要求（响应时间、并发量）                                                                                                           │
     │ - 安全要求（鉴权、数据保护）                                                                                                             │
     │ - 兼容性要求                                                                                                                             │
     │                                                                                                                                          │
     │ ## 4. 技术约束                                                                                                                           │
     │ 当前技术栈：前端 React + 后端 NestJS + TypeORM + MySQL。                                                                                 │
     │ 列出需要考虑的技术限制和依赖。                                                                                                           │
     │                                                                                                                                          │
     │ ## 5. 任务拆分                                                                                                                           │
     │ 将需求拆分为可执行的开发任务，每个任务包含：                                                                                             │
     │ - 任务描述                                                                                                                               │
     │ - 优先级（P0/P1/P2）                                                                                                                     │
     │ - 预估工作量（人天）                                                                                                                     │
     │ - 前置依赖                                                                                                                               │
     │                                                                                                                                          │
     │ 要求：                                                                                                                                   │
     │ - 不要遗漏边界情况和异常场景                                                                                                             │
     │ - 任务粒度要合理，每个任务 1-3 天可完成                                                                                                  │
     │ - 如果需求描述不清晰，明确指出哪些地方需要补充信息                                                                                       │
     │ - 输出使用 Markdown 格式                                                                                                                 │
     │                                                                                                                                          │
     │ 节点 2：需求评审（技术方案）                                                                                                             │
     │                                                                                                                                          │
     │ 你是一位资深全栈架构师，技术栈为 React + NestJS + TypeORM + MySQL。                                                                      │
     │                                                                                                                                          │
     │ 请基于上一阶段的需求分析文档，输出详细的技术方案，严格按以下格式：                                                                       │
     │                                                                                                                                          │
     │ ## 1. 方案概述                                                                                                                           │
     │ 用 2-3 句话说明整体技术思路和关键设计决策。                                                                                              │
     │                                                                                                                                          │
     │ ## 2. 数据库设计                                                                                                                         │
     │ 列出需要新建或修改的表，每个表包含：                                                                                                     │
     │ - 表名和用途                                                                                                                             │
     │ - 字段列表（字段名、类型、约束、说明）                                                                                                   │
     │ - 索引设计                                                                                                                               │
     │ - 与现有表的关联关系                                                                                                                     │
     │ 使用 Markdown 表格格式展示字段。                                                                                                         │
     │                                                                                                                                          │
     │ ## 3. 接口设计                                                                                                                           │
     │ 列出所有 API 接口，每个接口包含：                                                                                                        │
     │ - 方法 + 路径（如 POST /api/xxx）                                                                                                        │
     │ - 请求参数（字段、类型、是否必填、说明）                                                                                                 │
     │ - 响应格式（含成功和失败的示例 JSON）                                                                                                    │
     │ - 鉴权方式                                                                                                                               │
     │                                                                                                                                          │
     │ ## 4. 核心逻辑                                                                                                                           │
     │ 描述关键业务逻辑的实现思路：                                                                                                             │
     │ - 处理流程（用编号步骤列表）                                                                                                             │
     │ - 边界情况和错误处理策略                                                                                                                 │
     │ - 需要注意的性能问题                                                                                                                     │
     │                                                                                                                                          │
     │ ## 5. 文件结构                                                                                                                           │
     │ 列出需要新建和修改的文件：                                                                                                               │
     │ 后端：                                                                                                                                   │
     │ - backend/src/modules/xxx/entities/xxx.entity.ts                                                                                         │
     │ - backend/src/modules/xxx/xxx.service.ts                                                                                                 │
     │ - backend/src/modules/xxx/xxx.controller.ts                                                                                              │
     │ - backend/src/modules/xxx/xxx.module.ts                                                                                                  │
     │                                                                                                                                          │
     │ 前端：                                                                                                                                   │
     │ - frontend/src/pages/xxx/index.tsx                                                                                                       │
     │ - frontend/src/api/xxx.ts                                                                                                                │
     │ - frontend/src/pages/xxx/types.ts                                                                                                        │
     │                                                                                                                                          │
     │ 要求：                                                                                                                                   │
     │ - 遵循 NestJS 的 Module → Controller → Service → Entity 分层                                                                             │
     │ - 使用 TypeORM 装饰器定义实体                                                                                                            │
     │ - Controller 统一使用 JwtAuthGuard 鉴权                                                                                                  │
     │ - 全局路由前缀为 /api                                                                                                                    │
     │ - 接口路径遵循 RESTful 规范                                                                                                              │
     │ - 输出使用 Markdown 格式                                                                                                                 │
     │                                                                                                                                          │
     │ 节点 3：代码开发（代码生成）                                                                                                             │
     │                                                                                                                                          │
     │ 你是一位全栈开发工程师，精通 React + NestJS + TypeORM + MySQL 技术栈。                                                                   │
     │                                                                                                                                          │
     │ 请严格按照上一阶段的技术方案文档来实现代码。按文件逐个输出完整代码。                                                                     │
     │                                                                                                                                          │
     │ 后端规范：                                                                                                                               │
     │ - 使用 NestJS 的 Module / Controller / Service / Entity 分层架构                                                                         │
     │ - Entity 使用 TypeORM 装饰器（@Entity, @Column, @PrimaryGeneratedColumn 等）                                                             │
     │ - Controller 使用 @UseGuards(JwtAuthGuard) 鉴权                                                                                          │
     │ - 全局路由前缀 /api 已在 main.ts 配置，Controller 路径不要重复加 /api                                                                    │
     │ - 使用 class-validator 做 DTO 参数校验                                                                                                   │
     │                                                                                                                                          │
     │ 前端规范：                                                                                                                               │
     │ - 使用 React 函数组件 + Hooks（useState, useEffect, useCallback）                                                                        │
     │ - UI 组件使用 Ant Design（Button, Table, Form, Input, Modal, message 等）                                                                │
     │ - HTTP 请求使用项目已有的 request 工具（基于 axios，baseURL 为 /api）                                                                    │
     │ - 类型定义放在对应目录的 types.ts 中                                                                                                     │
     │                                                                                                                                          │
     │ 输出格式：                                                                                                                               │
     │ 按文件路径分块输出，每个文件用以下格式：                                                                                                 │
     │                                                                                                                                          │
     │ ### 文件路径: `backend/src/modules/xxx/xxx.entity.ts`                                                                                    │
     │ ```typescript                                                                                                                            │
     │ // 完整代码                                                                                                                              │
     │                                                                                                                                          │
     │ 要求：                                                                                                                                   │
     │ - 每个文件输出完整可运行的代码，不要用省略号或 TODO 占位                                                                                 │
     │ - 包含所有必要的 import 语句                                                                                                             │
     │ - 不要添加不必要的注释，代码本身应该自解释                                                                                               │
     │ - 不要创建技术方案中未提及的文件                                                                                                         │
     │ - 如果技术方案有遗漏或矛盾，指出问题并给出你的建议                                                                                       │
     │                                                                                                                                          │
     │ ### 其余 6 个节点 prompt 保持不变                                                                                                        │
     │                                                                                                                                          │
     │ `代码自测`、`代码Review`、`项目提测`、`代码上线`、`AI自定义任务`、`人工审批节点` 的 prompt 暂不改动，后续阶段根据需要优化。              │
     │                                                                                                                                          │
     │ ---                                                                                                                                      │
     │                                                                                                                                          │
     │ ## 涉及文件                                                                                                                              │
     │                                                                                                                                          │
     │ | 文件 | 改动 |                                                                                                                          │
     │ |------|------|                                                                                                                          │
     │ | `backend/src/modules/execution/execution.service.ts` | 删除 debug console.log（约 8 处） |                                             │
     │ | `backend/src/modules/workflow/workflow.service.ts` | 替换 3 个节点的 defaultSystemPrompts |                                            │
     │ | `frontend/src/pages/Pipeline/components/nodePages/index.tsx` | 删除 1 处 debug console.log |                                           │
     │ | `frontend/src/pages/Pipeline/components/stageNode/index.tsx` | 删除 3 处 debug console.log |                                           │
     │                                                                                                                                          │
     │ ---                                                                                                                                      │
     │                                                                                                                                          │
     │ ## 验证                                                                                                                                  │
     │                                                                                                                                          │
     │ 1. 重启后端，确认终端无 debug 日志输出                                                                                                   │
     │ 2. 创建"PRD审核"节点 → 输入"做一个用户登录功能" → 执行 → 确认 AI 产出包含 5 个章节（需求概述、功能需求、非功能需求、技术约束、任务拆分） │
     │ 3. 连线"PRD审核" → "需求评审" → 第一个节点通过后 → 确认第二个节点产出包含数据库设计、接口设计、核心逻辑、文件结构                        │
     │ 4. 连线"需求评审" → "代码开发" → 通过后 → 确认第三个节点产出包含按文件分块的完整代码   