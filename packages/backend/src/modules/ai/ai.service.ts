import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import OpenAI from 'openai';
import { WorkflowService } from '../workflow/workflow.service';
import { ChatCompletionMessageParam } from 'openai/resources';

@Injectable()
export class AiService {
  private openai: OpenAI;

  constructor(
    @InjectRepository(ChatMessage)
    private messageRepo: Repository<ChatMessage>,

    private workflowService: WorkflowService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.AI_API_KEY,
      baseURL: process.env.AI_BASE_URL,
    });
  }

  // 查询历史对话
  async getChatHistory(workflowId: string, nodeKey: string) {
    return await this.messageRepo.find({
      where: { workflowId, nodeKey },
      order: { createdAt: 'ASC' },
    });
  }

  // 清空对话记录
  async clearChatHistory(workflowId: string, nodeKey: string) {
    await this.messageRepo.delete({ workflowId, nodeKey });
  }

  // ai 流式返回
  async chat(
    workflowId: string,
    nodeKey: string,
    userMessage: string,
    userId: string,
  ) {
    // 1. 拿节点配置（同时验证工作流归属）
    await this.workflowService.findOne(workflowId, userId);
    const nodeConfig = await this.workflowService.getNodeConfig(
      workflowId,
      nodeKey,
    );

    // 2. 根据 activeLayer 取对应的 system prompt
    // activeLayer: 1 -> system, 2 -> project, 3 -> node
    // 如果对应层为null，降级用 system 层
    // 用一个映射：{ 1: 'system', 2: 'project', 3: 'node' }
    const promptLayers = nodeConfig.promptLayers;
    const layerMap: Record<number, string> = {
      1: 'system',
      2: 'project',
      3: 'node',
    };
    const layerKey = layerMap[promptLayers.activeLayer];
    const systemPrompt =
      promptLayers[layerKey] ||
      promptLayers.system ||
      '你是一个有用的AI助手，请根据用户输入执行任务。';

    // 3. 查历史消息
    const history = await this.getChatHistory(workflowId, nodeKey);
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt as string },
      ...history.map((item) => ({
        role: item.role as 'user' | 'assistant',
        content: item.content,
      })),
      { role: 'user', content: userMessage },
    ];

    // 4. 调用 OpenAI 兼容 API（流式）
    const stream = await this.openai.chat.completions.create({
      model: process.env.AI_MODEL || 'claude-sonnet-4-6',
      max_tokens: 4096,
      stream: true,
      messages: messages,
    });

    return { stream, workflowId, nodeKey, userMessage };
  }

  async saveMessages(
    workflowId: string,
    nodeKey: string,
    userMessage: string,
    assistantMessage: string,
  ) {
    await this.messageRepo.save(
      this.messageRepo.create({
        workflowId,
        nodeKey,
        role: 'user',
        content: userMessage,
      }),
    );

    await this.messageRepo.save(
      this.messageRepo.create({
        workflowId,
        nodeKey,
        role: 'assistant',
        content: assistantMessage,
      }),
    );
  }

  async callAI(
    systemPrompt: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ) {
    const response = await this.openai.chat.completions.create({
      model: process.env.AI_MODEL || 'deepseek-chat',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    });

    return response.choices[0]?.message?.content || '';
  }
}
