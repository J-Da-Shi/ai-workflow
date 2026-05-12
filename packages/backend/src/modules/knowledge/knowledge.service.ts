/**
 * KnowledgeService - 知识库业务员逻辑
 *
 * 职责：
 *  - 知识库 CRUD（创建、列表、详情、删除）
 *  - 后续会加：文档上传处理、手动录入处理
 *
 * 依赖：
 *  - TypeORM Repository（操作 MySQL）
 *  - MilvusService（操作向量数据库，删除知识库时要清理向量）
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { KnowledgeBase } from './entities/knowledge-base.entity';
import { Repository } from 'typeorm';
import { KnowledgeDocument } from './entities/knowledge-document.entity';
import { KnowledgeChunk } from './entities/knowledge-chunk.entity';
import { MilvusService } from './milvus.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';

@Injectable()
export class KnowledgeService {
  constructor(
    // 注入三张表的 Repository (TypeORM 的数据库操作对象)
    @InjectRepository(KnowledgeBase)
    private knowledgeBaseRepo: Repository<KnowledgeBase>,

    @InjectRepository(KnowledgeDocument)
    private knowledgeDocumentRepo: Repository<KnowledgeDocument>,

    @InjectRepository(KnowledgeChunk)
    private chunkRepo: Repository<KnowledgeChunk>,

    // 注意 MilvusService（删除知识库时需要同步清理 Milvus 中的向量）
    private milvusService: MilvusService,
  ) {}

  /**
   * 创建知识库
   *
   * @param dto     - 请求参数（name，description，projectId）
   * @param creatorId - 创建者 ID（从 JWT token 中提取）
   */
  async createKnowledgeBase(
    dto: CreateKnowledgeBaseDto,
    creatorId: string,
  ): Promise<KnowledgeBase> {
    // 创建实体对象并保存到数据库
    // this.knowledgeBaseRepo.create() = 创建实体实例（不入库）
    // this.knowledgeBaseRepo.save() => INSERT INTO knwoledge_bases(...)
    const kb = this.knowledgeBaseRepo.create({
      name: dto.name,
      description: dto.description,
      projectId: dto.projectId,
      creatorId,
    });

    return this.knowledgeBaseRepo.save(kb);
  }

  /**
   * 查询项目下的知识库列表
   *
   * @param projectId - 项目ID（按项目隔离）
   * @returns 知识库数组，按创建时间倒序
   */
  async listKnowledgeBases(projectId: string): Promise<KnowledgeBase[]> {
    return this.knowledgeBaseRepo.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取知识库详情
   *
   * @param id - 知识库 ID
   * @returns 知识库信息
   * @throws NotFoundExeception 如果不存在
   */
  async getKnowledgeBase(id: string): Promise<KnowledgeBase> {
    const kb = await this.knowledgeBaseRepo.findOne({ where: { id } });
    if (!kb) throw new NotFoundException('知识库不存在');
    return kb;
  }

  /**
   * 删除知识库
   *
   * 需要同时清理三个地方：
   *    1. MySQL：knowledge_base 记录（级联删除 documents 和 chunks）
   *    2. Milvus：该知识库下所有向量
   *
   * 为什么要手动删 Milvus：
   *    MySQL 的级联删除只管 MySQL 自己的表
   *    Milvus 是独立服务，必须单独调 API 删
   */
  async deleteKnowledgeBase(id: string): Promise<void> {
    // 先确认存在
    await this.getKnowledgeBase(id);
    // 清理 Milvus 中该知识库的所有向量
    await this.milvusService.deleteByFilter(`knowledge_base_id == ${id}`);
    // 删除 MySQL 记录（CASCADE 会自动删 documents 和 chunks）
    await this.knowledgeBaseRepo.delete(id);
  }

  /**
   * 查询知识库下的文档列表
   *
   * @param knowledgeBaseId - 知识库 ID
   * @returns 文档数组
   */
  async listDocuments(knowledgeBaseId: string): Promise<KnowledgeDocument[]> {
    return this.knowledgeDocumentRepo.find({
      where: { knowledgeBaseId },
      select: ['id'],
    });
  }

  /**
   * 删除单个文档
   *
   * 同样需要清理 MySQL + Milvus 两边
   */
  async deleteDocument(documentId: string): Promise<void> {
    // 查出文档下所有的 chunk 的 ID (用于删 Milvus)
    const chunks = await this.chunkRepo.find({
      where: { documentId },
      select: ['id'],
    });

    // 清理 Milvus 中的向量
    if (chunks.length > 0) {
      const ids = chunks.map((c) => `"${c.id}"`).join(',');
      await this.milvusService.deleteByFilter(`id in [${ids}]`);
    }

    // 删除 MySQL 记录（CASCADE 会自动删 chunks）
    await this.knowledgeDocumentRepo.delete(documentId);
  }
}
