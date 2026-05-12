/**
 * KnowledgeDocument - 知识库文档表
 *
 * 记录用户上传的每一份文档的元数据
 * 文档上传后被切片 -> Embedding -> 存入 Milvus
 * 这张表记录文档本身的信息（文件名、类型、处理状态）
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { KnowledgeBase } from './knowledge-base.entity';

@Entity('knowledge_document')
export class KnowledgeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 所属知识库 ID
  @Column()
  knowledgeBaseId: string;

  // 关联关系：多个文档属于一个知识库，删知识库时级联删文档
  @ManyToOne(() => KnowledgeBase, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'knowledgeBaseId' })
  knowledgeBase: KnowledgeBase;

  // 原始文件名（如：PRD模版.pdf）
  @Column()
  fileName: string;

  // 文件类型：pdf / markdown / word / manual（手动录入）
  @Column()
  fileType: string;

  // 文件在磁盘上的存储路径（手动录入的为 null）
  @Column({ nullable: true })
  filePath?: string;

  // 文件大小（字节）
  @Column({ type: 'bigint', default: 0 })
  fileSize: number;

  // 处理状态
  //   pending - 刚上传，等待处理
  //   processing - 正在切片 + Embedding
  //   completed - 处理完成，可以被检索
  //   failed - 处理失败（错误信息在 error 字段）
  @Column({ default: 'pending' })
  status: string;

  // 处理失败时的错误信息
  @Column({ type: 'text', nullable: true })
  error?: string;

  // 切片数量（处理完成后更新）
  @Column({ default: 0 })
  chunkCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
