import type { StageNodeData, NodeCategory } from './types';
import type { Node, Edge } from '@xyflow/react';

export const initialNodes: Node<StageNodeData>[] = [
  { id: 'n1', type: 'stage', position: { x: 50, y: 40 }, data: { name: 'PRD 审核', key: '1', icon: 'P', color: 'blue', status: 'approved', meta: '耗时 3 分钟' } },
  { id: 'n2', type: 'stage', position: { x: 300, y: 40 }, data: { name: '需求评审', key: '2', icon: 'R', color: 'blue', status: 'approved', meta: '耗时 5 分钟' } },
  { id: 'n3', type: 'stage', position: { x: 510, y: 130 }, data: { name: '代码开发', key: '3', icon: 'C', color: 'green', status: 'approved', meta: '耗时 12 分钟' } },
  { id: 'n4', type: 'stage', position: { x: 720, y: 230 }, data: { name: '代码自测', key: '4', icon: 'T', color: 'green', status: 'approved', meta: '耗时 4 分钟' } },
  { id: 'n5', type: 'stage', position: { x: 930, y: 130 }, data: { name: '代码 Review', key: '5', icon: 'R', color: 'cyan', status: 'waiting', meta: '耗时 4 分钟' } },
  { id: 'n6', type: 'stage', position: { x: 1140, y: 40 }, data: { name: '项目提测', key: '6', icon: 'Q', color: 'orange', status: 'pending' } },
  { id: 'n7', type: 'stage', position: { x: 1350, y: 130 }, data: { name: '代码上线', key: '7', icon: 'D', color: 'red', status: 'pending' } },
];

export const initialEdges: Edge[] = [
  { id: 'e1-2', source: 'n1', target: 'n2', type: 'stage' },
  { id: 'e2-3', source: 'n2', target: 'n3', type: 'stage' },
  { id: 'e3-4', source: 'n3', target: 'n4', type: 'stage' },
  { id: 'e4-5', source: 'n4', target: 'n5', type: 'stage' },
  { id: 'e5-6', source: 'n5', target: 'n6', type: 'stage' },
  { id: 'e6-7', source: 'n6', target: 'n7', type: 'stage' },
];

export const nodeCategories: NodeCategory[] = [
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
