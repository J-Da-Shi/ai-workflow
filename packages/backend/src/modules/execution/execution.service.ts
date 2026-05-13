import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import { NodeExecution } from './entities/node-execution.entity';
import { Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { WorkflowService } from '../workflow/workflow.service';
import { AgentService, AgentSSEEvent } from '../agent/agent.service';
import { PrdReviewService } from '../rag/prd-review.service';

@Injectable()
export class ExecutionService {
  constructor(
    @InjectRepository(NodeExecution)
    private executionRepo: Repository<NodeExecution>,

    private workflowService: WorkflowService,

    private aiService: AiService,

    private agentService: AgentService,

    private prdReviewService: PrdReviewService,
  ) {}

  // 获取所有节点执行状态
  async getExecutions(workflowId: string): Promise<NodeExecution[]> {
    return this.executionRepo.find({ where: { workflowId } });
  }

  // 删除节点执行记录
  async deleteExecution(workflowId: string, nodeKey: string): Promise<void> {
    await this.executionRepo.delete({ workflowId, nodeKey });
  }

  /**
   * 递归扫描目录，返回所有文件的相对路径和内容
   *
   * 用于执行前拍快照 + 执行后对比生成 diff
   * 排除 node_modules / .git / dist 等无关目录
   *
   * @param dir      - 需要扫描的目录绝对路径
   * @param baseDir  - 基准目录（用于计算相对路径）
   * @returns { "src/app.ts": "内容...", "package.json": "..." }
   */

  private scanDirectory(dir: string, baseDir?: string): Record<string, string> {
    const base = baseDir || dir;
    const result: Record<string, string> = {};

    if (!fs.existsSync(dir)) return result;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', '.git', 'dist', '.sandbox'].includes(entry.name))
        continue;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(base, fullPath);

      if (entry.isDirectory()) {
        // 递归扫描子目录
        Object.assign(result, this.scanDirectory(fullPath, base));
      } else {
        // 读取文件内容（只处理文本文件，跳过超大文件）
        const stat = fs.statSync(fullPath);
        // 小于 512kb 才读
        if (stat.size < 512 * 1024) {
          result[relativePath] = fs.readFileSync(fullPath, 'utf-8');
        }
      }
    }

    return result;
  }

  /**
   * 对比快照和当前文件，生成变更列表
   *
   * @param snapshot  - 执行前的快照 {路径： 内容}
   * @param current   - 执行后的当前状态 { 路径： 内容 }
   * @returns 变更列表
   */

  private generateChanges(
    snapshot: Record<string, string>,
    current: Record<string, string>,
  ): Array<{ file: string; type: 'added' | 'modified' | 'deleted' }> {
    const changes: Array<{
      file: string;
      type: 'added' | 'modified' | 'deleted';
    }> = [];

    // 新增 + 修改：遍历当前文件
    for (const file of Object.keys(current)) {
      if (!(file in snapshot)) {
        changes.push({ file, type: 'added' });
      } else if (current[file] !== snapshot[file]) {
        changes.push({ file, type: 'modified' });
      }
    }

    // 删除：快照中有但当前没有
    for (const file of Object.keys(snapshot)) {
      if (!(file in current)) {
        changes.push({ file, type: 'deleted' });
      }
    }

    return changes;
  }

  /**
   * Git 准备：clone 仓库 + 创建特性分支
   *
   * 执行时机：Agent Loop 开始前（仅代码开发节点配置了 gitRepo 时）
   * 执行后：workDir 就是一个 Git 仓库，Agent 直接在里面操作文件
   *
   * 认证方式：把 token 拼入 HTTPS URL
   *    https://github.com/user/repo.git
   *    -> https://{token}@github.com/user/repo.git
   *
   * @param workDir     - 工作目录绝对路径（也是 Git 仓库目录）
   * @param gitRepo     - 远端仓库 URL（HTTPS格式）
   * @param gitToken    - git token
   * @param baseBranch  - 基准分支名（如 main / develop）
   * @param nodeKey     - 节点 key（用于特性分支命名）导入
   * @returns 创建的特性分支名
   */

  private async prepareGitRepo(
    workDir: string,
    gitRepo: string,
    gitToken: string,
    baseBranch: string,
    nodeKey: string,
  ): Promise<string> {
    // 拼接认证 URL
    const authedUrl = gitRepo.replace('https://', `https://${gitToken}@`);

    const hasGit = fs.existsSync(path.join(workDir, '.git'));

    if (!hasGit) {
      // 场景A：首次 clone
      // 如果 workDir 已存在（有之前遗留文件），先清空
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
      // clone 到 workDir（simple-git 需要从父目录执行 clone）
      fs.mkdirSync(path.dirname(workDir), { recursive: true });
      const parentGit = simpleGit(path.dirname(workDir));
      await parentGit.clone(authedUrl, path.basename(workDir), [
        '--branch',
        baseBranch,
      ]);
    } else {
      // 场景B：已有仓库，更新到最新
      const git = simpleGit(workDir);
      await git.fetch('origin');
      await git.checkout(baseBranch);
      await git.pull('origin', baseBranch);
    }

    // 创建特性分支
    const git = simpleGit(workDir);
    const branchName = `feat/agent-${nodeKey}-${Date.now()}`;
    await git.checkoutLocalBranch(branchName);

    return branchName;
  }

  /**
   * Git 本地提交：add + commit（不进行 push）
   *
   * 执行时机：Agent Loop 完成后
   * 只在本地提交，审批通过后才 push 到远端
   * 这样驳回时只需要 reset，不需要远端 revert
   * @param workDir - 工作目录（Git 仓库）
   * @param nodeKey - 节点 key（用于 commit message）
   * @returns commit hash，无变更返回空字符串
   */
  private async gitCommit(workDir: string, nodeKey: string): Promise<string> {
    const git = simpleGit(workDir);

    // 检查是否有文件变更
    const status = await git.status();
    if (status.files.length === 0) return '';

    // 暂存所有变更
    await git.add('.');

    // 提交（只在本地，不进行 push）
    const msg = `feat(agent): auto-generated by node [${nodeKey}\n\nGenerated at ${new Date().toISOString()}]`;
    const result = await git.commit(msg);

    return result.commit || '';
  }

  /**
   * Git push + 创建 PR/MR
   *
   * 执行时机：审批通过后
   * 流程：pish 特性分支到远端 -> 调平台 API 创建 PR/MR
   *
   * 支持两个平台：
   *    - GitHub：POST /repos/{owner}/{repo}/pulls
   *    - GitHub: POST /api/v4/projects/{id}/merge_requests
   *
   * @param workDir          - 工作目录（Git 仓库）
   * @param gitRepo          - 仓库 URL（用于解析 owner/repo + push 认证）
   * @param gitToken         - 访问令牌
   * @param gitPlatform      - 'github' | 'gitlab'
   * @param branchName       - 特性分支名（PR 的 source）
   * @param baseBranch       - 目标分支（PR 的 target）
   * @param nodeKey          - 节点 key（用于 PR 的标题）
   * @returns PR/MR 的 URL
   */
  private async gitPushAndCreatePR(
    workDir: string,
    gitRepo: string,
    gitToken: string,
    gitPlatform: string,
    branchName: string,
    baseBranch: string,
    nodeKey: string,
  ): Promise<string> {
    const git = simpleGit(workDir);

    // Push 到远端（用带 token 的 URL 认证）
    const authedUrl = gitRepo.replace('http://', `http://${gitToken}@`);
    await git.push(authedUrl, branchName, ['--set-upstream']);

    // 从仓库 URL 解析 owner 和 repo
    // 匹配：github.com/user/repo.git 或 gitlab.com/user/repo.git
    const match = gitRepo.match(
      /(?:github|gitlab)\.com[:/](.+?)\/(.+?)(?:\.git)?$/,
    );
    if (!match) return '';
    const [, owner, repo] = match;

    const title = `feat(agent): auto-generated by node [${nodeKey}]`;
    const body = `This PR was automatically generated by AI Agent node [${nodeKey}] at ${new Date().toISOString()}`;

    if (gitPlatform === 'github') {
      // GitHub API：创建 Pull Request
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${gitToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github.v3+json',
          },
          body: JSON.stringify({
            title,
            body,
            head: branchName,
            base: baseBranch,
          }),
        },
      );
      const data = (await res.json()) as { html_url?: string };
      return data.html_url || '';
    } else {
      // GitLab API：创建 Merge Request
      // GitLab 用 URL encode 的 "owner/repo" 作为 project ID
      const projectId = encodeURIComponent(`${owner}/${repo}`);
      const res = await fetch(
        `https://gitlab.com/api/v4/projects/${projectId}/merge_requests`,
        {
          method: 'POST',
          headers: {
            'PRIVATE-TOKEN': gitToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title,
            description: body,
            source_branch: branchName,
            target_branch: baseBranch,
          }),
        });
      const data = (await res.json()) as { web_url?: string };
      return data.web_url || '';
    }
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
    onEvent?: (event: AgentSSEEvent) => void,
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
      // 获取工作目录
      const workDir = path.join(
        process.env.AI_WORKSPACE_DIR || '/tmp/ai-workspace',
        workflowId,
      );
      // 分支：根据节点类型选择执行路径
      if (nodeConfig.nodeType === '代码开发') {
        // Agent Loop 路径
        // 代码开发节点使用 Agent Loop：AI 可以调用文件工具（read/write/search/list）
        // 循环执行直到 AI 给出最终回复

        // 构建任务描述：如果有上游节点输出，拼接到任务中
        const task = input
          ? `以下是上一阶段的产出：\n${input}\n\n请基于以上内容执行当前节点的任务。`
          : '请根据 System Prompt 中的要求开始工作。先分析项目结构，然后制定方案。';

        // Git 准备：如果配置了 Git，clone + 创建特性分支
        let gitBranch = '';
        if (nodeConfig.gitRepo && nodeConfig.gitToken) {
          try {
            gitBranch = await this.prepareGitRepo(
              workDir,
              nodeConfig.gitRepo,
              nodeConfig.gitToken,
              nodeConfig.gitBaseBranch || 'main',
              nodeKey,
            );
          } catch (err: unknown) {
            // Git 准备失败不阻断执行，退化为普通文件模式
            const errMsg = err instanceof Error ? err.message : 'Git 准备失败';
            execution.error = errMsg;
          }
        }
        // 执行前快照
        // 记录当前工作目录的文件状态，用于执行后对比生成 diff
        const snapshot = this.scanDirectory(workDir);
        execution.snapshot = snapshot;
        await this.executionRepo.save(execution);
        // 调用 Agent Loop
        const agentResult = await this.agentService.runAgent(
          workflowId,
          nodeKey,
          systemPrompt,
          task,
          onEvent, // ← 传递 SSE 回调，不传时 runAgent 内部 onEvent?.() 不触发
        );

        // Agent 的最终回复作为 output
        execution.output = agentResult.reply;

        // 生成摘要
        execution.summary = await this.aiService.callAI(
          '请用一两句话简要总结以下内容的核心产出：',
          [{ role: 'user', content: agentResult.reply }],
        );

        // 执行后对比，生成变更列表
        const currentFiles = this.scanDirectory(workDir);
        const changes = this.generateChanges(snapshot, currentFiles);
        execution.changes = changes;

        // Git 本地提交：Agent 写完文件后 commit（不进行 push）
        if (gitBranch) {
          try {
            execution.gitCommit = await this.gitCommit(workDir, nodeKey);
          } catch (err: unknown) {
            const errMsg =
              err instanceof Error ? err.message : 'Git commit 失败';
            execution.error = errMsg;
          }
        }

        execution.status = 'waiting';
        await this.executionRepo.save(execution);
      } else if (nodeConfig.nodeType === 'PRD审核') {
        // PRD审核：RAG 增强的 AI 审核
        // 1. 获取 PRD 内容（来自上游节点输出）
        const prdContent = input || '请根据 System Prompt 中的要求开始工作。';

        // 2. 调 PrdReviewService 执行审核（R + A + G 三步）
        //    knowledgeBaseIds 从节点配置读取（用户选了哪些知识库）
        //    systemPrompt 作为用户自定义审核指令传入
        const reviewResult = await this.prdReviewService.executePrdReview(
          prdContent,
          nodeConfig.knowledgeBaseIds || [],
          systemPrompt,
        );

        // 3. 保存结果
        execution.output = reviewResult.output;
        execution.summary = reviewResult.summary;
        execution.status = 'waiting';
        await this.executionRepo.save(execution);
      } else {
        const messages: { role: 'user' | 'assistant'; content: string }[] = [];
        const history = await this.aiService.getChatHistory(
          workflowId,
          nodeKey,
        );

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

        const summary = await this.aiService.callAI(
          '请总结一下内容的核心产出：',
          [{ role: 'user', content: result }],
        );
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

      // 如果是 SSE 模式，把错误推给前端
      onEvent?.({ type: 'error', data: { message } });
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

    // Git Push + 创建 PR/MR
    if (execution.gitBranch && execution.gitCommit) {
      const nodeConfig = await this.workflowService.getNodeConfig(
        workflowId,
        nodeKey,
      );
      if (nodeConfig.gitRepo && nodeConfig.gitToken && nodeConfig.gitPlatform) {
        try {
          const workDir = path.join(
            process.env.AI_WORKSPACE_DIR || '/tmp/ai-workspace',
            workflowId,
          );
          const prUrl = await this.gitPushAndCreatePR(
            workDir,
            nodeConfig.gitRepo,
            nodeConfig.gitToken,
            nodeConfig.gitPlatform,
            execution.gitBranch,
            nodeConfig.gitBaseBranch || 'main',
            nodeKey,
          );
          execution.gitPrUrl = prUrl;
        } catch (err: unknown) {
          // Git push / PR 失败不会阻断审批，记录错误
          const errMsg = err instanceof Error ? err.message : 'PR 创建失败';
          execution.error = errMsg;
        }
      }
    }

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

    // 还原文件：根据快照会退到执行前状态
    if (execution.snapshot && execution.changes) {
      const workDir = path.join(
        process.env.AI_WORKSPACE_DIR || '/tmp/ai-workspace',
        workflowId,
      );

      for (const change of execution.changes) {
        const filePath = path.join(workDir, change.file);

        switch (change.type) {
          case 'added':
            // 新增文件 -> 删除
            if (fs.existsSync(filePath)) {
              fs.rmSync(filePath);
            }
            break;
          case 'modified':
            // 修改的文件 -> 用快照内容还原
            if (execution.snapshot[change.file] !== undefined) {
              fs.writeFileSync(
                filePath,
                execution.snapshot[change.file],
                'utf-8',
              );
            }
            break;
          case 'deleted':
            // 删除的文件 -> 从快照恢复
            if (execution.snapshot[change.file] !== undefined) {
              fs.mkdirSync(path.dirname(filePath), { recursive: true });
              fs.writeFileSync(
                filePath,
                execution.snapshot[change.file],
                'utf-8',
              );
            }
            break;
        }
      }
    }

    // Git 清理：切回基准分支，删除特性分支
    if (execution.gitBranch) {
      try {
        const workDir = path.join(
          process.env.AI_WORKSPACE_DIR || '/tmp/ai-workspace',
          workflowId,
        );
        if (fs.existsSync(path.join(workDir, 'git'))) {
          const git = simpleGit(workDir);
          const nodeConfig = await this.workflowService.getNodeConfig(
            workflowId,
            nodeKey,
          );
          const baseBranch = nodeConfig.gitBaseBranch || 'main';
          await git.checkout(baseBranch);
          await git.deleteLocalBranch(execution.gitBranch, true);
        }
      } catch (err: unknown) {
        // 分支清理失败不影响驳回
        const errMsg = err instanceof Error ? err.message : '分支清理失败';
        execution.error = errMsg;
      }
    }

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
   * 获取节点执行的文件变更详情
   *
   * 返回每个变更文件的 before（快照内容）和 after（当前内容）
   * 前端用这两个字段渲染 diff 查看器
   */
  async getNodeDiff(workflowId: string, nodeKey: string) {
    const execution = await this.executionRepo.findOne({
      where: { workflowId, nodeKey },
    });
    if (!execution || !execution.changes) {
      return { changes: [] };
    }

    const workDir = path.join(
      process.env.AI_WORKSPACE_DIR || '/tmp/ai-workspace',
      workflowId,
    );

    // 为每个变更文件附上 before/after 内容
    const diffs = execution.changes.map((change) => {
      const filePath = path.join(workDir, change.file);
      const before = execution.snapshot?.[change.file] || '';
      const after = fs.existsSync(filePath)
        ? fs.readFileSync(filePath, 'utf-8')
        : '';

      return {
        file: change.file,
        type: change.type,
        before,
        after,
      };
    });

    return { changes: diffs };
  }
}
