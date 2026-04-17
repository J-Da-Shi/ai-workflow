import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/work.entity';
import { WorkController } from './work.controller';
import { WorkService } from './work.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project])],
  controllers: [WorkController],
  providers: [WorkService],
  exports: [WorkService],
})
export class WorkModule {}
