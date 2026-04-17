import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WorkService } from './work.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('workbench')
@UseGuards(JwtAuthGuard) // 所有接口需要登陆 复用JWT
export class WorkController {
  constructor(private readonly workService: WorkService) {}

  @Post('projects')
  create(@Body() dto: CreateProjectDto, @Request() req: any) {
    return this.workService.create(dto, req.user.id);
  }
  // 获取项目列表
  @Get('projects')
  findAll(@Request() req: any) {
    return this.workService.findAll(req.user.id);
  }
  // 获取详情详情
  @Get('project/:id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.workService.findOne(id, req.user.id);
  }
  // 获取统计数据
  @Get('stats')
  getStats(@Request() req: any) {
    return this.workService.getStats(req.user.id);
  }
}
