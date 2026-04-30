import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('agent_logs')
export class AgentLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 关联到哪个工作流
  @Column()
  workflowId: string;

  // 关联到哪个节点
  @Column()
  nodeKey: string;

  // 工具名称：read_file等待
  @Column()
  toolName: string;

  // AI 传给工具的参数（JSON 格式存储）
  @Column({ type: 'json', nullable: true })
  toolArgs: Record<string, any>;

  // 工具执行结果
  @Column({ type: 'text', nullable: true })
  result: string;

  // 执行是否成功
  @Column()
  success: boolean;

  // Agent 执行阶段：planning / executing / verifying
  @Column({ nullable: true })
  phase: string;

  // 记录创建时间（自动填充）
  @CreateDateColumn()
  createdAt: Date;
}
