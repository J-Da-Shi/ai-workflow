/**
 * EmbeddingService - 文本转向量服务
 *
 * 职责：调用 Embedding API 把文本转成向量（1536 维浮点数组）
 *
 * 原理：
 *  文本 “用户登陆功能” -> Embedding 模型 -> [0.023, -0.156,...(1536个数)]
 *  语义相近的文本，向量在高维空间中的距离也近
 *  这就是 RAG 检索的基础：Query 转向量 -> 在向量库中找最近的
 *
 * 为什么复用 OpenAI SDK：
 *  只是调用的方法不同：
 *      Chat:  openai.chat.completion.create()
 *      Embedding: openai.embeddings.create()
 */
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  // OpenAI 客户端实例（复用和 AiService 相同的配置）
  private openai: OpenAI;

  constructor() {
    // 用 .env 中已有的 EMBEDDING_API_KEY 和 EMBEDDING_BASE_URL 创建客户端
    // 和 AiService / AgentService 中的写法一样
    this.openai = new OpenAI({
      apiKey: process.env.EMBEDDING_API_KEY,
      baseURL: process.env.EMBEDDING_BASE_URL,
    });
  }

  /**
   * 单条文本转向量
   *
   * @param text - 要转换的文本（如一个文档切片的内容）
   * @returns 1024 维浮点数组
   *
   * 调用的 API：POST /embeddings
   * 请求体：{ model: "text-embedding-samll", impit: '文本' }
   * 返回值：{ data: [{embedding: [0.023, ...]}]}
   */
  async embedText(text: string): Promise<number[]> {
    // 调用 Embedding API
    // model：从 env 中读取
    // input：要转向量的文本
    const response = await this.openai.embeddings.create({
      model: process.env.EMBEDDING_MODEL || 'text-embedding-v3',
      input: text,
    });

    // response.data 是数组（因为 input 可以传数组批量处理）
    // 这里传的是单挑文本，所以取【0】
    return response.data[0].embedding;
  }

  /**
   * 批量文本转向量
   *
   * 为什么需要批量：
   *    一个 PDF 切成 50 个片段，逐条调 API = 50 次请求（慢 + 容易限流）
   *    批量调 = 3 次请求（每次 10 条），快且省
   *
   * 策略：
   *    - 每批最多 10 条（OpenAI API 单次最多 2048 条，但 10 条更稳定）
   *    - 失败自动重试 3 次（网络抖动 / 限流时不会整体失败）
   *    - 重试间隔指数增长（1s -> 2s -> 4s，避免频繁请求被封）
   *
   * @param texts   - 文本数组（如 50 个切片的内容）
   * @returns 向量数组（和 texts 一一对应，texts[i] -> vectors[i]）
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    // 每批 10 条
    const batchSize = 10;
    // 最多重试 3 次
    const maxRetries = 3;

    // 按 batchSize 分批处理
    // 例如 50 条文本 -> 分成 [0-19],[20-39],[40-49]三批
    for (let i = 0; i < texts.length; i += batchSize) {
      // 取出当前批次的文本
      const batch = texts.slice(i, i + batchSize);

      // 带重试的请求
      let lastError: Error | null = null;
      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          // 批量调用 Embedding API
          // input 传数组时，API 一次性返回所有向量
          const response = await this.openai.embeddings.create({
            model: process.env.EMBEDDING_MODEL || 'text-embedding-v3',
            input: batch,
          });

          // response.data 是数组，和 input 一一对应
          // 按顺序提取每条的 embedding
          for (const item of response.data) {
            vectors.push(item.embedding);
          }

          // 成功就跳出重试循环
          lastError = null;
          break;
        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error('Embedding 失败');
          // 重试前等待（指数退避：1s -> 2s -> 4s）
          // 目的：给 API 服务端喘息时间，避免限流
          const waitMs = Math.pow(2, retry) * 1000;
          this.logger.warn(
            `Embedding 批次 ${i / batchSize + 1} 失败，${waitMs}ms 后重试（${retry + 1}/${maxRetries}）`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
      // 重试 3 次都失败了，抛出错误
      if (lastError) {
        throw lastError;
      }
    }

    return vectors;
  }
}
