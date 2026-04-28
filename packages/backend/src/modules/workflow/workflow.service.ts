import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Workflow } from './entities/workflow.entity';
import { Repository } from 'typeorm';
import { WorkflowNode } from './entities/workflow-node.entity';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateCanvasDto } from './dto/update-canvas.dto';
import { CreateNodeConfigDto } from './dto/create-node-config.dto';
import { UpdateNodeConfigDto } from './dto/update-node-config.dto';

@Injectable()
export class WorkflowService {
  constructor(
    @InjectRepository(Workflow)
    private workflowRepo: Repository<Workflow>,

    @InjectRepository(WorkflowNode)
    private nodeRepo: Repository<WorkflowNode>,
  ) {}
  // 创建工作流
  async create(dto: CreateWorkflowDto, userId: string): Promise<Workflow> {
    const data = this.workflowRepo.create({ ...dto, creatorId: userId });
    return this.workflowRepo.save(data);
  }
  // 查项目下的工作流列表
  async findByProject(projectId: string): Promise<Workflow[]> {
    return this.workflowRepo.find({
      where: { projectId },
      order: { updatedAt: 'DESC' },
    });
  }

  // 查单个工作流详情
  async findOne(id: string, userId: string): Promise<Workflow> {
    const detail = await this.workflowRepo.findOne({
      where: { id, creatorId: userId },
    });

    if (!detail) {
      throw new NotFoundException('暂无数据');
    }

    return detail;
  }

  // 获取画布数据
  async getCanvas(
    workflowId: string,
    userId: string,
  ): Promise<{ nodes: any[]; edges: any[] }> {
    const detail = await this.findOne(workflowId, userId);
    return detail.canvasData || { nodes: [], edges: [] };
  }

  // 保存画布数据
  async updateCanvas(
    workflowId: string,
    dto: UpdateCanvasDto,
    userId: string,
  ): Promise<void> {
    await this.findOne(workflowId, userId);
    await this.workflowRepo.update({ id: workflowId }, { canvasData: dto });
  }
  // 每种节点类型的默认系统 Prompt
  private readonly defaultSystemPrompts: Record<string, string> = {
    PRD审核: `你是一位资深产品经理，擅长将模糊的需求描述转化为结构化的产品需求文档。

    请基于用户输入的需求描述，输出完整的需求分析文档，严格按以下格式：

    ## 1. 需求概述
    简要描述功能目标和业务价值（2-3 句话）。

    ## 2. 功能需求
    按模块列出具体功能点，每个功能点包含：
    - 功能描述
    - 输入/输出
    - 业务规则
    - 异常场景处理

    ## 3. 非功能需求
    - 性能要求（响应时间、并发量）
    - 安全要求（鉴权、数据保护）
    - 兼容性要求

    ## 4. 技术约束
    当前技术栈：前端 React + 后端 NestJS + TypeORM + MySQL。
    列出需要考虑的技术限制和依赖。

    ## 5. 任务拆分
    将需求拆分为可执行的开发任务，每个任务包含：
    - 任务描述
    - 优先级（P0/P1/P2）
    - 预估工作量（人天）
    - 前置依赖

    要求：
    - 不要遗漏边界情况和异常场景
    - 任务粒度要合理，每个任务 1-3 天可完成
    - 如果需求描述不清晰，明确指出哪些地方需要补充信息
    - 输出使用 Markdown 格式
    `,
    需求评审: `你是一位资深全栈架构师，技术栈为 React + NestJS + TypeORM + MySQL。

    请基于上一阶段的需求分析文档，输出详细的技术方案，严格按以下格式：

    ## 1. 方案概述
    用 2-3 句话说明整体技术思路和关键设计决策。

    ## 2. 数据库设计
    列出需要新建或修改的表，每个表包含：
    - 表名和用途
    - 字段列表（字段名、类型、约束、说明）
    - 索引设计
    - 与现有表的关联关系
    使用 Markdown 表格格式展示字段。

    ## 3. 接口设计
    列出所有 API 接口，每个接口包含：
    - 方法 + 路径（如 POST /api/xxx）
    - 请求参数（字段、类型、是否必填、说明）
    - 响应格式（含成功和失败的示例 JSON）
    - 鉴权方式

    ## 4. 核心逻辑
    描述关键业务逻辑的实现思路：
    - 处理流程（用编号步骤列表）
    - 边界情况和错误处理策略
    - 需要注意的性能问题

    ## 5. 文件结构
    列出需要新建和修改的文件：
    后端：
    - backend/src/modules/xxx/entities/xxx.entity.ts
    - backend/src/modules/xxx/xxx.service.ts
    - backend/src/modules/xxx/xxx.controller.ts
    - backend/src/modules/xxx/xxx.module.ts

    前端：
    - frontend/src/pages/xxx/index.tsx
    - frontend/src/api/xxx.ts
    - frontend/src/pages/xxx/types.ts

    要求：
    - 遵循 NestJS 的 Module → Controller → Service → Entity 分层
    - 使用 TypeORM 装饰器定义实体
    - Controller 统一使用 JwtAuthGuard 鉴权
    - 全局路由前缀为 /api
    - 接口路径遵循 RESTful 规范
    - 输出使用 Markdown 格式 `,
    代码开发: `你是一位全栈开发工程师，精通 React + NestJS + TypeORM + MySQL 技术栈。

    请严格按照上一阶段的技术方案文档来实现代码。按文件逐个输出完整代码。

    后端规范：
    - 使用 NestJS 的 Module / Controller / Service / Entity 分层架构
    - Entity 使用 TypeORM 装饰器（@Entity, @Column, @PrimaryGeneratedColumn 等）
    - Controller 使用 @UseGuards(JwtAuthGuard) 鉴权
    - 全局路由前缀 /api 已在 main.ts 配置，Controller 路径不要重复加 /api
    - 使用 class-validator 做 DTO 参数校验

    前端规范：
    - 使用 React 函数组件 + Hooks（useState, useEffect, useCallback）
    - UI 组件使用 Ant Design（Button, Table, Form, Input, Modal, message 等）
    - HTTP 请求使用项目已有的 request 工具（基于 axios，baseURL 为 /api）
    - 类型定义放在对应目录的 types.ts 中

    输出格式：
    按文件路径分块输出，每个文件必须严格使用以下固定格式（系统会自动解析并写入文件）：

    ### \`文件相对路径\`
    \`\`\`语言标记
    完整代码内容
    \`\`\`

    示例：
    ### \`backend/src/modules/user/user.entity.ts\`
    \`\`\`typescript
    import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

    @Entity('users')
    export class User {
      @PrimaryGeneratedColumn('uuid')
      id: string;

      @Column()
      name: string;
    }
    \`\`\`

    注意：
    - 文件路径必须放在 ### \`\` 中，用反引号包裹
    - 代码块必须紧跟在文件路径标题后面
    - 不要使用其他格式输出代码，否则系统无法识别

    要求：
    - 每个文件输出完整可运行的代码，不要用省略号或 TODO 占位
    - 包含所有必要的 import 语句
    - 不要添加不必要的注释，代码本身应该自解释
    - 不要创建技术方案中未提及的文件
    - 如果技术方案有遗漏或矛盾，指出问题并给出你的建议`,
    代码自测: '为输入的代码变更自动生成单元测试和集成测试，目标覆盖率 > 85%。',
    代码Review:
      '审查输入的代码变更，关注代码规范、安全隐患、性能优化和测试覆盖完整性。',
    项目提测: '根据代码变更自动生成提测文档和测试计划。',
    代码上线:
      '执行部署前的自动化检查，输出检查报告。确认数据库迁移和环境变量配置。',
    AI自定义任务: '根据用户输入执行自定义 AI 任务。',
    人工审批节点: '等待人工审批，审批通过后继续执行下一步。',
  };

