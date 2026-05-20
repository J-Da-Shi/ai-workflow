# RAG Q&A Engine — Design Spec

## Overview

公司内部 AI 问答机器人的 RAG 引擎，支持从代码仓库和多种文档格式中检索知识，生成带引用溯源的回答。第一版聚焦 RAG 核心链路 + API + 简易聊天界面。

## Requirements

- **数据源：** 代码仓库 + 多种格式文档（PDF/DOCX/PPTX/XLSX/MD/代码等）
- **规模：** 500+ 并发用户
- **技术栈：** Node.js / TypeScript (NestJS + Next.js)
- **LLM：** 多模型支持，可切换
- **向量库：** PostgreSQL + pgvector
- **部署：** 公有云 (AWS/GCP/Azure)
- **生产级要求：** 可观测性、引用溯源、权限隔离（多租户）、高可用、自动扩缩容

## Architecture

异步 Pipeline + API 分离：

- **API Service (NestJS)** — 处理用户查询、流式生成、文档管理
- **Document Worker (BullMQ)** — 异步处理文档：解析 → 切分 → 向量化 → 入库
- **PostgreSQL + pgvector** — 业务数据 + 向量存储
- **Redis** — 任务队列 (BullMQ) + 查询缓存
- **Next.js Frontend** — 简易聊天界面 + 引用展示

```
┌────────────┐      ┌─────────────────────────────────┐
│  Next.js   │─────▶│       API Service (NestJS)       │
│  Frontend  │◀─SSE─│  Auth │ RAG Engine │ Doc Mgmt   │
└────────────┘      └───────────────┬─────────────────┘
                                    │
                    ┌───────────────▼─────────────────┐
                    │     PostgreSQL + pgvector        │
                    │  documents │ chunks │ users      │
                    └───────────────┬─────────────────┘
                                    ▲
                    ┌───────────────┴─────────────────┐
                    │     Document Worker (BullMQ)     │
                    │  Parse → Chunk → Embed → Store   │
                    └───────────────┬─────────────────┘
                                    ▲
                    ┌───────────────┴─────────────────┐
                    │        Redis (BullMQ)            │
                    └─────────────────────────────────┘
```

## Module Design

### 1. Document Loader

**职责：** 加载和解析多种格式的文档，输出统一的 `Document` 结构。

**支持的文件类型：**

| 类别 | 格式 | 解析库 |
|------|------|--------|
| 文档 | PDF (.pdf) | `pdf-parse` 或 `unpdf` |
| 文档 | Word (.docx) | `mammoth` |
| 文档 | PowerPoint (.pptx) | XML 解析 |
| 文档 | Excel (.xlsx) | `exceljs` |
| 文档 | Markdown (.md) | 自定义 parser |
| 文档 | 纯文本 (.txt) | 直接读取 |
| 文档 | HTML (.html) | `cheerio` 提取正文 |
| 代码 | .ts/.tsx/.js/.jsx | Tree-sitter |
| 代码 | .py/.go/.java | Tree-sitter |
| 配置 | .json/.yaml/.yml | 结构化解析 |

**数据来源：**
- 文件上传（单文件 / ZIP 批量）
- 本地目录扫描
- Git 仓库 URL clone

**核心行为：**
- 递归扫描目录，跳过 `node_modules`、`.git`、`dist`、`build` 等
- 提取元数据：文件路径、文件类型、最后修改时间、仓库/项目名
- 增量更新：记录文件 content hash (SHA-256)，只处理变更文件
- 输出统一结构：`Document { id, content, metadata, hash }`

### 2. Chunking Strategy

**职责：** 按文件类型选择最优切分策略，保留语义完整性。

**Markdown 文档：**
- 按标题层级 (H1/H2/H3) 切分为语义段落
- 每个 chunk 保留标题路径上下文（如 `# API Guide > ## Authentication > ### JWT`）
- 目标 chunk 大小：500-1000 tokens
- 相邻 chunk 重叠：100 tokens

**代码文件：**
- 用 Tree-sitter 解析 AST，按函数/类/方法边界切分
- 每个 chunk 包含：函数签名 + 函数体 + 所在文件路径 + import 语句
- 过长函数（> 1500 tokens）在逻辑断点处二次切分

