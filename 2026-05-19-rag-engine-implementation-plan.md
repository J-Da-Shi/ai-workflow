# RAG Engine — Implementation Plan (LangChain.js)

基于 `2026-05-19-rag-engine-design.md` 设计文档，使用 LangChain.js 作为核心框架的分阶段实现计划。

---

## 技术选型变更

| 模块 | 原方案（自写） | 现方案（LangChain.js） |
|------|--------------|----------------------|
| 文档加载 | 自定义 Loader + 各格式库 | `langchain/document_loaders` (PDF/DOCX/CSV/代码等) |
| 文本切分 | 自定义 Chunker + Tree-sitter | `langchain/text_splitter` (RecursiveCharacter/Code/Markdown) |
| Embedding | 自定义批处理封装 | `@langchain/openai` Embeddings (内置批处理+重试) |
| 向量存储 | 自定义 pgvector 封装 | `@langchain/community/vectorstores/pgvector` |
| 检索 | 自定义 Retriever + RRF | LangChain Retriever + EnsembleRetriever |
| 生成 | 自定义 prompt + 流式 | LangChain Chain (createRetrievalChain) + Streaming |
| LLM 抽象 | 自定义 Provider 接口 | `@langchain/openai` / `@langchain/anthropic` 统一接口 |

**保留自己实现的部分：**
- NestJS API 层（LangChain 不管 HTTP 服务）
- BullMQ 异步队列
- 多租户权限逻辑
- 前端聊天页面
- 可观测性/部署

---

## Phase 1: 项目骨架与基础设施

**目标：** 搭建 monorepo 结构，配置开发环境，数据库就绪。

### 任务

1.1 **初始化 Turborepo monorepo**
- `pnpm create turbo@latest`
- 创建 `apps/api`、`apps/worker`、`apps/web`、`packages/shared`
- 配置 `turbo.json` 构建管线
- 统一 TypeScript 配置 (`tsconfig.base.json`)

1.2 **安装 LangChain.js 核心依赖**
```
langchain
@langchain/core
@langchain/openai
@langchain/anthropic
@langchain/community
```

1.3 **搭建本地开发环境**
- `docker-compose.yml`：PostgreSQL 16 (with pgvector)、Redis 7
- `.env.example` 配置模板（OPENAI_API_KEY、DATABASE_URL 等）
- `pnpm dev` 一键启动所有服务

1.4 **数据库初始化**
- 安装 Drizzle ORM + drizzle-kit
- 在 `packages/shared/src/db/` 定义 schema
- 启用 pgvector 扩展
- LangChain pgvector store 需要的表结构（或让它自动创建）
- 业务表：documents、users、conversations、audit_logs
- 生成并运行迁移

1.5 **共享包基础**
- `packages/shared/src/types/` — 业务类型定义
- `packages/shared/src/config/` — 环境变量 + LangChain 配置
- Zod validation schemas

### 验证标准
- `pnpm dev` 启动无报错
- PostgreSQL 连接正常，pgvector 扩展可用
- LangChain import 正常，`new ChatOpenAI()` 可实例化

---

## Phase 2: Document Loader + Text Splitting

**目标：** 用 LangChain 的 Loader 和 Splitter 完成文档解析与切分。

### 任务

2.1 **Document Loaders 配置**

使用 LangChain 内置 Loaders：
| 文件类型 | LangChain Loader |
|---------|-----------------|
| PDF | `PDFLoader` (from `@langchain/community/document_loaders/fs/pdf`) |
| DOCX | `DocxLoader` (from `@langchain/community/document_loaders/fs/docx`) |
| CSV/XLSX | `CSVLoader` |
| Markdown | `TextLoader` + MarkdownTextSplitter |
| HTML | `CheerioWebBaseLoader` 或 `UnstructuredLoader` |
| 代码 (.ts/.py/.go) | `TextLoader` + RecursiveCharacterTextSplitter with language |
| 纯文本 | `TextLoader` |
| JSON/YAML | `JSONLoader` / `TextLoader` |
| Git Repo | `GithubRepoLoader` 或自定义 clone + 批量 load |

