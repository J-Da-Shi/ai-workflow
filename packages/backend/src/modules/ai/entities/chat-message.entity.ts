import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('chat_message')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() workflowId: string;
  @Column() nodeKey: string;
  @Column() role: string;
  @Column({ type: 'text' }) content: string;
  @CreateDateColumn() createdAt: Date;
}
