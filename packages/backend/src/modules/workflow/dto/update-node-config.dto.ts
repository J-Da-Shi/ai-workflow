import { IsString, IsOptional, IsObject } from 'class-validator';

export class UpdateNodeConfigDto {
  @IsString()
  @IsOptional()
  nodeType: string;

  @IsString()
  @IsOptional()
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

  @IsObject()
  @IsOptional()
  inputData: {
    source?: string;
    files?: string[];
  };

  @IsObject()
  @IsOptional()
  outputData: {
    summary?: string;
    files?: string[];
  };
}