2.2 **Loader 编排层**
- `DocumentLoaderService` — 根据文件扩展名路由到对应 Loader
- 目录递归扫描（排除 node_modules/.git/dist/build）
- 文件上传处理：接收文件 → 存临时目录 → 调用 Loader
- ZIP 解压 → 批量加载
- Git clone → 递归加载
- 增量检测：SHA-256 hash，跳过未变更文件

2.3 **Text Splitting 策略**

```typescript
// Markdown
const mdSplitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
  chunkSize: 1000,
  chunkOverlap: 100,
});

// 代码文件 — 按语言选择
const codeSplitter = RecursiveCharacterTextSplitter.fromLanguage("typescript", {
  chunkSize: 1500,
  chunkOverlap: 100,
});

// 通用文档 (PDF/DOCX)
const genericSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 100,
  separators: ["\n\n", "\n", "。", ".", " "],
});
```

- 为每种文件类型配置合适的 splitter
- 代码支持：typescript, javascript, python, go, java
- 保留元数据：source file, chunk index, language

2.4 **元数据增强**
- 每个 Document 注入：`{ source, fileType, team_id, repo, lastModified }`
- Markdown：提取标题路径作为额外元数据
- 代码：提取函数/类名作为元数据

2.5 **CLI 测试工具**
- `pnpm cli load <path>` — 加载并切分，输出统计信息
- 输出：chunk 数量、平均大小、文件类型分布

### 验证标准
- 输入含 .md/.ts/.pdf/.docx 的测试目录
- 各格式正确加载，chunks 大小在 500-1500 tokens 范围
- 元数据完整（source、fileType、team_id）

---

## Phase 3: Embedding + Vector Store (pgvector)

**目标：** 用 LangChain 的 Embeddings + PGVector store 完成向量化存储和查询。

### 任务

3.1 **Embedding 配置**
```typescript
import { OpenAIEmbeddings } from "@langchain/openai";

const embeddings = new OpenAIEmbeddings({
  modelName: "text-embedding-3-small",
  // LangChain 内置：批处理、重试、rate limit 处理
});
```
- 配置多 provider 支持（OpenAI / Azure OpenAI）
- 环境变量切换模型

3.2 **PGVector Store 初始化**
```typescript
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";

const vectorStore = await PGVectorStore.initialize(embeddings, {
  postgresConnectionOptions: { connectionString: DATABASE_URL },
  tableName: "chunks",
  columns: { idColumnName: "id", vectorColumnName: "embedding", contentColumnName: "content", metadataColumnName: "metadata" },
});
```
- 配置表名和列映射
- 自定义 collection 支持多租户隔离

3.3 **Ingest Pipeline 串联**
```typescript
// 完整入库流程
const docs = await loader.load();
const chunks = await splitter.splitDocuments(docs);
await vectorStore.addDocuments(chunks);
```
- 封装为 `IngestService`
- 批量入库（每批 100 个 chunks）
- 入库前检查重复（file hash）
- 错误处理：单文件失败不阻断整体

3.4 **相似度查询验证**
```typescript
const results = await vectorStore.similaritySearchWithScore("如何配置 JWT", 5, {
  filter: { team_id: "xxx" }
});
```
- CLI: `pnpm cli search "query"` — 验证检索结果

### 验证标准
- 入库 10+ 文档后，向量查询返回相关结果
- 查询延迟 < 100ms
- metadata filter (team_id) 生效

---

## Phase 4: Retriever (混合检索)

**目标：** 使用 LangChain 的 Retriever 体系实现混合检索。

### 任务

4.1 **Vector Retriever**
```typescript
const vectorRetriever = vectorStore.asRetriever({
  k: 20,
  filter: { team_id: currentTeamId },
});
```

4.2 **Keyword Retriever (BM25 / Full-Text)**
- 方案 A：使用 `BM25Retriever` from LangChain（内存中计算）
- 方案 B：自定义 Retriever 包装 PostgreSQL `ts_vector` 查询
- 推荐方案 B（数据量大时性能更好）：

```typescript
class PGFullTextRetriever extends BaseRetriever {
  async _getRelevantDocuments(query: string): Promise<Document[]> {
    // 执行 PostgreSQL full-text search
    // SELECT * FROM chunks WHERE search_vector @@ plainto_tsquery('...')
  }
}
```

