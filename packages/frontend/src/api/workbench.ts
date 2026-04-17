import request from '../utils/request';

// 获取统计数据
// GET /workbench/stats
export function getStats() {
  return request.get('/workbench/stats');
}

// 获取项目列表
// GET /workbench/projects
export function getProjects() {
  return request.get('/workbench/projects');
}

// 获取项目详情
// GET /workbench/project/:id
export function getProject(id: string) {
  return request.get(`/workbench/project/${id}`);
}

// 创建项目
// POST /workbench/projects
export function createProject(data: {
  name: string;
  description?: string;
  gitUrl?: string;
}) {
  return request.post('/workbench/projects', data);
}
