import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
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
}
