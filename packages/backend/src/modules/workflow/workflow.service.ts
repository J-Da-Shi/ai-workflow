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
    PRD审核:
      '请审核以下产品需求文档，输出审核报告。重点关注需求完整性、技术可行性和安全合规。',
    需求评审: '请对输入的需求文档进行技术评审，输出评审报告和任务拆分。',
    代码开发:
      '根据输入的任务拆分文档，逐步实现代码功能。遵循项目代码规范，添加必要的错误处理。',
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
    const data = this.nodeRepo.create({
      ...dto,
      workflowId,
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
