import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Project } from '../../workbench/entities/work.entity';

/**
 * @Entity('users') — 将此类映射到数据库的 users 表。
 * 参数 'users' 是表名；省略则默认使用类名小写 'user'。
 */
@Entity('users')
export class User {
  /**
   * @PrimaryGeneratedColumn('uuid') — 主键列，值由数据库自动生成。
   * 'uuid' 策略：生成 UUID v4 字符串（如 "a1b2c3d4-..."），
   * 适合分布式环境，避免自增 ID 的冲突和可预测性问题。
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * @Column({ unique: true }) — 普通列，附加唯一约束。
   * 数据库层面会创建唯一索引，插入重复 email 时抛出约束异常。
   */
  @Column({ unique: true })
  email: string;

  /** @Column() — 普通列，类型由 TypeScript 类型自动推断为 varchar。 */
  @Column()
  password: string;

  @Column()
  nickname: string;

  /**
   * @Column({ default: 'member' }) — 带默认值的列。
   * 插入时若不传 role，数据库自动填充 'member'。
   */
  @Column({ default: 'member' })
  role: string;

  /**
   * @Column({ nullable: true }) — 可空列。
   * 默认列不允许 NULL，加 nullable 后允许该字段为空（用户可能没有头像）。
   */
  @Column({ nullable: true })
  avatar: string;

  /**
   * @CreateDateColumn() — 自动时间戳列。
   * 实体首次插入时，TypeORM 自动写入当前时间，无需手动赋值。
   */
  @CreateDateColumn()
  createdAt: Date;

  /**
   * @UpdateDateColumn() — 自动更新时间戳列。
   * 每次调用 save() 更新实体时，TypeORM 自动刷新为当前时间。
   */
  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * @OneToMany — 一对多关系装饰器（1 个 User 拥有 N 个 Project）。
   *
   * 第一个参数 `() => Project`：
   *   返回关联的目标实体类。使用箭头函数延迟求值，
   *   因为 User ↔ Project 互相导入（循环依赖），
   *   直接写 Project 在模块初始化时可能是 undefined。
   *
   * 第二个参数 `(project) => project.owner`：
   *   指定 Project 实体中指回 User 的属性名，
   *   与 Project 端的 @ManyToOne 形成双向映射。
   *
   * 注意：@OneToMany 侧不会在数据库中生成外键列，
   * 外键由 Project 端的 @ManyToOne + @JoinColumn 管理。
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  @OneToMany(() => Project, (project) => project.owner)
  projects: Project[];
}
