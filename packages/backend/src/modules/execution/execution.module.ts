import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodeExecution } from './entities/node-execution.entity';
import { ExecutionService } from './execution.service';
import { ExecutionController } from './execution.controller';
import { WorkflowModule } from '../workflow/workflow.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NodeExecution]),
    WorkflowModule,
    AiModule,
  ],
  controllers: [ExecutionController],
  providers: [ExecutionService],
  exports: [ExecutionService],
})
export class ExecutionModule {}
