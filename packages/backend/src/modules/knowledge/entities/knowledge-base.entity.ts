/**
 * KnowledgeBase - 知识库表
 *
 * 一个知识库 = 一组相关文档的集合
 * 例如：PRD 审核标准 知识库包含多份审核规范文档
 *
 * 按项目隔离：每个项目有自己爹知识库列表
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('knowledge_base')
export class KnowledgeBase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 知识库名称（如 PRD审核标准、代码规范）
  @Column()
  name: string;

  // 知识库描述（可选：简要说明用途）
  @Column({ nullable: true })
  description?: string;

  // 所属项目 ID
  @Column()
  projectId: string;

  // 创建者ID
  @Column()
  creatorId: string;

  // 状态：active（正常）/ indexing（正在处理文档）/ error（处理失败）
  @Column({ default: 'active' })
  status: string;

  // 文档数量（冗余字段，避免每次 COUNT 查询）
  @Column({ default: 0 })
  documentCount: number;

  // 切片数量（冗余字段）
  @Column({ default: 0 })
  chunkCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
