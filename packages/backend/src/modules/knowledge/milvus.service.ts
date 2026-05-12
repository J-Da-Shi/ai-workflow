/**
 * MilvusService - 向量数据库连接与操作服务
 *
 * 职责：
 *  1. 管理与 Milvus（Zilliz Cloud）的连接
 *  2. 启动时自动创建 Collection（类似 MySQL 的 table）
 *  3. 提供 insert / search / delete 三个核心方法
 *
 * 为什么单独封装：
 *  - 连接复用：整个应用只创建一个 MilvusClient 实例
 *  - 初始化集中：Collection 创建 + 索引 + 加载都在这里
 *  - 屏蔽底层：其它 Service 只调方法，不关心 SDK 细节
 *
 * 类比已有代码：
 *  AiService 封装了 OpenAI SDK -> MilvusService 封装了 Milvus SDK
 */

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataType, MilvusClient } from '@zilliz/milvus2-sdk-node';

export const KNOWLEDGE_COLLECTION = 'knowledge_chunks';

// 向量维度：text-embedding-3-samll 模型输出 1024 维的浮点数组
// 这个值必须喝 Embedding 模型的输出维度一致，否则插入时会报错
const VECTOR_DIM = 1024;

@Injectable()
export class MilvusService implements OnModuleInit {
  // NestJS 内置日志工具
  // 用法 this.logger.log(xxx)
  private readonly logger = new Logger(MilvusService.name);

  // Milvus 客户端实例，所有 CRUD 操作通过它执行
  private client: MilvusClient;

  /**
   * onModuleInit - NestJS 生命周期钩子
   *
   * 在模块初始化时自动执行（应用启动时）
   * 类比：React 的 useEffect（（）=> {},[]）在组件挂载时执行
   *
   * 这里做两件事：
   *    1. 创建 Milvus 客户端连接
   *    2. 确保 Collection 存在（不存在就创建）
   */
  async onModuleInit() {
    // 创建连接
    // address: Zilliz Cloud 的 endpoint（从 .env 读取）
    // 格式：https://in03-xxx.serverless.xxx.cloud.zilliz.com
    // token：Zilliz Cloud 的 API Key（从 .env 读取）
    this.client = new MilvusClient({
      address: process.env.MILVUS_ADDRESS || '',
      token: process.env.MILVUS_TOKEN,
    });

    this.logger.log('Milvus 连接已建立');

    // 确保 Collection 存在（启动时自动检查 + 创建）
    await this.ensureCollection();
  }

  /**
   * 确保 knowledge_chunks Collection 存在
   *
   * Collection 是 Milvus 中的数据表：
   *    - MySQL 有 table + colums => Milvus 有 Collecton + fields
   *    - MySQL 有 index -> Milvus 有 vector index
   *    - 区别：Milvus 搜索前必须先 loadCollection 到内容
   *
   * 如果已存在则跳过（但要确保 load），不存在则创建 + 建索引 + 加载
   */
  private async ensureCollection() {
    // 1. 检查 Collection 是否已存在
    const hasCollection = await this.client.hasCollection({
      collection_name: KNOWLEDGE_COLLECTION,
    });

    // .value 是布尔值，true表示存在
    if (hasCollection.value) {
      this.logger.log(`Collection [${KNOWLEDGE_COLLECTION}] 已存在`);
      // 已存在也要确保加载到内存（应用重启后 Collection 可能被卸载了）
      await this.client.loadCollection({
        collection_name: KNOWLEDGE_COLLECTION,
      });

      return;
    }

    // 2. 创建 Collection + 定义字段
    await this.client.createCollection({
      collection_name: KNOWLEDGE_COLLECTION,
      fields: [
        {
          // 主键：每条向量的唯一标识
          name: 'id',
          data_type: DataType.VarChar,
          is_primary_key: true,
          max_length: 36,
        },
        {
          // 所属知识库 ID
          // 用途：检索时按知识库过滤（只搜用户选中的知识库）
          name: 'knowledge_base_id',
          data_type: DataType.VarChar,
          max_length: 36,
        },
        {
          // 所属项目 ID
          // 用途：多项目隔离，防止 A 项目搜到 B 项目的知识
          name: 'project_id',
          data_type: DataType.VarChar,
          max_length: 36,
        },
        {
          // 文档类型：pdf / markdown / word / manual
          // 用途：可以按文档类型筛选（只搜 PDF 中的内容）
          name: 'document_type',
          data_type: DataType.VarChar,
          max_length: 32,
        },
        {
          // 原文内容：切片的实际文本
          // 用途：搜索命中后返回这个字段给前端展示
          // max_length: 8192字符，足够存一个 512 token 的中文切片
          name: 'content',
          data_type: DataType.VarChar,
          max_length: 8192,
        },
        {
          // 向量字段：文本经过 Embedding 模型后的数值表示
          // dim: 1024 - text-embedding-v3 的输出维度
          // 这个字段是 Milvus 的核心：搜索时就是在这些向量中找最相似的
          name: 'embedding',
          data_type: DataType.FloatVector,
          dim: VECTOR_DIM,
        },
      ],
    });

    this.logger.log(`Collection [${KNOWLEDGE_COLLECTION}] 创建完成`);

    // 3. 创建向量索引
    // 没有索引 -> 搜索要暴力扫描所有向量（O(n), 极慢）
    // 有索引 -> 走近似最近邻算法（毫秒级）
    //
    // index_type: IVF_FLAT
    //   IVF = Inverted File(倒排文件)，先把项链聚类成 N 个桶
    //   搜索时只扫描最近的几个桶，不用看全部数据
    //   FLAT = 桶内不压缩向量，精度更高
    //   适合 <100 万条向量，更大数据量换 HMWS 或 IVF_PQ
    //
    // metric_type: COSINE
    //   余弦相似度：只比较向量的 "方向"，不受 "长度" 影响
    //   文本检索标准选择（“语义方向 比 距离远近 更有意义”）
    //   可选：L2（欧式距离）、IP（内积），文本场景下 COSINE 最优
    //
    // nlist: 128
    //   IVF 的聚类数量：把所有向量分成 128 个桶
    //   搜索时由 nprobe 控制扫描几个桶
    //   128 适合 10 万级数据，百万级建议 1024
    await this.client.createIndex({
      collection_name: KNOWLEDGE_COLLECTION,
      field_name: 'embedding',
      index_type: 'IVF_FLAT',
      metric_type: 'COSINE',
      params: { nlist: 128 },
    });

    this.logger.log('向量索引创建完成');

    // 4. 加载 Collection 到内存
    // Milvus 的架构：数据存磁盘，搜索在内存中执行
    // 必须先 load 才能 search，否则报错
    // Milvus 更激进 - 直接把整个 Collection 加载到内存
    await this.client.loadCollection({
      collection_name: KNOWLEDGE_COLLECTION,
    });

    this.logger.log(`Collection [${KNOWLEDGE_COLLECTION}] 已加载到内存`);
  }

