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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { CreateEntryDto } from './dto/create-entry.dto';

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
    return this.knowledgeService.listKnowledgeBases(projectId);
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
  @Delete('documents/:docId')
  removeDocument(@Param('docId') docId: string) {
    return this.knowledgeService.deleteDocument(docId);
  }

  /**
   * 上传文档
   * POST /knowledge/bases/:id/docuemnts/upload
   *
   * 使用 multer 处理文件上传：
   *  - FileInterceptor('file')：从请求中提取名为 “file” 的文件
   *  - diskStorage: 文件保存到磁盘（AI_WORKSPACE_DIR/knowledge/uploads/）
   *  - 文件名用时间戳 + 原始名，避免重复覆盖
   */
  @Post('bases/:id/documents/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = path.join(
            process.env.AI_WORKSPACE_DIR || '/tmp/ai-workspace',
            'knowledge',
            'uploads',
          );
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          // 解码中文文件名（multer 把中文编码为 latin1，需要转回 utf8）
          const originalName = Buffer.from(
            file.originalname,
            'latin1',
          ).toString('utf8');
          const name = `${Date.now()}-${originalName}`;
          cb(null, name);
        },
      }),
    }),
  )
  uploadDocument(
    @Param('id') knowledgeBaseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // 解码中文文件名（multer 把中文编码为 latin1，需要转回 utf8）
    const originalName = Buffer.from(file.originalname, 'latin1').toString(
      'utf8',
    );

    // 根据文件扩展名判断类型
    const ext = path.extname(originalName).toLowerCase();
    const typeMap: Record<string, string> = {
      '.pdf': 'pdf',
      '.docx': 'word',
      '.doc': 'word',
      '.md': 'markdown',
      '.txt': 'markdown',
    };
    const fileType = typeMap[ext] || 'markdown';

    // 触发处理管线（异步处理，不阻塞响应）
    void this.knowledgeService.processDocument(
      knowledgeBaseId,
      originalName,
      file.path,
      fileType,
      file.size,
    );

    // 立即返回（不等处理完成）
    return { message: '文件已上传，正在处理中' };
  }

  /**
   * 手动录入知识条目
   * POST /knowledge/bases/:id/entries
   * Body: { title, content }
   */
  @Post('bases/:id/entries')
  createEntry(
    @Param('id') knowledgeBaseId: string,
    @Body() dto: CreateEntryDto,
  ) {
    // 手动录入也走异步处理（切片 + Embedding 可能需要几秒）
    void this.knowledgeService.createManualEntry(knowledgeBaseId, dto);
    return { message: '条目已提交，正在处理中' };
  }
}
