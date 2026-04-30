import request from "../utils/request";

// 节点分类                                                             
export const getNodeCategories = () => request.get('/node-categories');

// 工作流 CRUD                                                          
export const createWorkflow = (data: { name: string; projectId: string }) =>
    request.post('/workflows', data);
export const getWorkflows = (projectId: string) =>
    request.get('/workflows', { params: { projectId } });
export const getWorkflow = (id: string) =>
    request.get(`/workflows/${id}`);

// 画布                                                                 
export const getCanvas = (workflowId: string) =>
    request.get(`/workflows/${workflowId}/canvas`);
export const updateCanvas = (workflowId: string, data: { nodes: any[]; edges: any[] }) =>
    request.put(`/workflows/${workflowId}/canvas`, data);

// 节点配置                                                             
export const createNodeConfig = (workflowId: string, data: any) =>
    request.post(`/workflows/${workflowId}/nodes`, data);
export const getNodeConfig = (workflowId: string, nodeKey: string) =>
    request.get(`/workflows/${workflowId}/nodes/${nodeKey}/config`);
export const updateNodeConfig = (workflowId: string, nodeKey: string, data: any) =>
    request.put(`/workflows/${workflowId}/nodes/${nodeKey}/config`, data);
export const deleteNodeConfig = (workflowId: string, nodeKey: string) =>
    request.delete(`/workflows/${workflowId}/nodes/${nodeKey}`);

// 获取对话历史                                                                                                                                      
export const getChatHistory = (workflowId: string, nodeKey: string) =>
    request.get(`/ai/chat-history/${workflowId}/${nodeKey}`);

// 清空对话历史                                                                                                                                      
export const clearChatHistory = (workflowId: string, nodeKey: string) =>
    request.delete(`/ai/chat-history/${workflowId}/${nodeKey}`);

// 执行相关                                                                                                                                          
export const executeWorkflow = (workflowId: string) =>
    request.post(`/workflows/${workflowId}/execute`, {}, { timeout: 300000 });

export const executeNode = (workflowId: string, nodeKey: string) =>
    request.post(`/workflows/${workflowId}/nodes/${nodeKey}/execute`, {}, { timeout: 300000 });

export const approveNode = (workflowId: string, nodeKey: string) =>
    request.post(`/workflows/${workflowId}/nodes/${nodeKey}/approve`, {}, { timeout: 300000 });

export const rejectNode = (workflowId: string, nodeKey: string) =>
    request.post(`/workflows/${workflowId}/nodes/${nodeKey}/reject`);

export const getExecutions = (workflowId: string) =>
    request.get(`/workflows/${workflowId}/executions`);

export const deleteExecution = (workflowId: string, nodeKey: string) =>
    request.delete(`/workflows/${workflowId}/nodes/${nodeKey}/execution`);

// Agent 日志
export const getAgentLogs = (workflowId: string, nodeKey: string) =>
    request.get(`/agent/logs/${workflowId}/${nodeKey}`);
