/**
 * PrdReviewService — PRD 审核编排服务
 *
 * 职责：把 RAG 的三步串起来
 *  R：调 RagService 检索相关审核标准
 *  A：把检索结果拼进 System Prompt（增强）
 *  G：调 AiService 让 AI 输出结构化审核报告
 *
 * 为什么单独封装而不是写在 ExecutionService 里：
 *  - PRD 审核有自己的 Prompt 构造逻辑和输出格式
 *  - ExecutionService 只负责调度（判断 nodeType -> 调对应的 Service）
 *  - 后续加 “代码 Review” 节点时也可以类似封装一个 CodeReviewService
 */
import { Injectable, Logger } from '@nestjs/common';
import { RagService } from './rag.service';
import { AiService } from '../ai/ai.service';

// 审核报告结构化类型
export interface PrdReviewResult {
  output: string; // AI 原始输出（完整审核报告文本）
  summary: string; // 一句话摘要
}

@Injectable()
export class PrdReviewService {
  private readonly logger = new Logger(PrdReviewService.name);

  constructor(
    private ragService: RagService,
    private aiService: AiService,
  ) {}

  /**
   * 执行 PRD 审核
   *
   * 完整流程：
   *    1. 用 PRD 文本检索知识库（R）
   *    2. 把检索结果拼进 Prompt（A）
   *    3. 调 AI 生成审核报告（G）
   *    4. 生成摘要
   *
   * @param prdContent       - PRD 文本（来自上游节点输出或用户输入）
   * @param knowledgeBaseIds - 要检索的知识库 ID 列表（从节点配置读取）
   * @param userPrompt       - 用户在节点配置中写的 Prompt（可覆盖默认审核指令）
   * @returns { output, summary }
   */
  async executePrdReview(
    prdContent: string,
    knowledgeBaseIds: string[],
    userPrompt?: string,
  ): Promise<PrdReviewResult> {
    // R：检索相关审核标准
    let retrievedContext = '';
    if (knowledgeBaseIds && knowledgeBaseIds.length > 0) {
      const results = await this.ragService.retrieve(
        prdContent,
        knowledgeBaseIds,
      );

      // 把检索到的片段拼成一段文本
      // 每个片段标注来源和相似度，方便 AI 判断可信度
      if (results.length > 0) {
        retrievedContext = results
          .map(
            (r, i) =>
              `【参考资料 ${i + 1}】(相似度：${(r.score * 100).toFixed(0)}%) \n${r.content}`,
          )
          .join('\n\n');
      }

      this.logger.log(`RAG 检索完成，命中 ${results.length}条参考资料`);
    }

    // A：构造增强后的 Prompt
    // System Prompt = 用户自定义 Prompt（如果有）+ 默认审核指令 + 检索到的参考资料
    const systemPrompt = this.buildReviewPrompt(retrievedContext, userPrompt);

    // G：调 AI 生成审核报告
    const output = await this.aiService.callAI(systemPrompt, [
      { role: 'user', content: prdContent },
    ]);

    // 生成一句话摘要
    const summary = await this.aiService.callAI(
      '请对这份 PRD 审核报告做重点提炼，不要一句话概括；按「核心结论、存在问题、风险提示、整改建议」分模块整理，条理清晰列出所有关键要点。',
      [{ role: 'user', content: output }],
    );

    return { output, summary };
  }

  /**
   * 构造 PRD 审核的 System Prompt
   *
   * 结构：
   *    1. 角色定义（你是 PRD 审核专家）
   *    2. 检索到的参考资料（如果有）
   *    3. 审核维度和输出格式要求
   *
   * @param retrievedContext - RAG 检索到的知识片段（拼接后的文本）
   * @param userPrompt       - 用户自定义 Prompt（可选，覆盖默认指令）
   */
  private buildReviewPrompt(
    retrievedContext: string,
    userPrompt?: string,
  ): string {
    // 如果用户配了自定义 Prompt，以用户的为主，把检索结构附在后面
    if (userPrompt) {
      return retrievedContext
        ? `${userPrompt}\n\n## 参考资料（来自知识库检索）\n\n${retrievedContext}`
        : userPrompt;
    }

    // 默认审核 Prompt
    let prompt = `你是一个资深的 PRD 审核专家。请对用户提交的 PRD 文档进行全面审核。`;

    // 如果有检索到的参考资料，注入到 Prompt 中
    if (retrievedContext) {
      prompt += `\n\n## 审核参考标准（来自知识库）\n\n以下是从知识库中检索到的审核标准和规范，请基于这些标准进行审核：\n\n${retrievedContext}`;
    }

    // 输出格式要求
    prompt += `\n\n## 输出格式要求

  请按以下结构输出审核报告：

  ### 审核结论
  （通过 / 有条件通过 / 不通过）

  ### 各维度评审

  #### 1. 文档完整性
  - 评分：x/10
  - 意见：...

  #### 2. 技术可行性
  - 评分：x/10
  - 意见：...

  #### 3. 边界条件覆盖
  - 评分：x/10
  - 意见：...

  #### 4. 用词规范性
  - 评分：x/10
  - 意见：...

  ### 改进建议
  （按优先级列出需要修改的地方）

  ### 引用来源
  （列出审核中参考了哪些知识库资料）`;

    return prompt;
  }
}
