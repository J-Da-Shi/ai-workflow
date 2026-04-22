import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AiService } from './ai.service';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private aiService: AiService) {}

  @Post('chat')
  async chat(
    @Body()
    body: {
      workflowId: string;
      nodeKey: string;
      message: string;
    },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // 1. 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      // 2. 调用 service
      const { stream, workflowId, nodeKey, userMessage } =
        await this.aiService.chat(
          body.workflowId,
          body.nodeKey,
          body.message,
          (req as any).user.id,
        );

      // 3. 遍历异步迭代器，逐 token 推送
      let fullContent = '';
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) {
          fullContent += text;
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      // 4. 流结束：发送 DONE 标记，关闭连接
      res.write(`data: [DONE]\n\n`);
      res.end();

      // 5. 存消息到数据库（不阻塞响应，已经 end 了）
      await this.aiService.saveMessages(
        workflowId,
        nodeKey,
        userMessage,
        fullContent,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误';
      res.write(
        `data: ${JSON.stringify({ error: `AI 服务调用失败: ${message}` })}\n\n`,
      );
      res.end();
    }
  }

  @Get('chat-history/:workflowId/:nodeKey')
  async getChatHistory(
    @Param('workflowId') workflowId: string,
    @Param('nodeKey') nodeKey: string,
  ) {
    return await this.aiService.getChatHistory(workflowId, nodeKey);
  }

  @Delete('chat-history/:workflowId/:nodeKey')
  async clearChatHistory(
    @Param('workflowId') workflowId: string,
    @Param('nodeKey') nodeKey: string,
  ) {
    await this.aiService.clearChatHistory(workflowId, nodeKey);
  }
}
