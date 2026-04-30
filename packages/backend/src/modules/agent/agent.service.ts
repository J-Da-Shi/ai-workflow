import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI from 'openai';
import * as path from 'path';
import * as fs from 'fs';
import { WorkflowService } from '../workflow/workflow.service';
import { AGENT_TOOLS, executeTool } from './agent.tools';
import { AgentLogEntity } from './entities/agent-log.entity';
import { Repository } from 'typeorm';

/**
 * Agent Loop 中一次工具调用的日志记录
 *
 * 每当 AI 调用一个工具，我们就记录一条 AgentLog
 * 用于：前端实时展示操作过程 + 执行完后回看历史
 */
export interface AgentLog {
  toolName: string; // 工具名称
  toolArgs: Record<string, any>; // AI 传的参数
  result: string; // 工具执行结果
  success: boolean;
  timestamp: Date;
}

/**
 * Agent 执行结果
 *
 * runAgent 返回的完整结果，包含最终回复和操作日志
 */
export interface AgentResult {
  reply: string; // AI 的最终文本回复（Plan 或 总结）
  logs: AgentLog[];
  plan?: string; // 如果 AI 生成了 Plan，单独提取出来
}

@Injectable()
export class AgentService {
  private openai: OpenAI;
  // Agent 运行状态锁：防止同一个节点并发执行
  // key 格式：`${workflowId}:${nodeKey}`
  private runningAgents = new Map<string, boolean>();

  constructor(
    @InjectRepository(AgentLogEntity)
    private logRepo: Repository<AgentLogEntity>,

    private workflowService: WorkflowService,
  ) {
    // 复用 .env 中的 AI 配置（和 AiService 用同一个 DeepSeek API）
    this.openai = new OpenAI({
      apiKey: process.env.AI_API_KEY,
      baseURL: process.env.AI_BASE_URL,
    });
  }

  /**
   * 获取工作目录路径
   *
   * 每个工作流有独立的工作目录，Agent 的所有文件操作都在这个目录内
   * 目录结构：AI_WORKSPACE_DIR / workflowId /
   *
   * @param workflowId - 工作流 ID
   * @returns 工作目录的绝对路径
   */
  private getWorkDir(workflowId: string): string {
    return path.join(
      process.env.AI_WORKSPACE_DIR || '/tmp/ai-workspace',
      workflowId,
    );
  }

  /**
   * 生成项目结构摘要
   *
   * 扫描工作目录的前 2 层结构，注入到 System Prompt 中
   * 让 AI 在开始工作前就知道项目里有哪些文件/目录
   * 这样 AI 就不会瞎猜文件名，而是基于真实结构决策
   *
   * @param workDir - 工作目录绝对路径
   * @returns 树形结构文本（如果目录不存在返回空字符串）
   */
  private getProjedctStructure(workDir: string): string {
    if (!fs.existsSync(workDir)) return '';

    // 复用 executeTool 中的 list_directory 逻辑
    // 只列 2 层深度，给个概览就够了
    // AI 需要详细信息时会自己调用 list_directory 工具
    const result = executeTool(
      'list_directory',
      { path: '.', depth: 2 },
      workDir,
    );
    // executeTool 返回 promise， 但 list_directory 是同步的
    // 这里用一个技巧：直接 await（因为外层 runAgent 是 async 的）
    return `\n\n当前项目结构：\n${result}`;
  }

  /**
   * 构建 System Prompt
   *
   * System Prompt 由三部分组成：
   * 1. 基础规则（通用行为约束）
   * 2. 项目结构（动态注入的目录树）
   * 3. 用户配置的节点 Prompt（promptLayers 中的内容）
   *
   * @param userSystemPrompt - 用户在节点配置中写的 prompt
   * @param projectStructure - 项目目录结构文本
   */
  private buildSystemPrompt(
    userSystemPrompt: string,
    projectStructure: string,
  ): string {
    return `${userSystemPrompt}
## 工作规范

你是一个代码开发 Agent。你必须遵循以下流程：

1. 先用 list_directory 了解项目结构
2. 直接开始创建/修改文件（不需要等待确认，直接动手写代码）
3. 每次 write_file 前，如果文件已存在，先 read_file 确认当前内容，避免覆盖
4. 所有文件写完后，给出改动总结（创建了哪些文件、每个文件的作用）

## 代码规范

- 使用 TypeScript 强类型，避免 any
- 文件命名清晰，按功能分目录

## 工具使用策略

- 小文件（<100行）：直接 read_file 全量读取
- 中文件（100-500行）：先 search_code 定位，再 read_file + startLine/endLine 片段读取
- 大文件（>500行）：只通过 search_code + 片段读取，禁止全量
${projectStructure}`;
  }

