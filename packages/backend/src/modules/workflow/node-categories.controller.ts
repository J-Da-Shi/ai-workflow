import { Controller, Get } from '@nestjs/common';

@Controller('node-categories')
export class NodeCategoriesController {
  @Get()
  findAll() {
    return [
      {
        name: '需求阶段',
        key: 'demandPhase',
        children: [
          { name: 'PRD审核', key: '1', icon: 'P', color: 'blue' },
          { name: '需求评审', key: '2', icon: 'R', color: 'blue' },
        ],
      },
      {
        name: '开发阶段',
        key: 'developmentPhase',
        children: [
          { name: '代码开发', key: '3', icon: 'C', color: 'green' },
          { name: '代码自测', key: '4', icon: 'T', color: 'green' },
          { name: '代码Review', key: '5', icon: 'R', color: 'cyan' },
        ],
      },
      {
        name: '发布阶段',
        key: 'releasePhase',
        children: [
          { name: '项目提测', key: '6', icon: 'Q', color: 'orange' },
          { name: '代码上线', key: '7', icon: 'D', color: 'red' },
        ],
      },
      {
        name: '通用',
        key: 'general',
        children: [
          { name: 'AI自定义任务', key: '8', icon: 'A', color: 'purple' },
          { name: '人工审批节点', key: '9', icon: 'H', color: 'purple' },
        ],
      },
    ];
  }
}
