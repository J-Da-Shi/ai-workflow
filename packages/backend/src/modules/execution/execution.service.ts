import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import * as fs from 'fs';
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
    // 1. 创建或更新执行记录（upsert 避免并发时唯一约束冲突）
    await this.executionRepo.upsert(
      {
        workflowId,
        nodeKey,
        status: 'running',
        error: '',
        output: '',
        summary: '',
        startedAt: new Date(),
      },
      ['workflowId', 'nodeKey'],
    );
    const execution = (await this.executionRepo.findOne({
      where: { workflowId, nodeKey },
    }))!;
    try {
      // 获取节点配置
      const nodeConfig = await this.workflowService.getNodeConfig(
        workflowId,
        nodeKey,
      );
      // 解析 systemPrompt
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

      // 获取上一个节点的输出作为输入
      const input = await this.getNodeInput(workflowId, nodeKey, userId);

      // 判断是否走"AI 代码生成 + 文件写入"路径：
      // 1. 节点配置了 aiProvider === 'claude-agent'（用户手动选择）
      // 2. 或者节点类型是"代码开发"（默认就应该走文件写入路径）
      const useCodeGen =
        nodeConfig.aiProvider === 'claude-agent' ||
        nodeConfig.nodeType === '代码开发';
      if (useCodeGen) {
        // AI 代码生成 + 文件写入路径
        // 拼接用户 prompt：如果有上一个节点的产出就带上，没有就让 Agent 直接执行
        const userPrompt = input
          ? `以下是上一阶段的产出：\n${input}\n\n请基于以上内容执行当前节点的任务。`
          : '请执行当前节点的任务。';

        // 调用 AI 生成代码并写入文件到 AI_WORKSPACE_DIR/{workflowId}/ 目录
        // 返回 result （文本结果）和 files（创建/修改的文件列表）
        const { result, files } = await this.aiService.callAIAndWriteFiles(
          systemPrompt,
          userPrompt,
          workflowId,
        );

        // 生成摘要
        const summary = await this.aiService.callAI(
          '请用一两句话简要总结一下内容的核心产出：',
          [{ role: 'user', content: result }],
        );

        // 存 output + summary + 文件列表
        execution.output = result;
        execution.summary = summary;
        execution.status = 'waiting';
        await this.executionRepo.save(execution);
        await this.workflowService.updateNodeConfig(workflowId, nodeKey, {
          outputData: { summary, files },
        });
      } else {
        // 默认 OpenAI/DeepSeek 路径
        const messages: { role: 'user' | 'assistant'; content: string }[] = [];
        const history = await this.aiService.getChatHistory(
          workflowId,
          nodeKey,
        );

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
        // 把 AI 的完整输出存到 output，供下一个节点通过 getNodeInput() 读取
        // 之前只存 summary 不存 output，导致下游节点拿不到上游的完整产出
        execution.output = result;
        execution.summary = summary;
        execution.status = 'waiting';
        await this.executionRepo.save(execution);
      }
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

    // 如果 executeNode 阶段已经存了 output（非空），直接保留，不再覆盖
    // 这样无论是 AI 代码生成路径还是默认路径，都不会丢失已有的产出
    //
    // 只有当 output 为空时（比如用户通过 AI 对话手动交互的场景），
    // 才从聊天历史中提取最终产出
    if (!execution.output) {
      const history = await this.aiService.getChatHistory(workflowId, nodeKey);
      const messages = history.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
      if (messages.length > 0) {
        const output = await this.aiService.callAI(
          '请从以下对话记录中，提取该阶段的最终产出物，只输出最终确认的内容，不要包含讨论过程。',
          messages,
        );
        execution.output = output;
      }
    }

    execution.status = 'approved'; // 更改状态
    execution.completedAt = new Date(); // 记录完成时间
    await this.executionRepo.save(execution);

    // 审批通过后，后台异步继续执行后续节点（不 await，立即返回响应）
    if (userId) {
      this.continueWorkflow(workflowId, nodeKey, userId).catch(() => {});
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
    if (!currentNode) {
      return;
    }

    // 构建 source → target 映射
    const nextMap = new Map<string, string>();
    edges.forEach((e) => nextMap.set(e.source, e.target));

    // 找到下一个节点
    let nextId = nextMap.get(currentNode.id) || '';

    while (nextId) {
      const node = nodes.find((n) => n.id === nextId);
      if (!node) {
        break;
      }

      const nodeKey = node.data.key;

      // 执行下一个节点
      await this.executeNode(workflowId, nodeKey, userId);

      // 检查是否需要审批
      const nodeConfig = await this.workflowService.getNodeConfig(
        workflowId,
        nodeKey,
      );
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

  /**
   * 获取工作流目录下的文件列表
   * AI 代码生成执行时会在 AI_WORKSPACE_DIR/{workflowId}/ 下创建文件
   * 这个方法扫描该目录，返回所有文件的相对路径
   * @param workflowId - 工作流 ID，用于定位工作目录
   * @returns 文件相对路径数组，例如：['src/app.ts', 'package.json']
   */
  getWorkspaceFiles(workflowId: string): string[] {
    const workDir = path.join(
      process.env.AI_WORKSPACE_DIR || '/tmp/ai-workspace',
      workflowId,
    );
    // 复用 AIService 中同样逻辑的递归扫描
    return this.aiService.listFiles(workDir);
  }

  /**
   * 读取工作目录下指定文件的内容
   * @param filePath - 文件相对路径 如：src/app.ts
   * @param workflowId - 工作流 ID
   * @returns 文件内容字符串
   * @throws Error 如果文件不存在
   */

  getWorkspaceFileContent(workflowId: string, filePath: string): string {
    // 拼出文件的绝对路径
    const fullPath = path.join(
      process.env.AI_WORKSPACE_DIR || '/tmp/ai-workspace',
      workflowId,
      filePath,
    );

    // 安全检查：防止路径穿越攻击（如 filePath 传 '../../etc/passwd'）
    // path.resolve 会解析 .. 等相对路径，得到真实的绝对路径
    // 然后检查它是否仍在工作目录下
    const workDir = path.join(
      process.env.AI_WORKSPACE_DIR || '/tmp/ai-workspace',
      workflowId,
    );
    if (!path.resolve(fullPath).startsWith(path.resolve(workDir))) {
      throw new Error('非法文件路径');
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error('文件不存在');
    }

    // readFileSync：同步读取文件内容
    // 'utf-8': 以 UTF-8 编码读取，返回字符串（不传返回 Buffer）
    return fs.readFileSync(fullPath, 'utf-8');
  }

  /**
   * 保存文件内容到工作目录
   * 用户在前端编辑器中修改代码后，调用此方法写回磁盘
   *
   * @param workflowId - 工作流 ID
   * @param filePath - 文件相对路径
   * @param content - 新的文件内容
   */

  saveWorkspaceFileContent(
    workflowId: string,
    filePath: string,
    content: string,
  ): void {
    const fullPath = path.join(
      process.env.AI_WORKSPACE_DIR || '/tmp/ai-workspace',
      workflowId,
      filePath,
    );

    // 安全检查：防止路径穿越
    const workDir = path.join(
      process.env.AI_WORKSPACE_DIR || '/tmp/ai-workspace',
      workflowId,
    );
    if (!path.resolve(fullPath).startsWith(path.resolve(workDir))) {
      throw new Error('非法文件路径');
    }

    // 确保父目录存在（用户可能重命名了路径）
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    // 写入文件内容
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
}