**PDF/DOCX/PPTX：**
- 按段落 / 页面切分
- 保留章节标题作为上下文
- 表格整体作为一个 chunk（不拆分表格行）

**Excel：**
- 按 sheet 切分
- 每个 sheet 转为 Markdown 表格格式

**通用规则：**
- 每个 chunk 附加元数据：`{ source_file, chunk_index, heading_path, language, page_number }`
- 过小 chunk (< 50 tokens) 合并到相邻 chunk
- 过大 chunk (> 1500 tokens) 强制切分

### 3. Embedding Service

**职责：** 将文本 chunk 转为向量表示。

**抽象接口：**
```typescript
interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
  readonly modelName: string;
  readonly maxBatchSize: number;
}
```

**第一版实现：** OpenAI `text-embedding-3-small`（1536 维）

**生产级行为：**
- 批量处理：每批 100 条，并发控制（最多 5 个并行请求）
- 请求重试：指数退避，最多 3 次
- Rate limit 处理：429 响应时自动降速
- 本地去重缓存：相同 content hash 不重复请求
- 指标上报：embedding 延迟、失败率、token 消耗

### 4. Vector Store (pgvector)

**职责：** 存储向量和元数据，提供高效相似度检索。

**Schema：**
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(20) NOT NULL, -- 'file_upload' | 'git_repo' | 'directory'
  source_url TEXT,
  file_path TEXT NOT NULL,
  file_hash VARCHAR(64) NOT NULL,
  team_id UUID NOT NULL,
  status VARCHAR(20) DEFAULT 'processing', -- 'processing' | 'ready' | 'failed'
  chunk_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  embedding vector(1536) NOT NULL,
  token_count INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chunks_embedding ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_chunks_document_id ON chunks(document_id);
CREATE INDEX idx_documents_team_id ON documents(team_id);
CREATE INDEX idx_documents_file_hash ON documents(file_hash);
```

**多租户隔离：** 所有检索查询通过 `documents.team_id` 过滤，确保团队间数据隔离。

### 5. Retriever — 混合检索

**职责：** 综合向量相似度和关键词匹配，返回最相关的文档片段。

**检索流程：**
1. **Query 改写** — LLM 将用户问题改写为检索友好形式（去口语化、拆分子问题）
2. **向量检索** — pgvector cosine similarity，取 top-20
3. **关键词检索** — PostgreSQL `ts_vector` + `ts_query`，取 top-20
4. **融合排序** — Reciprocal Rank Fusion (RRF) 合并两路结果，公式：`score = Σ 1/(k + rank_i)`，k=60
5. **Rerank（可选）** — 对融合后 top-10 用 LLM 精排
6. **输出** — 最终 top-5 chunks + metadata 进入生成阶段

**为什么混合检索：**
- 向量检索擅长语义匹配（"如何认证" ≈ "authentication flow"）
- 关键词检索擅长精确匹配（函数名 `getUserById`、API 路径 `/api/v2/users`）
- 代码仓库场景中精确匹配尤为重要

### 6. LLM Generator

**职责：** 基于检索结果生成带引用的回答。

**抽象接口：**
```typescript
interface LLMProvider {
  chat(messages: Message[], options?: LLMOptions): AsyncIterable<StreamChunk>;
  readonly modelName: string;
  readonly maxContextTokens: number;
}

interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}
```

**Prompt 模板：**
```
System: 你是公司内部知识库助手。基于以下检索到的文档片段回答用户问题。
规则：
1. 回答必须基于提供的文档内容，不要编造
2. 每个关键信息点必须标注引用 [1][2]...
3. 如果文档中没有足够信息回答问题，明确告知用户
4. 代码示例用 markdown 代码块格式

Context:
[1] {chunk.content}
    来源: {chunk.metadata.source_file}:{chunk.metadata.chunk_index}
[2] ...
[5] ...