  /**
   * 执行 Agent Loop 核心方法
   *
   * 这是整个 Agent 的主循环：
   * 1. 把 system prompt + 工具列表 + 用户任务发给 AI
   * 2. AI 回复中如果包含 tool_calls,逐个执行工具
   * 3. 把工具执行结果加入对话历史，再次发给 AI
   * 4. 重复 2-3，直到 AI 不再调用工具（返回纯文本）
   *
   * 安全限制：最多循环 30 轮，防止 AI 进入死循环
   *
   * @param workflowId   - 工作流 ID
   * @param nodeKey      - 节点 key
   * @param systemPrompt - 用户配置的 System Prompt
   * @param task         - 用户任务描述
   * @returns AgentResult 包含最终回复和操作日志
   */
  async runAgent(
    workflowId: string,
    nodeKey: string,
    systemPrompt: string,
    task: string,
  ): Promise<AgentResult> {
    // 状态锁
    const lockKey = `${workflowId}:${nodeKey}`;

    // 并发锁检查
    if (this.runningAgents.get(lockKey)) {
      throw new Error('该节点正在执行中，请等待完成');
    }

    this.runningAgents.set(lockKey, true);

    try {
      // 1. 准备工作目录
      const workDir = this.getWorkDir(workflowId);
      // 确保工作目录存在（首次执行需要创建）
      fs.mkdirSync(workDir, { recursive: true });

      // 2. 获取项目结构并后就完整 System Prompt
      const projectStructure = this.getProjedctStructure(workDir);
      const fullSystemPrompt = this.buildSystemPrompt(
        systemPrompt,
        projectStructure,
      );

      // 3. 构建初始消息列表
      // OpenAI 格式的消息数组，这是 Agent Loop 的 “对话记忆”
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: fullSystemPrompt },
        { role: 'user', content: task },
      ];

      // 4. Agent Loop 主循环
      const logs: AgentLog[] = [];
      const MAX_ITERATIONS = 30; // 安全上限，防止无限循环

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        // 调用 DeepSeek（带工具定义）
        const response = await this.openai.chat.completions.create({
          model: process.env.AI_MODEL || 'deepseek-chat',
          max_tokens: 4096,
          messages,
          tools: AGENT_TOOLS,
          // tool_choice: "auto" 表示 AI 自己决定是否调用工具
          // 如果任务需要工具，AI 会返回 tool_calls
          // 如果任务完成或只需回复文本，AI 返回普通的 content
          tool_choice: 'auto',
        });

        const choice = response.choices[0];
        const message = choice.message;

        // 把 AI 的回复加入消息历史
        // 重要：即使 AI 回复中包含 tool_calls，这条消息本身也要加入历史
        // 因为后续的 tool result 消息需要通过 tool_call_id 和这条消息关联
        messages.push(message);

        // 判断：AI 是否要调用工具
        // 判断：AI 是否要调用工具
        if (!message.tool_calls || message.tool_calls.length === 0) {
          // AI 没有调用工具 -> Loop 结束
          // message.content 就是 AI 的最终回复（Plan 或总结）
          return {
            reply: message.content || '',
            logs,
          };
        }

        // AI 要调用工具 -> 逐个执行
        for (const toolCall of message.tool_calls) {
          // openai@6 的类型系统中 tool_calls 是联合类型
          // 只处理 type === function 的调用（DeepSeek 只会返回这种）
          if (toolCall.type !== 'function') continue;
          const { name } = toolCall.function;
          // AI 返回的 arguments 是 JSON 字符串，需要解析
          let args: Record<string, any> = {};
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch {
            // JSON 解析失败
            args = {};
          }

          // 执行工具
          const result = executeTool(name, args, workDir);

          // 判断执行是否成功（以“错误”或“失败”开头视为失败）
          const success =
            !result.startsWith('错误') && !result.startsWith('工具执行失败');

          // 记录日志
          logs.push({
            toolName: name,
            toolArgs: args,
            result,
            success,
            timestamp: new Date(),
          });

          // 持久化到数据库（异步，不阻塞 Loop）
          void this.logRepo.save(
            this.logRepo.create({
              workflowId,
              nodeKey,
              toolName: name,
              toolArgs: args,
              result,
              success,
              phase: 'executing',
            }),
          );

          // 把工具执行结果加入消息历史
          // 格式：role="tool",content=执行结果,tool_call_id=对应的调用ID
          // DeepSeek/OpenAI 要求每个 tool_call 都有对应的 tool result 消息
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });

          // 回到循环顶部，带着工具结果再次调用 AI
          // AI 会根据工具结果决定下一步：继续调用工具，或者给出最终回复
        }
      }

      // 超过最大轮次，强制结束
      return {
        reply:
          '⚠️  Agent 执行超过最大轮次限制（30轮），已强制停止。请缩小任务范围后重试。',
        logs,
      };
    } finally {
      // 无论成功失败，都释放锁
      this.runningAgents.delete(lockKey);
    }
  }
}
