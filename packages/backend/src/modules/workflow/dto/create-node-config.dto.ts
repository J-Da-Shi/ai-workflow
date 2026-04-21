import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateNodeConfigDto {
  @IsString()
  nodeKey: string;

  @IsString()
  nodeType: string;

  @IsString()
  aiModel: string;

  @IsString()
  @IsOptional()
  timeout: string;

  @IsString()
  @IsOptional()
  inputSource: string;

  @IsObject()
  @IsOptional()
  promptLayers: {
    system: string | null;
    project: string | null;
    node: string | null;
    activeLayer: 1 | 2 | 3;
  };
}
