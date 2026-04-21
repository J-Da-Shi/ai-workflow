import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workflow } from './entities/workflow.entity';
import { WorkflowNode } from './entities/workflow-node.entity';
import { WorkflowController } from './workflow.controller';
import { NodeCategoriesController } from './node-categories.controller';
import { WorkflowService } from './workflow.service';

@Module({
  imports: [TypeOrmModule.forFeature([Workflow, WorkflowNode])],
  controllers: [WorkflowController, NodeCategoriesController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
