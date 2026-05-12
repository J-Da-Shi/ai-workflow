/**
 * KnowledgeModule — 知识库模块注册
 *
 * 把知识库相关的 Service / Controller / Entity 组织在一起
 *
 * imports：
 *   - TypeOrmModule.forFeature：注册三张表的 Entity，让 Repository 可以注入
 *
 * controllers：
 *   - KnowledgeController：暴露 REST 接口
 *
 * providers：
 *   - KnowledgeService：业务逻辑
 *   - MilvusService：向量数据库操作
 *   - EmbeddingService：文本转向量
 *
 * exports：
 *   - KnowledgeService / MilvusService / EmbeddingService
 *   - 导出后其他模块（如 RagModule）可以注入使用
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBase } from './entities/knowledge-base.entity';
import { KnowledgeDocument } from './entities/knowledge-document.entity';
import { KnowledgeChunk } from './entities/knowledge-chunk.entity';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { MilvusService } from './milvus.service';
import { EmbeddingService } from './embedding.service';

@Module({
  imports: [
    // 注册三张表的 Entity
    // 注册后才能在 Service 中用 @InjectRepository（）注入 Repository
    TypeOrmModule.forFeature([
      KnowledgeBase,
      KnowledgeDocument,
      KnowledgeChunk,
    ]),
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, MilvusService, EmbeddingService],
  // 导出供其它模块使用
  exports: [KnowledgeService, MilvusService, EmbeddingService],
})
export class KnowledgeModule {}
