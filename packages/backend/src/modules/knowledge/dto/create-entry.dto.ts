/**
 * 手动录入知识条目的请求参数
 *
 * 对应接口：POST /knowledge/bases/:id/entries
 * 请求体：{ "title": "PRD必须包含的字段", "content": "每份PRD必须包含。。。" }
 *
 * 和上传文件的区别：
 *      上传文件 -> 系统自动解析 + 切片
 *      手动录入 -> 用户直接写文吧，系统切片后入库
 */
import { IsString } from 'class-validator';

export class CreateEntryDto {
  // 条目标题（作为文档名）
  @IsString()
  title: string;

  // 条目内容（会被切片 + Embedding + 存入 Milvus）
  @IsString()
  content: string;
}
