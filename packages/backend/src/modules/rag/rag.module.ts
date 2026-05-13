/**
 * RagModule — RAG 检索模块
 *
 * 依赖 KnowledgeModule：
 *   - MilvusService：向量搜索
 *   - EmbeddingService：文本转向量
 *   这两个 Service 在 KnowledgeModule 中已 exports，这里 import 后可直接注入
 *
 * 导出 RagService：
 *   供 ExecutionModule 使用（PRD审核节点执行时调用）
 */
import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { RagService } from './rag.service';
import { RagController } from './rag.controller';
import { PrdReviewService } from './prd-review.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [KnowledgeModule, AiModule],
  controllers: [RagController],
  providers: [RagService, PrdReviewService],
  exports: [RagService, PrdReviewService],
})
export class RagModule {}
