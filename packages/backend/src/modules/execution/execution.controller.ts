import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ExecutionService } from './execution.service';

@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Post(':id/execute')
  executeWorkflow(@Param('id') id: string, @Request() req) {
    return this.executionService.executeWorkflow(id, req.user.id);
  }

  @Post(':id/nodes/:nodeKey/execute')
  executeNode(
    @Param('id') id: string,
    @Param('nodeKey') nodeKey: string,
    @Request() req,
  ) {
    return this.executionService.executeNode(id, nodeKey, req.user.id);
  }

  @Post(':id/nodes/:nodeKey/approve')
  approveNode(
    @Param('id') id: string,
    @Param('nodeKey') nodeKey: string,
    @Request() req,
  ) {
    return this.executionService.approveNode(id, nodeKey, req.user.id);
  }

  @Post(':id/nodes/:nodeKey/reject')
  rejectNode(@Param('id') id: string, @Param('nodeKey') nodeKey: string) {
    return this.executionService.rejectNode(id, nodeKey);
  }

  @Get(':id/executions')
  getExecutions(@Param('id') id: string) {
    return this.executionService.getExecutions(id);
  }

  @Delete(':id/nodes/:nodeKey/execution')
  deleteExecution(@Param('id') id: string, @Param('nodeKey') nodeKey: string) {
    return this.executionService.deleteExecution(id, nodeKey);
  }
  /**
   * 获取 Claude Agent 工作目录下的文件列表
   * GET /workflows/:id/nodes/:nodeKey/files
   * 返回：string[]，例如 ['src/app.ts', 'src/utils.ts', 'package.json']
   */
  @Get(':id/nodes/:nodeKey/files')
  getWorkspaceFiles(@Param('id') id: string) {
    return this.executionService.getWorkspaceFiles(id);
  }
  /**
   * 获取工作目录下指定文件内容
   * GET /workflows/:id/nodes/:nodeKey/file-content?path=src/app.ts
   *
   * 为什么用 query 参数而不是路径参数：
   * 文件路径包含斜杠（如 src/modules/user.ts），放在 URL path 中会和路由冲突
   * 新版 NestJS (path-to-regexp v8) 不再支持 * 通配符参数
   * 用 ?path=xxx 传递文件路径最简单可靠
   *
   * @param id       - 工作流 ID
   * @param filePath - 文件相对路径，通过 query 参数 ?path= 传递
   * @returns 纯文本文件内容
   */
  @Get(':id/nodes/:nodeKey/file-content')
  getWorkspaceFileContent(
    @Param('id') id: string,
    @Query('path') filePath: string,
  ) {
    return this.executionService.getWorkspaceFileContent(id, filePath);
  }

  /**
   * 保存工作目录下指定文件内容
   *
   * @param id - 工作流ID
   * @param body - { path: 文件相对路径, content: 新内容 }
   */

  @Put(':id/nodes/:nodeKey/file-content')
  saveWorkspaceFileContent(
    @Param('id') id: string,
    @Body() body: { path: string; content: string },
  ) {
    return this.executionService.saveWorkspaceFileContent(
      id,
      body.path,
      body.content,
    );
  }
}