  /**
   * 插入向量数据（批量）
   *
   * 调用时机：文档上传 -> 切片 -> Embedding -> 调用这个方法存入 Milvus
   *
   * @param data - 要插入的数据数组，每条包含所有 6 个字段的值
   */
  async insert(
    data: Array<{
      id: string; // UUID, 对应 MySQL 中的 chunk ID
      knowledge_base_id: string; // 所属知识库
      project_id: string; // 所属项目
      document_type: string; // 文档类型
      content: string; // 原文文本
      embedding: number[]; // 1024 维浮点数组
    }>,
  ) {
    // insert 支持批量插入（一次传多条）
    // Milvus 内部会自动分批处理
    await this.client.insert({
      collection_name: KNOWLEDGE_COLLECTION,
      data,
    });
  }

  /**
   * 向量相似度搜索（核心方法）
   *
   * 流程：拿到一个查询向量 -> 在 Collection 中找余弦相似度最高的 top-k 条
   *
   * 调用时机：PRD审核时，把 PRD 文本 embedding 后调这个方法检索相关知识
   *
   * @param vector  - 查询向量（1536 维浮点数组，由 EmbeddingService 生成）
   * @param topK    - 返回最相似的 k 条结果（默认 10）
   * @param filter  - 标量过滤条件，Milvus 表达式与法
   *    例如：'knowledge_base_id in ["id1", "id2"]'
   *    作用：只在指定知识库中搜索
   * @returns 搜索结果数组，每条包含 { id, content, score, ... }
   */
  async search(vector: number[], topK: number = 10, filter?: string) {
    const result = await this.client.search({
      collection_name: KNOWLEDGE_COLLECTION,
      // 要搜索的向量（我想找和这个向量最像的）
      vector,
      // 返回前 topK 条最相似的结果
      limit: topK,
      // output_fields：搜索结果中要返回哪些字段
      // 不指定的话只返回 id 和 score，看不到原文内容
      output_fields: ['id', 'knowledge_base_id', 'document_type', 'content'],
      // filter：标量过滤，在向量搜索之前先缩小范围
      filter,
      // nprobe：搜索时探测的聚类数量
      // IVF 索引把向量分成了 128 个桶（nlist=128）
      // nprobe=16 表示搜索时扫描最近的 16 个桶
      // 值越大越精确但越慢，16 是精度和速度的平衡点
      params: { nprobe: 16 },
    });

    // result.results 是一个数组，每条包含：
    // { id, score, knowledge_base_id, document_type, content }
    // score：相似度分数（COSINE 下，1.0 = 完全相同，0.0 = 完全无关）
    return result.results as Array<unknown>;
  }

  /**
   * 按条件删除向量
   *
   * 调用时机：
   *    - 删除某个文档时：filter = ’id in ['chunk1', 'chunk2', ...]‘
   *    - 删除整个知识库时：filter = 'knowledge_base_id == "kb-id"'
   *
   * @param filter  - 删除条件（Milvus 表达式语法）
   */
  async deleteByFilter(filter: string) {
    await this.client.delete({
      collection_name: KNOWLEDGE_COLLECTION,
      filter,
    });
  }
}
