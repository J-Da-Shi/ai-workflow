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
    request.post(`/workflows/${workflowId}/nodes/${nodeKey}/execute`, {}, { timeout: 120000 });

export const approveNode = (workflowId: string, nodeKey: string) =>
    request.post(`/workflows/${workflowId}/nodes/${nodeKey}/approve`, {}, { timeout: 300000 });

export const rejectNode = (workflowId: string, nodeKey: string) =>
    request.post(`/workflows/${workflowId}/nodes/${nodeKey}/reject`);

export const getExecutions = (workflowId: string) =>
    request.get(`/workflows/${workflowId}/executions`);

export const deleteExecution = (workflowId: string, nodeKey: string) =>
    request.delete(`/workflows/${workflowId}/nodes/${nodeKey}/execution`);

// ─── Claude Agent 产出文件相关 ───                                                                                                                                                    

/**                                                                                                                                                                                     
 * 获取 Claude Agent 工作目录下的文件列表                                                                                                                                               
 *                                                                                                                                                                                      
 * 当节点使用 Claude Agent 执行后，Agent 会在服务器上创建代码文件                                                                                                                       
 * 这个接口返回所有文件的相对路径列表                                                                                                                                                   
 *                                                                                                                                                                                      
 * @param workflowId - 工作流 ID                                                                                                                                                        
 * @param nodeKey    - 节点 key                                                                                                                                                         
 * @returns string[] 例如 ['src/app.ts', 'package.json']                                                                                                                                
 */
export const getWorkspaceFiles = (workflowId: string, nodeKey: string) =>
    request.get(`/workflows/${workflowId}/nodes/${nodeKey}/files`);

/**
 * 获取工作目录下指定文件的内容
 *
 * 用户在前端点击文件列表中的某个文件时，调用这个接口获取文件内容
 * 后端会做路径安全检查，防止读取工作目录外的文件
 *
 * 使用 query 参数传递文件路径（?path=src/app.ts），
 * 因为文件路径含斜杠，放在 URL path 中会和路由冲突
 *
 * @param workflowId - 工作流 ID
 * @param nodeKey    - 节点 key
 * @param filePath   - 文件相对路径，如 'src/app.ts'
 * @returns string 文件内容纯文本
 */
export const getWorkspaceFileContent = (
    workflowId: string,
    nodeKey: string,
    filePath: string,
) => request.get(`/workflows/${workflowId}/nodes/${nodeKey}/file-content`, { params: { path: filePath } });


/**                                                                                                                                                                                     
   * 保存工作目录下指定文件的内容                                                                                                                                                         
   *                                                                                                                                                                                      
   * 用户在前端 Monaco Editor 中编辑代码后，调用此接口写回服务器                                                                                                                          
   * 后端同样会做路径安全检查                                                                                                                                                             
   *                                                                                                                                                                                      
   * @param workflowId - 工作流 ID                                                                                                                                                        
   * @param nodeKey    - 节点 key                                                                                                                                                         
   * @param filePath   - 文件相对路径                                                                                                                                                     
   * @param content    - 新的文件内容                                                                                                                                                     
   */
export const saveWorkspaceFileContent = (
    workflowId: string,
    nodeKey: string,
    filePath: string,
    content: string,
) => request.put(`/workflows/${workflowId}/nodes/${nodeKey}/file-content`, { path: filePath, content }); 