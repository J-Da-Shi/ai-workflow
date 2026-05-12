/**
 * KnowledgeChunk - 知识库切片表（MySQL侧）
 *
 * 一个文档被切成多个片段，每个片段时一条 chunk
 *
 * 双写存储：
 *  MySQL（这张表）：存切片的元数据 + 原文内容
 *  Milvus：存切片的向量（用于相似度搜索）
 *  两边通过 id 字段关联（同一个 UUID）
 *
 * 为什么 MySQL 也存原文：
 *      - 不依赖 Milvus 就能查看切片内容（调试、管理页面展示）
 *      - 删除时先删 MySQL（级联），再同步清理 Milvus
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { KnowledgeDocument } from './knowledge-document.entity';

@Entity('knowledge_chunk')
export class KnowledgeChunk {
  // 主键（同时也是 Milvus 中的主键，两边用同一个 ID）
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 所属文档 ID
  @Column()
  documentId: string;

  // 关联关系：删文档时级联删切片
  @ManyToOne(() => KnowledgeDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'documentId' })
  document: KnowledgeDocument;

  // 所属知识库 ID（冗余存储，检索时不用 JOIN 文档表）
  @Column()
  knowledgeBaseId: string;

  // 切片在文档中的序号（第几个片段，从 0 开始）
  @Column({ type: 'int' })
  chunkIndex: number;

  // 切片的原文内容
  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  createdAt: Date;
}
