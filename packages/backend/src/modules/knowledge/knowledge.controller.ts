/**
 * KnowledgeController - 知识库 REST 接口
 *
 * 路由前缀：/knowledge
 * 鉴权：全部需要 JWT（@UseGuards（JWTAuthGuard））
 *
 * 职责：只做参数接收和转发，不写业务逻辑
 * 业务逻辑全在 KnowledgeService 中
 */
import {
  Body,
  Controller,
  Post,
  UseGuards,
  Request,
  Get,
  Query,
  Param,
  Delete,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';

@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  /**
   * 创建知识库
   * POST /knowledge/bases
   * Body: { name, description, projectId }
   */
  @Post('bases')
  create(@Body() dto: CreateKnowledgeBaseDto, @Request() req) {
    // req.user.id 从 JWT token 中提取用户 ID
    return this.knowledgeService.createKnowledgeBase(dto, req.user.id);
  }

  /**
   * 查询项目下的知识库列表
   * GET /knowledge/bases?projectId=xxx
   */
  @Get('bases')
  list(@Query('projectId') projectId: string) {
    return this.knowledgeService.listDocuments(projectId);
  }

  /**
   * 获取知识库详情
   * GET /knowledge/bases/:id
   */
  @Get('bases/:id')
  detail(@Param('id') id: string) {
    return this.knowledgeService.getKnowledgeBase(id);
  }

  /**
   * 删除知识库（级联删除文档 + 切片 + Milvus 向量）
   * DELETE /knowledge/bases/:id
   */
  @Delete('bases/:id')
  remove(@Param('id') id: string) {
    return this.knowledgeService.deleteKnowledgeBase(id);
  }

  /**
   * 查询知识库下的文档列表
   * GET /knowledge/bases/:id/documents
   */
  @Get('bases/:id/documents')
  listDocuments(@Param('id') id: string) {
    return this.knowledgeService.listDocuments(id);
  }

  /**
   * 删除单个文档（级联删除切片 + Milvus 向量）
   * DELETE /knowledge/documents/:docId
   */
  @Delete('document/:docId')
  removeDocument(@Param('docId') docId: string) {
    return this.knowledgeService.deleteDocument(docId);
  }
}
