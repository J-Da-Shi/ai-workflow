import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Workflow } from '../../workflow/entities/workflow.entity';

@Entity('node_executions')
@Unique(['workflowId', 'nodeKey'])
export class NodeExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  workflowId: string;

  @Column()
  nodeKey: string;

  @Column()
  status: string;

  @Column({ type: 'text', nullable: true })
  input: string;

  @Column({ type: 'text', nullable: true })
  output: string;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ type: 'text', nullable: true })
  error: string;

  @ManyToOne(() => Workflow, { onDelete: 'CASCADE' })
  workflow: Workflow;

  /**
   * 执行前的文件快照
   * 格式：{ "相对路径"：“文件内容” }
   * 用途：驳回时还原文件、生成 diff 时对比
   */
  @Column({ type: 'json', nullable: true })
  snapshot: Record<string, string> | null;

  /**
   * 执行后的文件变更列表
   * 格式：[{ file: '路径', type: 'added|modified|deleted'}]
   * 用途：前端 Diff 审批时展示变更文件清单
   */
  @Column({ type: 'json', nullable: true })
  changes: Array<{
    file: string;
    type: 'added' | 'modified' | 'deleted';
  }> | null;

  // Git 特性分支名（执行时自动创建）
  @Column({ nullable: true })
  gitBranch: string;

  // Git commit hash(执行完成后本地提交)
  @Column({ nullable: true })
  gitCommit: string;

  // PR/MR 链接（审批通过后创建）
  @Column({ nullable: true })
  gitPrUrl: string;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
