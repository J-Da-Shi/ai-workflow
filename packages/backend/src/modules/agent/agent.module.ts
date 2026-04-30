import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AiModule } from '../ai/ai.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentLogEntity } from './entities/agent-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentLogEntity]),
    AiModule,
    WorkflowModule,
  ],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
