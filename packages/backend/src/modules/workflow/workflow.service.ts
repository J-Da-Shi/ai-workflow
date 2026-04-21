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

  // 创建节点配置
  async createNodeConfig(
    workflowId: string,
    userId: string,
    dto: CreateNodeConfigDto,
  ): Promise<WorkflowNode> {
    await this.findOne(workflowId, userId);
    const data = this.nodeRepo.create({ ...dto, workflowId });
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
