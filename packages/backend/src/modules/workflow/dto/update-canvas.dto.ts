import { IsArray } from 'class-validator';

export class UpdateCanvasDto {
  @IsArray()
  nodes: any[];

  @IsArray()
  edges: any[];
}
