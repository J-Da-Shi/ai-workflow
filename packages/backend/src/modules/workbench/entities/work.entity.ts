import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // 项目名称，如 "user-center"

  @Column({ nullable: true })
  description: string; // 项目描述

  @Column({ nullable: true })
  gitUrl: string; // Git 仓库地址

  @Column()
  ownerId: string; // 创建者用户ID

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
