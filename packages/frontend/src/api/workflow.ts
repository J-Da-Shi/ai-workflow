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