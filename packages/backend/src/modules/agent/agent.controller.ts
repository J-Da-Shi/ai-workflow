import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentLogEntity } from './entities/agent-log.entity';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(
    @InjectRepository(AgentLogEntity)
    private logRepo: Repository<AgentLogEntity>,
  ) {}

  @Get('logs/:workflowId/:nodeKey')
  async getLogs(
    @Param('workflowId') workflowId: string,
    @Param('nodeKey') nodeKey: string,
  ) {
    return this.logRepo.find({
      where: { workflowId, nodeKey },
      order: { createdAt: 'ASC' },
    });
  }
}
