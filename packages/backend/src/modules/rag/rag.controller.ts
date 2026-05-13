/**
 * RagController — RAG 检索接口
 *
 * 提供搜索测试接口，用于：
 *   - 调试检索效果（开发时验证）
 *   - 前端"检索预览"功能
 */
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RagService } from './rag.service';

@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class RagController {
  constructor(private readonly ragService: RagService) {}

  /**
   * 测试检索（调试 + 前端预览用）
   * POST /knowledge/search
   * Body: { query: "搜索文本", knowledgeBaseIds: ["id1", "id2"] }
   *
   * 返回：命中的知识片段列表（content + score）
   */
  @Post('search')
  search(@Body() body: { query: string; knowledgeBaseIds: string[] }) {
    return this.ragService.retrieve(body.query, body.knowledgeBaseIds);
  }
}
