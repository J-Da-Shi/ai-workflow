import request from '../utils/request';

// 知识库 CRUD
export const createKnowledgeBase = (data: { name: string; description?: string; projectId: string }) =>
  request.post('/knowledge/bases', data);

export const getKnowledgeBases = (projectId: string) =>
  request.get('/knowledge/bases', { params: { projectId } });

export const getKnowledgeBase = (id: string) =>
  request.get(`/knowledge/bases/${id}`);

export const deleteKnowledgeBase = (id: string) =>
  request.delete(`/knowledge/bases/${id}`);

// 文档操作
export const uploadDocument = (kbId: string, formData: FormData) =>
  request.post(`/knowledge/bases/${kbId}/documents/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });

export const createManualEntry = (kbId: string, data: { title: string; content: string }) =>
  request.post(`/knowledge/bases/${kbId}/entries`, data);

export const getDocuments = (kbId: string) =>
  request.get(`/knowledge/bases/${kbId}/documents`);

export const deleteDocument = (docId: string) =>
  request.delete(`/knowledge/documents/${docId}`);

// 检索测试
export const searchKnowledge = (data: { query: string; knowledgeBaseIds: string[] }) =>
  request.post('/knowledge/search', data);
