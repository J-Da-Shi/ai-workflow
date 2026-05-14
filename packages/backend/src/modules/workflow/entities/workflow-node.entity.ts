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
  // 执行引擎：'agent'（自研 Agent Loop）| 'codex'（Codex CLI）
  // 默认 'agent'，用户可在节点配置中切换
  @Column({ nullable: true, default: 'agent' })
  engine: string;

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

  @Column({ default: true })
  requireApproval: boolean;

  @Column({ type: 'json', nullable: true })
  inputData: { source: string; files: string[] };

  @Column({ type: 'json', nullable: true })
  outputData: { summary: string; files: string[] };

  // Git 仓库地址
  // 格式：https://github.com/user/repo.git
  @Column({ nullable: true })
  gitRepo: string;

  // Git 平台类型：github ｜ gitlab
  // 决定审批通过后调哪个平台的 API 创建 PR/MR
  @Column({ nullable: true })
  gitPlatform: string;

  // Git 访问令牌
  // GitHub：ghp_xxx GitLab: glpat-xxx
  @Column({ nullable: true })
  gitToken: string;

  // 基准分支
  @Column({ nullable: true, default: 'main' })
  gitBaseBranch: string;

  // 关联的知识库 ID 列表（PRD审核等节点用）
  // 节点执行时从这些知识库中检索参考资料
  @Column({ type: 'json', nullable: true })
  knowledgeBaseIds: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