4.3 **Ensemble Retriever (混合)**
```typescript
import { EnsembleRetriever } from "langchain/retrievers/ensemble";

const retriever = new EnsembleRetriever({
  retrievers: [vectorRetriever, keywordRetriever],
  weights: [0.6, 0.4], // 向量权重高于关键词
});
```
- RRF 融合由 EnsembleRetriever 内部处理
- 可调节权重

4.4 **Query 改写 (Multi-Query Retriever)**
```typescript
import { MultiQueryRetriever } from "langchain/retrievers/multi_query";

const multiQueryRetriever = MultiQueryRetriever.fromLLM({
  llm: chatModel,
  retriever: ensembleRetriever,
});
```
- LLM 将用户问题改写为多个检索 query
- 合并多次检索结果，提升召回率

4.5 **Contextual Compression (Rerank)**
```typescript
import { ContextualCompressionRetriever } from "langchain/retrievers/contextual_compression";
import { LLMChainExtractor } from "langchain/retrievers/document_compressors/chain_extract";

const compressor = LLMChainExtractor.fromLLM(chatModel);
const compressionRetriever = new ContextualCompressionRetriever({
  baseCompressor: compressor,
  baseRetriever: multiQueryRetriever,
});
```
- 对检索结果做相关性压缩/过滤
- 配置开关：可启用/禁用

### 验证标准
- 搜索精确函数名 `getUserById` 能命中（关键词路径）
- 搜索语义问题 "如何认证" 能命中（向量路径）
- 混合检索结果优于单一路径
- MultiQuery 改写提升模糊问题的召回率

---

## Phase 5: LLM Generator + Streaming API

**目标：** 用 LangChain Chain 完成问答生成，NestJS 提供 API。

### 任务

5.1 **LLM 配置（多模型）**
```typescript
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";

// 通过配置切换
const llm = config.provider === "openai"
  ? new ChatOpenAI({ modelName: "gpt-4o", streaming: true })
  : new ChatAnthropic({ modelName: "claude-sonnet-4-20250514", streaming: true });
```

5.2 **RAG Chain 搭建**
```typescript
import { createRetrievalChain } from "langchain/chains/retrieval";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";

const prompt = ChatPromptTemplate.fromMessages([
  ["system", `你是公司内部知识库助手。基于以下文档片段回答问题。
规则：
1. 回答必须基于提供的文档，不要编造
2. 标注引用来源 [1][2]...
3. 信息不足时明确告知
4. 代码用 markdown 代码块

Context:
{context}`],
  ["human", "{input}"],
]);

const combineDocsChain = await createStuffDocumentsChain({ llm, prompt });
const ragChain = await createRetrievalChain({
  retriever: compressionRetriever,
  combineDocsChain,
});
```

5.3 **流式输出 + 引用追踪**
```typescript
const stream = await ragChain.stream({ input: question });
// 逐 chunk 输出
// 结束后解析 [n] 标记，映射到 sourceDocuments
```
- 从 chain 结果中提取 `sourceDocuments`
- 构建 references 数组：`[{ index, file, content }]`

5.4 **Conversation Memory (可选)**
```typescript
import { BufferWindowMemory } from "langchain/memory";

const memory = new BufferWindowMemory({
  k: 5, // 保留最近 5 轮对话
  memoryKey: "chat_history",
  returnMessages: true,
});
```
- 支持多轮对话上下文
- 按 conversationId 隔离

5.5 **NestJS API 搭建**
- `POST /api/chat` — SSE 流式问答
  - 接收 question + teamId + conversationId
  - 调用 ragChain.stream()
  - SSE 推送给前端
- `POST /api/ingest` — 触发文档入库
  - 文件上传 (multipart/form-data)
  - Git URL clone
  - 返回 jobId
- `GET /api/ingest/:jobId` — 查询任务状态
- `GET /api/documents` — 文档列表
- `DELETE /api/documents/:id` — 删除文档及其 chunks
- 请求校验 (Zod)、错误处理、CORS

5.6 **BullMQ Worker 集成**
- API 收到 ingest 请求 → 加入 BullMQ 队列
- Worker 消费：load → split → embed → store
- Job 状态追踪
- 并发控制 + 失败重试

