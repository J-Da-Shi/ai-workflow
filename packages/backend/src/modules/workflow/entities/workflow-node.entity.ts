import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Workflow } from './workflow.entity';

/**
 * @Entity('workflow_nodes') — 工作流节点表
 *
 * 每条记录对应画布上的一个节点实例，
 * 记录节点的类型、配置、位置以及运行时状态。
 */
@Entity('workflow_nodes')
@Unique(['workflowId', 'nodeKey'])
export class WorkflowNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  workflowId: string;

  /**
   * @ManyToOne — 多对一：多个节点属于同一个工作流
   *
   * `() => Workflow`：延迟加载目标实体，避免循环依赖
   * `(w) => w.nodes`：指向 Workflow 实体的 @OneToMany 反向属性
   * `{ onDelete: 'CASCADE' }`：删除工作流时级联删除其所有节点
   */
  @ManyToOne(() => Workflow, (w) => w.nodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflowId' })
  workflow: Workflow;

  /** 节点类型 key，对应前端 nodeCategories 中的 key */
  @Column()
  nodeKey: string;

  @Column()
  nodeType: string;

  @Column()
  aiModel: string;

  @Column({ default: '15分钟' })
  timeout: string;
  // 输入来源描述
  @Column({ nullable: true })
  inputSource: string;
  // Token消耗
  @Column({ nullable: true })
  tokenUsage: string;
  // 执行耗时
  @Column({ nullable: true })
  duration: string;

  @Column({ type: 'json', nullable: true })
  promptLayers: {
    system: string | null;
    project: string | null;
    node: string | null;
    activeLayer: 1 | 2 | 3;
  };

  @Column({ type: 'json', nullable: true })
  inputData: { source: string; files: string[] };

  @Column({ type: 'json', nullable: true })
  outputData: { summary: string; files: string[] };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
