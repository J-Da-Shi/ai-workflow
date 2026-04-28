import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import OpenAI from 'openai';
import { WorkflowService } from '../workflow/workflow.service';
import { ChatCompletionMessageParam } from 'openai/resources';
import * as fs from 'fs';
import * as path from 'path';

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

  /**
   * 调用 AI 生成文本（非流式）
   *
   * @param systemPrompt - 系统提示词
   * @param messages     - 对话消息列表
   * @param maxTokens    - 最大输出 token 数（可选，默认 4096）
   *                       代码生成等长输出场景建议传 16384，避免截断
   */
  async callAI(
    systemPrompt: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
    maxTokens?: number,
  ) {
    const response = await this.openai.chat.completions.create({
      model: process.env.AI_MODEL || 'deepseek-chat',
      max_tokens: maxTokens || 4096,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * 调用 AI 生成代码，并将代码块解析后写入工作目录
   *
   * 工作流程：
   * 1. 调用 callAI()（走现有的 OpenAI 兼容 API）生成 Markdown 格式的代码文本
   * 2. 用 parseCodeBlocks() 正则解析出每个代码块的文件路径和代码内容
   * 3. 把解析出的代码写入 AI_WORKSPACE_DIR/{workflowId}/ 对应的文件
   *
   * AI 输出格式约定（在”代码开发”节点的 prompt 模板中已要求）：
   *   ### `src/modules/user/user.entity.ts`
   *   ```typescript
   *   import { Entity } from 'typeorm';
   *   ...
   *   ```
   *
   * @param systemPrompt - 系统提示词（节点配置的 prompt 模板）
   * @param userPrompt   - 用户提示词（包含上一节点的产出内容）
   * @param workflowId   - 工作流 ID，用于创建隔离的工作目录
   * @returns result - AI 原始输出的完整文本；files - 写入的文件相对路径列表
   */
  async callAIAndWriteFiles(
    systemPrompt: string,
    userPrompt: string,
    workflowId: string,
  ): Promise<{ result: string; files: string[] }> {
    // ─── 1. 调用 AI 生成代码 ───
    // 复用现有的 callAI()，走 OpenAI 兼容 API（DeepSeek / 公司中转）
    // AI 会按照 prompt 模板的要求，输出包含代码块的 Markdown 文本
    // 传 16384 max_tokens：代码生成输出很长，默认 4096 容易截断
    // 截断会导致最后一个代码块缺少闭合的 ```，正则匹配失败丢失该文件
    const result = await this.callAI(
      systemPrompt,
      [{ role: 'user', content: userPrompt }],
      16384,
    );

    // ─── 2. 解析 Markdown 中的代码块 ───
    // 从 AI 输出中提取所有 { filePath, code } 对
    const codeBlocks = this.parseCodeBlocks(result);

    // ─── 3. 创建工作目录并写入文件 ───
    // 每个工作流有独立的目录，互不干扰
    const workDir = path.join(
      process.env.AI_WORKSPACE_DIR || '/tmp/ai-workspace',
      workflowId,
    );

    const files: string[] = [];

    for (const block of codeBlocks) {
      // 拼出文件的完整绝对路径
      const fullPath = path.join(workDir, block.filePath);

      // path.dirname() 获取文件所在的目录路径
      // 例如 fullPath = '/tmp/ai-workspace/abc/src/modules/user.ts'
      //      dirname  = '/tmp/ai-workspace/abc/src/modules/'
      // mkdirSync + recursive: true 会递归创建所有不存在的父目录
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });

      // writeFileSync 同步写入文件内容
      // 如果文件已存在会被覆盖（这是期望行为——重新执行节点时覆盖旧产出）
      fs.writeFileSync(fullPath, block.code, 'utf-8');

      // 记录写入的文件相对路径，供前端展示
      files.push(block.filePath);
    }

    return { result, files };
  }

  /**
   * 从 AI 输出的 Markdown 文本中解析代码块
   *
   * 使用两级正则策略：
   * 1. 严格正则：匹配 ### `filepath` 格式（prompt 模板要求的标准格式）
   * 2. 宽松正则：兜底匹配 ##/###/####、有无反引号、**加粗** 等常见偏差
   *
   * 这样做的原因：不同 AI 模型（DeepSeek、Claude、GPT）对格式的遵守程度不一样
   * 严格正则优先保证精确匹配，宽松正则防止因格式微小偏差而丢失所有代码块
   *
   * @param text - AI 输出的完整 Markdown 文本
   * @returns 解析出的代码块数组 [{ filePath, code }]
   */
  parseCodeBlocks(text: string): { filePath: string; code: string }[] {
    const blocks: { filePath: string; code: string }[] = [];

    // ─── 正则1（严格匹配）───
    // 要求格式：### `src/app.ts`  +  ```typescript\n code \n```
    // 这是 prompt 模板中要求 AI 使用的标准格式
    const strictRegex = /###\s*`([^`]+)`[\s\S]*?```\w*\n([\s\S]*?)\n```/g;
    let match: RegExpExecArray | null;
    while ((match = strictRegex.exec(text)) !== null) {
      const filePath = match[1].trim();
      const code = match[2];
      if (filePath && code.trim()) {
        blocks.push({ filePath, code });
      }
    }

    // 严格正则匹配到了，直接返回（不走宽松正则，避免重复匹配）
    if (blocks.length > 0) return blocks;

    // ─── 正则2（宽松兜底）───
    // 兼容以下常见偏差格式：
    //   ## `src/app.ts`           — 二级标题 + 反引号
    //   ### src/app.ts            — 三级标题 + 无反引号
    //   #### **src/app.ts**       — 四级标题 + 加粗
    //
    // 正则说明：
    // #{2,4}       — 匹配 2~4 个 # 号（##、###、####）
    // \s*          — # 号后的空格
    // \**          — 可选的 ** 加粗标记
    // `?           — 可选的反引号
    // ([^`\n*]+?)  — 捕获组1：文件路径（非贪婪，排除反引号、换行、星号）
    // `?           — 可选的关闭反引号
    // \**          — 可选的关闭 ** 加粗标记
    // \s*\n        — 标题行结尾
    // [\s\S]*?     — 标题和代码块之间的任意内容
    // ```\w*\n     — 代码块开始
    // ([\s\S]*?)   — 捕获组2：代码内容
    // \n```        — 代码块结束
    const looseRegex = /#{2,4}\s*\**`?([^`\n*]+?)`?\**\s*\n[\s\S]*?```\w*\n([\s\S]*?)\n```/g;
    while ((match = looseRegex.exec(text)) !== null) {
      const filePath = match[1].trim();
      const code = match[2];
      // 过滤掉不像文件路径的标题（文件路径至少包含 . 或 /）
      // 例如 “## 数据库设计” 这种中文标题会被过滤掉
      if (filePath && code.trim() && /[./]/.test(filePath)) {
        blocks.push({ filePath, code });
      }
    }

    // ─── 调试日志 ───
    // 如果 AI 输出了内容但两个正则都没匹配到，打印警告帮助排查
    if (blocks.length === 0 && text.trim().length > 0) {
      console.warn(
        '[parseCodeBlocks] AI 输出非空但未解析到代码块，可能是格式不匹配。',
        '输出前 500 字符：',
        text.substring(0, 500),
      );
    }

    return blocks;
  }

  /**
   * 递归列出目录下所有文件的相对路径
   *
   * 例如目录结构：
   *   /tmp/ai-workspace/abc/
   *     ├── src/
   *     │   ├── app.ts
   *     │   └── utils.ts
   *     └── package.json
   *
   * 返回：['src/app.ts', 'src/utils.ts', 'package.json']
   *
   * @param dir  - 要扫描的绝对路径
   * @param base - 当前递归层级的相对路径前缀（外部调用时不传，默认 ''）
   * @returns 所有文件的相对路径数组
   */
  listFiles(dir: string, base = ''): string[] {
    // 目录不存在时返回空数组，避免报错
    if (!fs.existsSync(dir)) return [];
    // readdirSync: 同步读取目录内容
    // withFileTypes: true - 返回 Dirent 对象（包含 isDirectory()等方法）
    // 而不是纯文件名字符串，这样不需要额外调 stat 判断类型
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      // path.json 拼接相对路径，例如 base=‘src’，entry.name='app.ts' => 'src/app.ts'
      const rel = path.join(base, entry.name);

      if (entry.isDirectory()) {
        // 是目录 -> 递归进入， base 传入当前相对路径
        files.push(...this.listFiles(path.join(dir, entry.name), rel));
      } else {
        // 是文件 -> 直接加入结果
        files.push(rel);
      }
    }

    return files;
  }
}
