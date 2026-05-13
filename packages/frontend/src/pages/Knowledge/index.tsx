import { useState, useEffect } from 'react';
import { Button, Spin, Empty, message, Modal, Input } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getKnowledgeBases,
  createKnowledgeBase,
  deleteKnowledgeBase,
  getDocuments,
  uploadDocument,
  createManualEntry,
  deleteDocument,
} from '../../api/knowledge';
import './index.css';

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  chunkCount: number;
  status: string;
  createdAt: string;
}

interface KBDocument {
  id: string;
  fileName: string;
  fileType: string;
  chunkCount: number;
  status: string;
  error: string | null;
  createdAt: string;
}

export default function KnowledgePage() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  // 状态
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');

  // 详情模式
  const [selectedKb, setSelectedKb] = useState<KnowledgeBase | null>(null);
  const [docs, setDocs] = useState<KBDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // 手动录入弹窗
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryTitle, setEntryTitle] = useState('');
  const [entryContent, setEntryContent] = useState('');

  // 加载知识库列表
  useEffect(() => {
    fetchBases();
  }, [projectId]);

  const fetchBases = async () => {
    setLoading(true);
    try {
      const res = await getKnowledgeBases(projectId || '');
      setBases(Array.isArray(res) ? res : (res as any).data || []);
    } catch {
      setBases([]);
    } finally {
      setLoading(false);
    }
  };

  // 创建知识库
  const handleCreate = async () => {
    if (!createName.trim()) {
      message.error('请输入知识库名称');
      return;
    }
    try {
      await createKnowledgeBase({
        name: createName.trim(),
        description: createDesc.trim(),
        projectId: projectId || '',
      });
      message.success('知识库创建成功');
      setCreateModalOpen(false);
      setCreateName('');
      setCreateDesc('');
      fetchBases();
    } catch {
      message.error('创建失败');
    }
  };

  // 删除知识库
  const handleDeleteKb = async (id: string) => {
    try {
      await deleteKnowledgeBase(id);
      message.success('已删除');
      if (selectedKb?.id === id) setSelectedKb(null);
      fetchBases();
    } catch {
      message.error('删除失败');
    }
  };

  // 进入知识库详情
  const handleSelectKb = async (kb: KnowledgeBase) => {
    setSelectedKb(kb);
    setDocsLoading(true);
    try {
      const res = await getDocuments(kb.id);
      setDocs(Array.isArray(res) ? res : (res as any).data || []);
    } catch {
      setDocs([]);
    } finally {
      setDocsLoading(false);
    }
  };

  // 刷新文档列表
  const refreshDocs = async () => {
    if (!selectedKb) return;
    const res = await getDocuments(selectedKb.id);
    setDocs(Array.isArray(res) ? res : (res as any).data || []);
  };

  // 上传文件
  const handleUpload = () => {
    if (!selectedKb) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.doc,.md,.txt';
    input.onchange = async () => {
      if (!input.files?.[0]) return;
      try {
        const formData = new FormData();
        formData.append('file', input.files[0]);
        await uploadDocument(selectedKb.id, formData);
        message.success('文件已上传，正在处理中');
        // 延迟 2 秒后刷新（等后端创建 document 记录）
        setTimeout(refreshDocs, 2000);
        // 10 秒后再刷一次（等处理完成更新状态）
        setTimeout(refreshDocs, 10000);
      } catch {
        message.error('上传失败');
      }
    };
    input.click();
  };

  // 手动录入
  const handleCreateEntry = async () => {
    if (!selectedKb || !entryTitle.trim() || !entryContent.trim()) {
      message.error('请填写标题和内容');
      return;
    }
    try {
      await createManualEntry(selectedKb.id, {
        title: entryTitle.trim(),
        content: entryContent.trim(),
      });
      message.success('条目已提交，正在处理中');
      setEntryModalOpen(false);
      setEntryTitle('');
      setEntryContent('');
      // 延迟刷新
      setTimeout(refreshDocs, 2000);
      setTimeout(refreshDocs, 10000);
    } catch {
      message.error('提交失败');
    }
  };

  // 删除文档
  const handleDeleteDoc = async (docId: string) => {
    try {
      await deleteDocument(docId);
      message.success('文档已删除');
      setDocs(docs.filter((d) => d.id !== docId));
    } catch {
      message.error('删除失败');
    }
  };

  if (loading) {
    return <Spin style={{ display: 'block', margin: '40px auto' }} />;
  }

  // 详情模式
  if (selectedKb) {
    return (
      <div className="kb-page">
        <div className="kb-page-header">
          <h2>
            <a className="kb-back" onClick={() => setSelectedKb(null)}>← 返回</a>
            {selectedKb.name}
          </h2>
          <div className="kb-actions">
            <Button onClick={handleUpload}>📎 上传文档</Button>
            <Button onClick={() => setEntryModalOpen(true)}>✏️ 手动录入</Button>
            <Button danger onClick={() => handleDeleteKb(selectedKb.id)}>删除知识库</Button>
          </div>
        </div>

        <div className="kb-stats">
          <span>状态：<span className={`kb-status ${selectedKb.status}`}>{selectedKb.status === 'active' ? '可用' : selectedKb.status}</span></span>
          <span>{selectedKb.documentCount} 个文档</span>
          <span>{selectedKb.chunkCount} 个切片</span>
        </div>

        {docsLoading ? (
          <Spin style={{ display: 'block', margin: '40px auto' }} />
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th>文件名</th>
                <th>类型</th>
                <th>切片数</th>
                <th>状态</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                    暂无文档，点击「上传文档」或「手动录入」添加知识
                  </td>
                </tr>
              ) : (
                docs.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.fileName}</td>
                    <td><span className={`doc-type ${doc.fileType}`}>{doc.fileType}</span></td>
                    <td>{doc.chunkCount || '—'}</td>
                    <td><span className={`doc-status ${doc.status}`}>{doc.status === 'completed' ? '已完成' : doc.status === 'processing' ? '处理中' : doc.status === 'failed' ? '失败' : '待处理'}</span></td>
                    <td>{new Date(doc.createdAt).toLocaleDateString()}</td>
                    <td>
                      {doc.status === 'processing' ? (
                        <span style={{ color: '#999', fontSize: 12 }}>处理中...</span>
                      ) : (
                        <a className="doc-delete" onClick={() => handleDeleteDoc(doc.id)}>删除</a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* 手动录入弹窗 */}
        <Modal
          title="手动录入知识"
          open={entryModalOpen}
          onCancel={() => setEntryModalOpen(false)}
          onOk={handleCreateEntry}
          okText="提交"
          cancelText="取消"
        >
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#666' }}>标题</label>
            <Input
              value={entryTitle}
              onChange={(e) => setEntryTitle(e.target.value)}
              placeholder="知识条目标题"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#666' }}>内容</label>
            <Input.TextArea
              value={entryContent}
              onChange={(e) => setEntryContent(e.target.value)}
              placeholder="输入知识内容..."
              rows={10}
            />
          </div>
        </Modal>
      </div>
    );
  }

  // 列表模式
  return (
    <div className="kb-page">
      <div className="kb-page-header">
        <h2>知识库管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
          新建知识库
        </Button>
      </div>

      {bases.length === 0 ? (
        <Empty description="暂无知识库" style={{ marginTop: 60 }}>
          <Button type="primary" onClick={() => setCreateModalOpen(true)}>创建第一个知识库</Button>
        </Empty>
      ) : (
        <div className="kb-list">
          {bases.map((kb) => (
            <div key={kb.id} className="kb-card" onClick={() => handleSelectKb(kb)}>
              <h3>{kb.name}</h3>
              <p className="kb-desc">{kb.description || '暂无描述'}</p>
              <div className="kb-meta">
                <span>{kb.documentCount} 个文档</span>
                <span>{kb.chunkCount} 个切片</span>
                <span className={`kb-status ${kb.status}`}>{kb.status === 'active' ? '可用' : kb.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建知识库弹窗 */}
      <Modal
        title="新建知识库"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleCreate}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#666' }}>名称</label>
          <Input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="如：PRD审核标准"
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#666' }}>描述（可选）</label>
          <Input.TextArea
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
            placeholder="简要描述知识库用途"
            rows={3}
          />
        </div>
      </Modal>
    </div>
  );
}
