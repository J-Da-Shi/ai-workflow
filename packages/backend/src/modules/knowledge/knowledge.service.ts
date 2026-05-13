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
import { EmbeddingService } from './embedding.service';
import { DocumentProcessorService } from './document-processor.service';
import { v4 as uuidv4 } from 'uuid';
import { CreateEntryDto } from './dto/create-entry.dto';

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

    private embeddingService: EmbeddingService,
    private documentProcessor: DocumentProcessorService,
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
    await this.milvusService.deleteByFilter(`knowledge_base_id == "${id}"`);
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
      order: { createdAt: 'DESC' },
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

  /**
   * 文档处理管线：解析 -> 切片 -> Embedding -> 入库
   *
   * 调用时机；用户上传文件后，Controller 保存文件到磁盘，然后调这个方法
   *
   * 完整流程：
   *  1. 创建 document 记录（status：processing）
   *  2. 解析文档提取纯文本
   *  3. 切片（递归字符分割，~512 token/片，200字符重叠）
   *  4. 批量 Embedding（每批 20 条，失败重试 3 次）
   *  5. 存入 Milvus（向量 + 元数据）
   *  6. 存入 MySQL（chunk 记录）
   *  7. 更新 document 状态 + 知识库计数
   *
   * 如果任何步骤失败：document.status = 'failed', 记录错误信息
   *
   * @param knowledgeBaseId   - 知识库 ID
   * @param fileName          - 原始文件名
   * @param filePath          - 文件在磁盘上的路径
   * @param fileType          - 文件类型
   * @param fileSize          - 文件大小（字节）
   */
  async processDocument(
    knowledgeBaseId: string,
    fileName: string,
    filePath: string,
    fileType: string,
    fileSize: number,
  ): Promise<void> {
    // 获取知识库信息（需要 projectId）
    const kb = await this.getKnowledgeBase(knowledgeBaseId);

    // 第一步：创建 document 记录
    const doc = this.knowledgeDocumentRepo.create({
      knowledgeBaseId,
      fileName,
      fileType,
      filePath,
      fileSize,
      status: 'processing',
    });
    await this.knowledgeDocumentRepo.save(doc);

    try {
      // 第二步：解析文档提取纯文本
      const text = await this.documentProcessor.parseDocument(
        filePath,
        fileType,
      );

      // 第三步：切片
      const chunks = this.documentProcessor.splitText(text);

      if (chunks.length === 0) {
        doc.status = 'completed';
        doc.chunkCount = 0;
        await this.knowledgeDocumentRepo.save(doc);
        return;
      }

      // 第四步：批量 Embedding
      const vectors = await this.embeddingService.embedBatch(chunks);

      // 第五步：存入 Milvus
      // 为每个 chunk 生成 UUID（M有SQL 和 Milvus 共用同一个 ID）
      const milvusData = chunks.map((content, index) => ({
        id: uuidv4(),
        knowledge_base_id: knowledgeBaseId,
        project_id: kb.projectId,
        document_type: fileType,
        content,
        embedding: vectors[index],
      }));

      await this.milvusService.insert(milvusData);

      // 第六步：存入 MySQL（chunk 记录）
      const chunkEntities = milvusData.map((item, index) =>
        this.chunkRepo.create({
          id: item.id,
          documentId: doc.id,
          knowledgeBaseId,
          chunkIndex: index,
          content: item.content,
        }),
      );
      await this.chunkRepo.save(chunkEntities);

      // 第七步：更新状态和计数
      doc.status = 'completed';
      doc.chunkCount = chunks.length;
      await this.knowledgeDocumentRepo.save(doc);

      // 更新知识库的计数
      kb.documentCount += 1;
      kb.chunkCount += chunks.length;
      await this.knowledgeBaseRepo.save(kb);
    } catch (err: unknown) {
      // 任何步骤失败：标记 document 为 failed
      const errMsg = err instanceof Error ? err.message : '文档处理失败';
      doc.status = 'failed';
      doc.error = errMsg;
      await this.knowledgeDocumentRepo.save(doc);
    }
  }

  /**
   * 手动录入知识条目
   *
   * 和文件上传的区别：
   *  上传文件 -> parseDocument 解析 -> 切片 -> 入库
   *  手动录入 -> 直接拿 content 文本 -> 切片 -> 入库（跳过解析）
   *
   * @param knowledgeBaseId - 知识库 ID
   * @param dto             - { title, content }
   */
  async createManualEntry(
    knowledgeBaseId: string,
    dto: CreateEntryDto,
  ): Promise<void> {
    const kb = await this.getKnowledgeBase(knowledgeBaseId);

    // 创建 document 记录（fileType = ‘manual’）
    const doc = this.knowledgeDocumentRepo.create({
      knowledgeBaseId,
      fileName: dto.title,
      fileType: 'manual',
      fileSize: Buffer.byteLength(dto.content, 'utf-8'),
      status: 'processing',
    });
    await this.knowledgeDocumentRepo.save(doc);

    try {
      // 切片（和文件上传走同杨的切片逻辑）
      const chunks = this.documentProcessor.splitText(dto.content);

      if (chunks.length === 0) {
        doc.status = 'completed';
        doc.chunkCount = 0;
        await this.knowledgeDocumentRepo.save(doc);
        return;
      }
      // Embedding
      const vectors = await this.embeddingService.embedBatch(chunks);

      // 存入 Milvus
      const milvusData = chunks.map((content, index) => ({
        id: uuidv4(),
        knowledge_base_id: knowledgeBaseId,
        project_id: kb.projectId,
        document_type: 'manual',
        content,
        embedding: vectors[index],
      }));

      await this.milvusService.insert(milvusData);

      // 存入 MySQL
      const chunkEntities = milvusData.map((item, index) =>
        this.chunkRepo.create({
          id: item.id,
          documentId: doc.id,
          knowledgeBaseId,
          chunkIndex: index,
          content: item.content,
        }),
      );
      await this.chunkRepo.save(chunkEntities);

      // 更新状态和计数
      doc.status = 'completed';
      doc.chunkCount = chunks.length;
      await this.knowledgeDocumentRepo.save(doc);

      kb.documentCount += 1;
      kb.chunkCount += chunks.length;
      await this.knowledgeBaseRepo.save(kb);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '录入处理失败';
      doc.status = 'failed';
      doc.error = errMsg;
      await this.knowledgeDocumentRepo.save(doc);
    }
  }
}
