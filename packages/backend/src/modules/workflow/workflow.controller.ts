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
import { WorkflowService } from './workflow.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateCanvasDto } from './dto/update-canvas.dto';
import { CreateNodeConfigDto } from './dto/create-node-config.dto';
import { UpdateNodeConfigDto } from './dto/update-node-config.dto';

@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  // POST /api/workflows -- 创建工作流
  @Post()
  create(@Body() dto: CreateWorkflowDto, @Request() req) {
    return this.workflowService.create(dto, req.user.id);
  }

  // GET /api/workflows?projectId=xxx -- 查项目下的工作流列表
  @Get()
  findByProject(@Query('projectId') projectId: string) {
    return this.workflowService.findByProject(projectId);
  }

  // GET /api/workflows/:id -- 查工作流详情
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.workflowService.findOne(id, req.user.id);
  }

  // GET /api/workflows/:id/canvas -- 获取画布
  @Get(':id/canvas')
  getCanvas(@Param('id') id: string, @Request() req) {
    return this.workflowService.getCanvas(id, req.user.id);
  }

  // PUT /api/workflows/:id/canvas — 保存画布
  @Put(':id/canvas')
  updateCanvas(
    @Param('id') id: string,
    @Body() dto: UpdateCanvasDto,
    @Request() req,
  ) {
    return this.workflowService.updateCanvas(id, dto, req.user.id);
  }

  // POST /api/workflows/:id/nodes — 创建节点配置
  @Post(':id/nodes')
  createNodeConfig(
    @Param('id') id: string,
    @Body() dto: CreateNodeConfigDto,
    @Request() req,
  ) {
    return this.workflowService.createNodeConfig(id, req.user.id, dto);
  }

  // GET /api/workflows/:id/nodes/:nodeKey/config — 获取节点配置
  @Get(':id/nodes/:nodeKey/config')
  async getNodeConfig(
    @Param('id') id: string,
    @Param('nodeKey') nodeKey: string,
    @Request() req,
  ) {
    await this.workflowService.findOne(id, req.user.id); // 权限校验
    return this.workflowService.getNodeConfig(id, nodeKey);
  }

  // PUT /api/workflows/:id/nodes/:nodeKey/config — 更新节点配置
  @Put(':id/nodes/:nodeKey/config')
  async updateNodeConfig(
    @Param('id') id: string,
    @Param('nodeKey') nodeKey: string,
    @Body() dto: UpdateNodeConfigDto,
    @Request() req,
  ) {
    await this.workflowService.findOne(id, req.user.id); // 权限校验
    return this.workflowService.updateNodeConfig(id, nodeKey, dto);
  }

  // DELETE /api/workflows/:id/nodes/:nodeKey — 删除节点配置
  @Delete(':id/nodes/:nodeKey')
  async deleteNodeConfig(
    @Param('id') id: string,
    @Param('nodeKey') nodeKey: string,
    @Request() req,
  ) {
    await this.workflowService.findOne(id, req.user.id); // 权限校验
    return this.workflowService.deleteNodeConfig(id, nodeKey);
  }
}
