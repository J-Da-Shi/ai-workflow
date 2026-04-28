import { IsString, IsOptional, IsObject } from 'class-validator';

export class UpdateNodeConfigDto {
  @IsString()
  @IsOptional()
  nodeType?: string;

  @IsString()
  @IsOptional()
  aiModel?: string;
  /**
   * DTO（Data Transfer Object）是 NestJS 用来校验请求参数的。如果不在 DTO 里声明 aiProvider，前端传这个字段过来会被 class-validator 过滤掉，存不进数据库。                                                        
  - @IsOptional() 表示这个字段可以不传——创建节点时不传就用实体的默认值 'default'                                                                                                          
  - @IsString() 校验传了的话必须是字符串  
   */
  @IsString()
  @IsOptional()
  aiProvider?: string;

  @IsString()
  @IsOptional()
  timeout?: string;

  @IsString()
  @IsOptional()
  inputSource?: string;

  @IsObject()
  @IsOptional()
  promptLayers?: {
    system: string | null;
    project: string | null;
    node: string | null;
    activeLayer: 1 | 2 | 3;
  };

  @IsObject()
  @IsOptional()
  inputData?: {
    source?: string;
    files?: string[];
  };

  @IsObject()
  @IsOptional()
  outputData?: {
    summary?: string;
    files?: string[];
  };
}
