/**
 * RagService - RAG 检索服务
 *
 * 职责：给一段文本，从知识库中检索最相关的片段
 *
 * 这是 RAG 的核心：
 *  R = Retrieval（检索）<- 这个 Service 做的事
 *  A = Augmented（增强）<- 把检索的结果拼劲 Prompt
 *  G = Generation（生成）<- AI 基于增强后的 Prompt 回答
 *
 * 调用链：
 *  PRD审核节点执行：
 *      -> RagService.retrieve(prdText, knowledgeBaseIds)
 *        -> EmbeddingService.embedText(prdText) // 文本转向量
 *        -> MilvusService.search(vector, topK, filter) // 向量搜索
 *        -> 过滤低分结果
 *      -> 返回相关知识片段
 *      -> 拼进 Prompt 发给 AI
 */
import { Injectable, Logger } from '@nestjs/common';
import { MilvusService } from '../knowledge/milvus.service';
import { EmbeddingService } from '../knowledge/embedding.service';

// 检索结果的类型定义
export interface RetrievalResult {
  content: string; // 命中的知识片段原文
  score: number; // 相似度分数（0-1，越高越相关）
  knowledgeBaseId: string; // 来自哪个知识库
  documentType: string; // 来自什么类型的文档
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private milvusService: MilvusService,
    private embeddingService: EmbeddingService,
  ) {}

  /**
   * 从知识库中检索与查询文本最相关的片段
   *
   * @param query       - 查询文本（如 PRD 全文或其中一段）
   * @param knowledgeBaseIds - 要搜索的知识库 ID 列表
   * @param topK        - 最多返回几条结果（默认 8）
   * @param scoreThreshold - 最低相似度分数（默认 0.3，低于此分数的丢弃）
   *
   * 为什么有 scoreThreshold：
   *    即使是 top-k 结果，如果相似度很低说明知识库里没有相关内容
   *    硬塞进 Prompt 反而是噪声，会误导 AI
   *    0.3 是比较宽松的阈值，宁可多给一些让 AI 自己判断
   *
   * @returns 检索结果数组，按相似度从高到低排序
   */
  async retrieve(
    query: string,
    knowledgeBaseIds: string[],
    topK: number = 8,
    scoreThreshold: number = 0.3,
  ): Promise<RetrievalResult[]> {
    // 没有指定知识库，直接返回空
    if (!knowledgeBaseIds || knowledgeBaseIds.length === 0) {
      return [];
    }

    // 第一步：把查询文本转成向量
    const queryVector = await this.embeddingService.embedText(query);

    // 第二步：构造 Milvus 过滤条件
    // 只在用户选中的知识库范围内搜索
    // Milvus 表达式与法：knowledge_base_id in ["id1", "id2"]
    const ids = knowledgeBaseIds.map((id) => `"${id}"`).join(',');
    const filter = `knowledge_base_id in [${ids}]`;

    // 第三步：向量搜索
    const results = await this.milvusService.search(queryVector, topK, filter);

    // 第四步：过滤低分结果 + 格式化输出
    const filtered = (results || [])
      .filter((r: any) => r.score >= scoreThreshold)
      .map((r: any) => ({
        content: r.content,
        score: r.score,
        knowledgeBaseId: r.knowledge_base_id,
        documentType: r.document_type,
      }));

    this.logger.log(
      `检索完成：查询 ${query.slice(0, 50)}...，命中 ${filtered.length} 条（过滤前 ${results?.length || 0} 条）`,
    );

    return filtered;
  }
}
