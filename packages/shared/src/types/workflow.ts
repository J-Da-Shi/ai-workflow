/**
 * WorkflowStatus — 工作流生命周期状态枚举
 *
 * 用于 @Column({ type: 'enum' }) 装饰器，TypeORM 会在数据库中
 * 创建 ENUM 类型列，值只能是下面定义的几种之一。
 *
 * DRAFT     — 草稿：刚创建或编辑中，尚未执行
 * RUNNING   — 运行中：工作流正在执行节点任务
 * COMPLETED — 已完成：所有节点成功执行完毕
 * FAILED    — 已失败：某个节点执行异常，工作流终止
 * PAUSED    — 已暂停：人工审批等待中或手动暂停
 */
export enum WorkflowStatus {
  DRAFT = 'draft',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
}

/**
 * WorkflowNodeStatus — 单个节点的执行状态枚举
 *
 * PENDING   — 待执行：尚未轮到该节点
 * RUNNING   — 执行中：节点任务正在运行
 * WAITING   — 待审批：需要人工确认才能继续
 * APPROVED  — 已通过：审批通过或执行成功
 * REJECTED  — 已驳回：审批未通过或执行失败
 */
export enum WorkflowNodeStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  WAITING = 'waiting',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/** 工作流 — 前后端共享的接口类型（API 传输用） */
export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
}
