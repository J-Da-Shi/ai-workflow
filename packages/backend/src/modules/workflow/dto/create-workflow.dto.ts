import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateWorkflowDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description: string;

  @IsUUID()
  projectId: string;
}
