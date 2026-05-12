/**
 * 创建知识库的请求参数
 *
 * 对应接口：POST /knowledge/base
 * 请求体：{ "name": "PRD审核标准", "description": "...", "projectId": "xxx" }
 */
import { IsString, IsOptional } from 'class-validator';

export class CreateKnowledgeBaseDto {
  // 知识库名称（必填）
  @IsString()
  name: string;

  // 描述（选填）
  @IsString()
  @IsOptional()
  description?: string;

  // 所属项目ID
  @IsString()
  projectId: string;
}
