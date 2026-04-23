import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { NodeExecution } from './entities/node-execution.entity';
import { Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { WorkflowService } from '../workflow/workflow.service';

@Injectable()
export class ExecutionService {
  constructor(
    @InjectRepository(NodeExecution)
    private executionRepo: Repository<NodeExecution>,

    private workflowService: WorkflowService,

    private aiService: AiService,
  ) {}

  // 获取所有节点执行状态
  async getExecutions(workflowId: string): Promise<NodeExecution[]> {
    return this.executionRepo.find({ where: { workflowId } });
  }

  // 删除节点执行记录
  async deleteExecution(workflowId: string, nodeKey: string): Promise<void> {
    await this.executionRepo.delete({ workflowId, nodeKey });
  }

  // 获取节点输入（查找上一个节点的 output）
  async getNodeInput(
    workflowId: string,
    nodeKey: string,
    userId: string,
  ): Promise<string | null> {
    const data = await this.workflowService.getCanvas(workflowId, userId);
    // 找到当前节点的画布ID
    const currentNode = data.nodes.find((node) => node.data.key === nodeKey);
    if (!currentNode) return null;
    // 找到连向当前节点的边
    const edge = data.edges.find((item) => item.target === currentNode.id);
    if (!edge) return null;
    // 找到上一个节点的 nodeKey
    const prevNode = data.nodes.find((node) => node.id === edge.source);
    if (!prevNode) return null;

    const prevNodeKey = prevNode.data.key;

    const execution = await this.executionRepo.findOne({
      where: { workflowId, nodeKey: prevNodeKey },
    });

    return execution?.output || null;
  }

  // 执行单个节点
  async executeNode(
    workflowId: string,
    nodeKey: string,
    userId: string,
  ): Promise<NodeExecution> {
    // 1. 创建或更新执行记录
    let execution = await this.executionRepo.findOne({
      where: { workflowId, nodeKey },
    });
    if (!execution) {
      execution = this.executionRepo.create({ workflowId, nodeKey });
    }
    execution.status = 'running';
    execution.error = '';
    execution.output = '';
    execution.summary = '';
    execution.startedAt = new Date();
    execution.completedAt = undefined;
    await this.executionRepo.save(execution);
    try {
      const nodeConfig = await this.workflowService.getNodeConfig(
        workflowId,
        nodeKey,
      );
      const layerMap: Record<number, string> = {
        1: 'system',
        2: 'project',
        3: 'node',
      };
      const layerKey = layerMap[nodeConfig.promptLayers?.activeLayer || 1];
      const systemPrompt =
        nodeConfig.promptLayers?.[layerKey] ||
        nodeConfig.promptLayers?.system ||
        '你是一个有用的AI助手，请根据用户输入执行任务。';

      const messages: { role: 'user' | 'assistant'; content: string }[] = [];
      const history = await this.aiService.getChatHistory(workflowId, nodeKey);
      const input = await this.getNodeInput(workflowId, nodeKey, userId);
      // 对话历史
      history.forEach((msg) => {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      });

      if (input) {
        messages.push({
          role: 'user',
          content: `以下是上一阶段的产出：\n${input}\n\n请基于以上内容执行当前节点的任务。`,
        });
      }

      const result = await this.aiService.callAI(systemPrompt, messages);

      // 再调一次 AI 生成摘要
      const summary = await this.aiService.callAI(
        '请用一两句话简要总结一下内容的核心产出：',
        [{ role: 'user', content: result }],
      );

      // 更新执行记录
      execution.summary = summary;
      execution.status = 'waiting';
      await this.executionRepo.save(execution);
    } catch (err: unknown) {
      // 执行失败
      const message = err instanceof Error ? err.message : '执行失败';
      execution.error = message;
      execution.status = 'failed';
      await this.executionRepo.save(execution);
    }

    return execution;
  }

  // 审批通过
  async approveNode(
    workflowId: string,
    nodeKey: string,
    userId?: string,
  ): Promise<NodeExecution> {
    const execution = await this.executionRepo.findOne({
      where: { workflowId, nodeKey },
    });
    if (!execution) throw new Error('执行记录不存在');
    const history = await this.aiService.getChatHistory(workflowId, nodeKey);
    const messages = history.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
    const output = await this.aiService.callAI(
      '请从以下对话记录中，提取该阶段的最终产出物，只输出最终确认的内容，不要包含讨论过程。',
      messages,
    );
    execution.output = output; // 存提取的完整产出
    execution.status = 'approved'; // 更改状态
    execution.completedAt = new Date(); // 记录完成时间
    await this.executionRepo.save(execution);

    // 审批通过后，继续执行后续节点
    if (userId) {
      await this.continueWorkflow(workflowId, nodeKey, userId);
    }

    return execution;
  }

  // 从指定节点之后继续执行工作流
  private async continueWorkflow(
    workflowId: string,
    currentNodeKey: string,
    userId: string,
  ): Promise<void> {
    const canvas = await this.workflowService.getCanvas(workflowId, userId);
    const { nodes, edges } = canvas;

    // 找到当前节点的画布 id
    const currentNode = nodes.find((n) => n.data.key === currentNodeKey);
    if (!currentNode) return;

    // 构建 source → target 映射
    const nextMap = new Map<string, string>();
    edges.forEach((e) => nextMap.set(e.source, e.target));

    // 找到下一个节点
    let nextId = nextMap.get(currentNode.id) || '';

    while (nextId) {
      const node = nodes.find((n) => n.id === nextId);
      if (!node) break;

      const nodeKey = node.data.key;

      // 执行下一个节点
      await this.executeNode(workflowId, nodeKey, userId);

      // 检查是否需要审批
      const nodeConfig = await this.workflowService.getNodeConfig(workflowId, nodeKey);
      if (!nodeConfig.requireApproval) {
        // 不需要审批，自动通过并继续
        await this.approveNode(workflowId, nodeKey, userId);
      } else {
        // 需要审批，暂停
        break;
      }

      nextId = nextMap.get(nextId) || '';
    }
  }

  // 审批驳回
  async rejectNode(
    workflowId: string,
    nodeKey: string,
  ): Promise<NodeExecution> {
    const execution = await this.executionRepo.findOne({
      where: { workflowId, nodeKey },
    });
    if (!execution) throw new Error('执行记录不存在');

    execution.status = 'rejected'; // 更改状态
    await this.executionRepo.save(execution);

    return execution;
  }

  // 运行整个工作流
  async executeWorkflow(workflowId: string, userId: string): Promise<void> {
    // 获取画布数据
    const canvas = await this.workflowService.getCanvas(workflowId, userId);
    const { nodes, edges } = canvas;

    // 拓扑排序，确定节点执行顺序
    // inDegree: 记录每个节点的入度（有多少条边指向它）
    // nextMap：记录每个节点的下一个节点（source -> target）
    const inDegree = new Map<string, number>();
    const nextMap = new Map<string, string>();

    // 初始化所有节点入度为0
    nodes.forEach((n) => inDegree.set(n.id, 0));

    // 遍历所有边，计算入度，并记录连线关系
    edges.forEach((e) => {
      // target 节点的入度 +1（有一条边指向它）
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      // 记录 source 的下一个节点是 target
      nextMap.set(e.source, e.target);
    });

    // 找到入度为 0 的节点，即没有任何前置节点的起始节点
    let currentId = '';
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        currentId = id;
        break;
      }
    }

    // 从起始节点开始，按连线顺序逐个执行
    while (currentId) {
      // 找到当前节点的画布数据
      const node = nodes.find((n) => n.id === currentId);
      if (!node) break;

      const nodeKey = node.data.key;

      // 执行当前节点（AI 处理 -> 生成摘要 -> 状态变为 waiting）
      await this.executeNode(workflowId, nodeKey, userId);

      // 检查当前节点是否需要人工审批
      const nodeConfig = await this.workflowService.getNodeConfig(
        workflowId,
        nodeKey,
      );

      if (!nodeConfig.requireApproval) {
        // 不需要审批：自动提取 output，状态变为 approved，继续下一个节点
        await this.approveNode(workflowId, nodeKey, userId);
      } else {
        // 需要审批：暂停在这里，等用户手动点 通过 或 驳回
        // 用户审批通过后，前端再次调用 executeWorkflow 或 手动执行后续节点
        break;
      }

      // 沿着连线找到下一个节点，继续循环
      currentId = nextMap.get(currentId) || '';
    }
  }
}
