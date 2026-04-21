import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

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

  /**
   * @ManyToOne(target, inverseSide, options) — 多对一关系装饰器
   *
   * 含义：多个 Project 属于同一个 User（N:1）。
   *
   * 参数说明：
   *  - 第一个参数 `() => User`：目标实体类（延迟求值，避免循环依赖）。
   *  - 第二个参数 `(user) => user.projects`：指定 User 端的反向属性，
   *    与 User 实体的 @OneToMany 形成双向映射。
   *  - 第三个参数（可选）：关系选项对象，常用配置：
   *      onDelete   — 父记录删除时的行为：
   *                    'CASCADE'（级联删除）| 'SET NULL'（置空）|
   *                    'RESTRICT'（禁止删除）| 'NO ACTION'（默认）
   *      onUpdate   — 父记录主键更新时的行为，选项同 onDelete
   *      eager      — true 时查询 Project 自动 JOIN 加载关联的 User，
   *                    无需手动指定 relations
   *      nullable   — false 时外键列不允许 NULL（即 Project 必须有 owner）
   *      orphanedRowAction — 'delete' 时，当 Project 从 User.projects
   *                          数组中移除后自动删除该行
   *    当前使用 { onDelete: 'CASCADE' }：删除 User 时级联删除其所有 Project。
   *
   * @JoinColumn — 指定外键列名
   *  - `{ name: 'ownerId' }`：告诉 TypeORM 用已有的 ownerId 列作为外键，
   *    而不是自动生成一个新的 userId 列。
   */
  @ManyToOne(() => User, (user) => user.projects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
