import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
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

  @Post(':id/nodes/:nodeKey/execute-stream')
  async executeNodeStream(
    @Param('id') id: string,
    @Param('nodeKey') nodeKey: string,
    @Request() req,
    /**
     * 为什么用 @Res() 而不是正常返回值                       
       NestJS 默认会把方法返回值序列化为 JSON 响应。但 SSE 需要我们手动控制 res.write() 流式写入，所以必须注入原始 Response 对象。用了 @Res() 后 NestJS 就不会自动处理响应了，完全由我们控制。
       为什么用 POST 不用 GET                                                                                                                                                                     
       浏览器原生 EventSource 只支持 GET 且不能带自定义 Header。我们需要带 Authorization: Bearer xxx，所以用 POST + fetch + getReader() 手动读流。
     */
    @Res() res: Response,
  ) {
    // 1. 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 2. 定义 onEvent 回调：每收到一个事件就写入 SSE 格式数据
    // SSE 格式：`data: JSON字符串\n\n`（两个换行是 SSE 协议的消息分隔符
    const onEvent = (event: any) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      // 3. 调用 executeNode，传入 onEvent 开启实时推送
      await this.executionService.executeNode(
        id,
        nodeKey,
        req.user.id,
        onEvent,
      );

      // 4. 执行完毕，发送结束标记
      // 前端独到 【DONE】就知道流结束了，主动关闭 reader
      res.write('data: [DONE]\n\n');
    } catch (err: any) {
      // 5. 未捕获的异常也推送给前端
      res.write(
        `data: ${JSON.stringify({ type: 'error', data: { message: err.message } })}\n\n`,
      );
    }

    // 6. 关闭 SSE 连接
    res.end();
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