### 验证标准
- `curl POST /api/chat` 返回 SSE 流式回答
- 回答带引用 [1][2]，references 映射正确
- 多轮对话有上下文连贯性
- 文档上传异步处理，jobId 可查进度

---

## Phase 6: Frontend 聊天界面

**目标：** Next.js 简易聊天页面。

### 任务

6.1 **Next.js 项目初始化**
- App Router
- Tailwind CSS
- SSE 客户端 hook (`useChat`)

6.2 **聊天界面**
- 消息列表（用户/助手气泡）
- 输入框 + 发送
- 流式逐字渲染
- Loading / Thinking 状态

6.3 **引用展示**
- 回答下方引用卡片列表
- 点击展开原文片段 + 文件路径
- [n] 标记高亮可点击

6.4 **文档管理侧边栏**
- 已导入文档列表
- 拖拽上传 / 点击上传
- 多文件 / ZIP 支持
- 入库进度条

### 验证标准
- 流式对话正常
- 引用点击展开正确
- 文件上传 → 入库 → 列表刷新

---

## Phase 7: 生产级加固

**目标：** 可观测性、安全性、性能、部署。

### 任务

7.1 **可观测性**
- Pino structured logging + traceId
- LangChain callbacks 集成（追踪每次 LLM 调用的 tokens/延迟）
```typescript
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
// 或自定义 callback handler 上报 metrics
```
- Prometheus metrics 端点
- OpenTelemetry tracing

7.2 **LangSmith 集成（可选）**
- 接入 LangSmith 做 RAG 链路调试和评估
- 追踪每次检索的召回质量
- A/B 测试不同 prompt / retriever 配置

7.3 **认证与权限**
- API Key 认证中间件
- Team 隔离：retriever filter 注入 team_id
- Rate limiting（per-team）

7.4 **性能优化**
- Redis 缓存热门 query 结果 (TTL 5min)
- LangChain cache 集成（`InMemoryCache` 或 `RedisCache`）
- PG 连接池配置
- Embedding 批处理优化

7.5 **容器化与部署**
- Dockerfile.api / Dockerfile.worker / Dockerfile.web
- 多阶段构建
- Health check + Graceful shutdown
- 环境变量文档
- docker-compose.prod.yml

7.6 **自动扩缩容**
- API: CPU/内存阈值扩容
- Worker: 队列深度扩容
- Cloud Run / K8s HPA 配置

### 验证标准
- `docker compose up` 一键启动
- LangChain callback 正确追踪 token 消耗
- `/metrics` 返回 Prometheus 格式
- 无 API Key 请求被拒 (401)
- 50 并发查询无报错

---

## Phase 实施顺序

```
Phase 1 ──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 4 ──▶ Phase 5 ──▶ Phase 6
                                                                 │
                                                                 ▼
                                                            Phase 7
```

## 预估时间

| Phase | 内容 | 预估工时 |
|-------|------|---------|
| 1 | 项目骨架 + LangChain 配置 | 0.5 天 |
| 2 | Document Loader + Splitting | 1 天 |
| 3 | Embedding + pgvector Store | 1 天 |
| 4 | 混合检索 (Ensemble + MultiQuery) | 1 天 |
| 5 | LLM Chain + Streaming API | 1.5 天 |
| 6 | Frontend 聊天页 | 1 天 |
| 7 | 生产级加固 | 2 天 |
| **合计** | | **~8 天** |

使用 LangChain.js 后预估从 10.5 天缩短到 8 天，主要节省在 Loader/Splitter/Embedding/Retriever 的封装工作上。

---

## 核心依赖清单

```json
{
  "dependencies": {
    "langchain": "^0.3.x",
    "@langchain/core": "^0.3.x",
    "@langchain/openai": "^0.3.x",
    "@langchain/anthropic": "^0.3.x",
    "@langchain/community": "^0.3.x",
    "@nestjs/core": "^10.x",
    "@nestjs/common": "^10.x",
    "bullmq": "^5.x",
    "drizzle-orm": "^0.33.x",
    "pg": "^8.x",
    "ioredis": "^5.x",
    "zod": "^3.x",
    "pino": "^9.x",
    "next": "^14.x",
    "react": "^18.x",
    "tailwindcss": "^3.x"
  }
}
```
