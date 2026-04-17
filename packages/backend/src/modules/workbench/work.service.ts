import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './entities/work.entity';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class WorkService {
  constructor(
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
  ) {}

  // 创建项目
  async create(dto: CreateProjectDto, userId: string) {
    const project = this.projectRepo.create({ ...dto, ownerId: userId });
    return this.projectRepo.save(project);
  }

  // 查询当前用户的项目列表
  async findAll(userId: string) {
    return this.projectRepo.find({
      where: { ownerId: userId },
      order: { updatedAt: 'DESC' },
    });
  }

  // 查询单个项目
  async findOne(id: string, userId: string) {
    return this.projectRepo.findOne({ where: { id, ownerId: userId } });
  }

  // 统计数据（工作台顶部卡片用）
  async getStats(userId: string) {
    const totalProjects = await this.projectRepo.count({
      where: { ownerId: userId },
    });
    return {
      totalProjects,
      runningWorkflows: 0, // 后续介入 workflow 模块后再查
      completeWorkflows: 0,
      pendingReview: 0,
    };
  }
}