  // 创建节点配置（已存在则返回现有的）
  async createNodeConfig(
    workflowId: string,
    userId: string,
    dto: CreateNodeConfigDto,
  ): Promise<WorkflowNode> {
    await this.findOne(workflowId, userId);
    // 如果该节点配置已存在，直接返回
    const existing = await this.nodeRepo.findOne({
      where: { workflowId, nodeKey: dto.nodeKey },
    });
    if (existing) return existing;

    const defaultPrompt =
      this.defaultSystemPrompts[dto.nodeType] || '请根据输入执行任务。';

    // 根据节点类型决定默认的 AI 提供者
    // "代码开发"节点默认使用 claude-agent（AI 代码生成 + 文件写入）
    // 其他节点默认使用 default（纯文本生成）
    const defaultAiProvider =
      dto.nodeType === '代码开发' ? 'claude-agent' : 'default';

    const data = this.nodeRepo.create({
      ...dto,
      workflowId,
      aiProvider: dto.aiProvider || defaultAiProvider,
      promptLayers: dto.promptLayers || {
        system: defaultPrompt,
        project: null,
        node: null,
        activeLayer: 1,
      },
    });
    return this.nodeRepo.save(data);
  }

  // 获取节点配置
  async getNodeConfig(
    workflowId: string,
    nodeKey: string,
  ): Promise<WorkflowNode> {
    const node = await this.nodeRepo.findOne({
      where: { workflowId, nodeKey },
    });
    if (!node) {
      throw new NotFoundException('节点配置不存在');
    }

    return node;
  }

  // 更新节点配置
  async updateNodeConfig(
    workflowId: string,
    nodeKey: string,
    dto: UpdateNodeConfigDto,
  ): Promise<WorkflowNode> {
    const node = await this.getNodeConfig(workflowId, nodeKey);
    const data = Object.assign(node, dto);
    return this.nodeRepo.save(data);
  }

  // 删除节点配置
  async deleteNodeConfig(workflowId: string, nodeKey: string): Promise<void> {
    await this.getNodeConfig(workflowId, nodeKey);
    await this.nodeRepo.delete({ workflowId, nodeKey });
  }

  // 统计项目下的工作流数量
  async countByProject(projectId: string): Promise<number> {
    return this.workflowRepo.count({ where: { projectId } });
  }

  // 统计用户创建的所有工作流数量
  async countByCreator(userId: string): Promise<number> {
    return this.workflowRepo.count({ where: { creatorId: userId } });
  }
}
