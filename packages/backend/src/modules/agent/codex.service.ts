/**
 * CodexService - Codex CLI 执行引擎
 *
 * 职责：通过 @openai/codex-sdk 调用 Codex CLI 完成代码任务
 *
 * 和自研的 AgentService 的区别：
 *  - AgentService：自己写 Agent Loop + 定义工具 + 管理上下文
 *  - CodexService：Codex CLI 内置了所有能力（文件读写、命令执行、上下文管理）
 *  我们只需要传任务描述，它自动完成
 *
 * 为什么两种都保留：
 *  - 自研：学习 Agent 底层原理，完全可控
 *  - Codex：生产级引擎，效果更好，但是黑盒
 *
 * 事件映射：
 *  Codex 的 'item.completed' -> 我们的 'tool_done'
 *  Codex 的 ‘turn.completed’ -> 我们的 'done'
 */
import { Injectable, Logger } from '@nestjs/common';
import { AgentSSEEvent } from './agent.service';
import { execSync } from 'child_process';

@Injectable()
export class CodexService {
  private readonly logger = new Logger(CodexService.name);

  /**
   * 使用 Codex 执行代码任务
   *
   * @param workDir     - 工作目录（Codex 在这里操作文件）
   * @param task        - 任务描述（自然语言）
   * @param systemPrompt - System Prompt（会拼到任务前面作为上下文）
   * @param onEvent     - SSE 事件回调（和自研 Agent Loop 用同一套格式）
   * @returns 最终回复文本
   */
  async run(
    workDir: string,
    task: string,
    systemPrompt: string,
    onEvent?: (event: AgentSSEEvent) => void,
  ): Promise<{ result: string; fallback: boolean }> {
    // 检测 codex cli 是否已安装
    try {
      execSync('codex --version', { stdio: 'pipe' });
    } catch {
      // CLI 不存在，返回 fallback 标记，让调用放降级到自研 Agent Loop
      this.logger.warn('Codex CLI 未安装，将降级为自研 Agent Loop');
      return { result: '', fallback: true };
    }

    // 动态导入 Codex SDK（避免未安装时启动报错）
    const { Codex } = await import('@openai/codex-sdk');

    // 创建 Codex 客户端
    // baseUrl：如果用中转站需要传，否则默认 OpenAI 官方
    // 不传 baseUrl，SDK 默认用 https://api.openai.com/v1
    const codex = new Codex({
      baseUrl: process.env.AI_BASE_URL || '',
    });

    // 创建会话线程
    // workingDirectory：Codex 在这个目录中操作文件（和自研 Agent 的 workDir 一样）
    // skipGitRepoCheck：允许在非 Git 目录中执行
    const thread = codex.startThread({
      workingDirectory: workDir,
      skipGitRepoCheck: true,
    });

    // 拼接任务：System Prompt + 用户任务
    const fullPrompt = systemPrompt
      ? `${systemPrompt}\n\n---\n\n${task}`
      : task;

    // 推送 thinking 事件
    onEvent?.({ type: 'thinking', data: { iteration: 1 } });

    let finalResponse = '';
    let itemCount = 0;

    try {
      // 流失执行：runStreamed 返回事件异步迭代器
      const { events } = await thread.runStreamed(fullPrompt);

      // 遍历 Codex 返回的事件流
      for await (const event of events) {
        switch (event.type) {
          case 'item.completed':
            // Codex 完成了一个操作（读文件/写文件/执行命令等）
            itemCount++;
            onEvent?.({
              type: 'tool_done',
              data: {
                toolName: 'codex_action',
                toolArgs: { item: event.item?.type || 'action' },
                result: JSON.stringify(event.item).slice(0, 500),
                success: true,
                iteration: itemCount,
              },
            });
            break;

          case 'turn.completed':
            // Codex 完成了整个任务
            finalResponse =
              (event as any).finalResponse ||
              (event as any).usage?.toString() ||
              '执行完成';
            break;
        }
      }

      // 推送完成事件
      onEvent?.({ type: 'done', data: { reply: finalResponse } });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Codex 执行失败';
      this.logger.error(`Codex 执行失败: ${errMsg}，将降级为自研 Agent Loop`);
      return { result: '', fallback: true };
    }

    return { result: finalResponse, fallback: false };
  }
}