User: {用户问题}
```

**流式输出：** Server-Sent Events (SSE)，前端实时渲染生成过程。

**引用追踪：** 回答中 `[n]` 标记映射到具体 chunk，返回结构：
```json
{
  "answer": "...[1]...[2]...",
  "references": [
    { "index": 1, "file": "src/auth/jwt.ts", "content": "..." },
    { "index": 2, "file": "docs/api-guide.md", "content": "..." }
  ]
}
```

## API Design

### Endpoints

| Method | Path | 描述 |
|--------|------|------|
| POST | `/api/ingest` | 触发文档入库（上传文件 / Git URL / 目录路径） |
| GET | `/api/ingest/:jobId` | 查询入库任务状态 |
| POST | `/api/chat` | 流式问答 (SSE) |
| GET | `/api/documents` | 已入库文档列表 |
| DELETE | `/api/documents/:id` | 删除文档及其 chunks |

### Request/Response Examples

**POST /api/chat:**
```json
// Request
{
  "question": "JWT token 过期后如何刷新？",
  "teamId": "uuid",
  "conversationId": "uuid (optional)"
}

// Response (SSE stream)
event: chunk
data: {"content": "根据文档，JWT token 刷新流程如下"}

event: chunk
data: {"content": "...[1]..."}

event: done
data: {"references": [...], "conversationId": "uuid"}
```

## Frontend (Next.js)

极简聊天界面：
- 单页对话式 UI，支持 SSE 流式渲染
- 回答下方展示引用来源列表，点击可展开原文片段
- 左侧栏：已导入的文档/仓库列表 + 上传入口
- 文档上传：拖拽区域，支持多文件 / ZIP

## Tech Stack Summary

| 层级 | 选型 |
|------|------|
| API Framework | NestJS |
| Frontend | Next.js (React) |
| Database | PostgreSQL + pgvector |
| Queue | BullMQ (Redis) |
| Embedding | OpenAI text-embedding-3-small (可切换) |
| LLM | 多模型抽象层 (OpenAI / Claude / 本地模型) |
| Code Parsing | Tree-sitter |
| PDF Parsing | pdf-parse / unpdf |
| DOCX Parsing | mammoth |
| XLSX Parsing | exceljs |
| ORM | Drizzle ORM |
| Validation | Zod |
| Deployment | Docker + Cloud Run / ECS |

## Observability

- **Structured Logging:** pino，每次请求含 traceId
- **Metrics:** Prometheus 格式，关键指标：
  - 查询延迟 (P50/P95/P99)
  - 检索召回质量（relevance score 分布）
  - Embedding 处理吞吐量
  - 队列深度和处理延迟
  - LLM token 消耗
- **Tracing:** OpenTelemetry，追踪完整 RAG 链路（query → retrieval → generation）

## Multi-Tenancy

- 每个团队 (team) 为一个租户
- 文档入库时绑定 `team_id`
- 检索时 WHERE 条件强制过滤 `team_id`
- API 层通过 Auth Guard 注入当前用户的 team 信息
- 第一版使用简单 API Key 认证，后续可对接 SSO/OIDC

## Scalability

- API Service: 无状态，水平扩容
- Document Worker: 多实例消费同一队列，自动负载均衡
- PostgreSQL: 读写分离（主库写入，只读副本查询）
- Redis: Cluster 模式
- pgvector 索引：HNSW 索引在百万级 chunks 下仍保持 < 50ms 查询延迟

## Project Structure

```
rag-engine/
├── apps/
│   ├── api/              # NestJS API service
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── chat/
│   │   │   │   ├── documents/
│   │   │   │   └── ingest/
│   │   │   ├── rag/
│   │   │   │   ├── chunking/
│   │   │   │   ├── embedding/
│   │   │   │   ├── retriever/
│   │   │   │   └── generator/
│   │   │   └── common/
│   │   └── package.json
│   ├── worker/           # Document processing worker
│   │   ├── src/
│   │   │   ├── processors/
│   │   │   ├── parsers/
│   │   │   └── jobs/
│   │   └── package.json
│   └── web/              # Next.js frontend
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   └── lib/
│       └── package.json
├── packages/
│   └── shared/           # Shared types, utils, DB schema
│       ├── src/
│       │   ├── types/
│       │   ├── db/
│       │   └── utils/
│       └── package.json
├── docker-compose.yml    # Local dev: PG + Redis
├── Dockerfile.api
├── Dockerfile.worker
├── turbo.json            # Monorepo build orchestration
└── package.json
```

Monorepo 管理：Turborepo，统一依赖和构建。
