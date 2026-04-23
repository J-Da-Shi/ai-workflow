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

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
