// 定义数据 workflow 表
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { WorkflowStatus } from 'shared';
import { Project } from '../../workbench/entities/work.entity';
import { WorkflowNode } from './workflow-node.entity';

@Entity('workflows')
export class Workflow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // 工作流名称

  @Column({ nullable: true })
  description: string; // 工作流描述

  /**
   * @Column({ type: 'enum', enum: WorkflowStatus, default: WorkflowStatus.DRAFT })
   *
   * type: 'enum'     — 告诉 TypeORM 该列使用数据库原生 ENUM 类型
   * enum              — 传入枚举对象，TypeORM 据此生成允许的值列表
   * default           — 插入时未指定 status 则默认为 DRAFT
   */
  @Column({ type: 'enum', enum: WorkflowStatus, default: WorkflowStatus.DRAFT })
  status: WorkflowStatus;

  @Column()
  projectId: string; // 所属项目ID

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @Column()
  creatorId: string; // 创建者用户 ID

  @Column({ type: 'json', nullable: true })
  canvasData: { nodes: any[]; edges: any[] } | null; // Reactflow 序列化画布

  @OneToMany(() => WorkflowNode, (n) => n.workflow, { cascade: true })
  nodes: WorkflowNode[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
