import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodeExecution } from './entities/node-execution.entity';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';
import { WorkflowModule } from '../workflow/workflow.module';
import { AiModule } from '../ai/ai.module';
import { AgentModule } from '../agent/agent.module';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NodeExecution]),
    WorkflowModule,
    AiModule,
    AgentModule,
    RagModule,
  ],
  controllers: [ExecutionController],
  providers: [ExecutionService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
