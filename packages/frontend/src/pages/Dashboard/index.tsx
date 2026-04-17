import { useEffect, useState } from 'react';
import { Button, Modal, Form, Input, message, Spin, Empty } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getStats, getProjects, createProject } from '../../api/workbench';
import PageTip from '../../components/PageTip';
import './index.css';

interface StatsData {
  totalProjects: number;
  runningWorkflows: number;
  completeWorkflows: number;
  pendingReview: number;
}

interface ProjectItem {
  id: string;
  name: string;
  description: string;
  gitUrl: string;
  createdAt: string;
  updatedAt: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatsData>({
    totalProjects: 0,
    runningWorkflows: 0,
    completeWorkflows: 0,
    pendingReview: 0,
  });
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, projectsRes] = await Promise.all([
        getStats(),
        getProjects(),
      ]);
      setStats(statsRes as any);
      setProjects(projectsRes as any);
    } catch {
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (values: { name: string; description?: string; gitUrl?: string }) => {
    setCreating(true);
    try {
      await createProject(values);
      message.success('项目创建成功');
      setModalOpen(false);
      form.resetFields();
      fetchData();
    } catch {
      message.error('创建失败');
    } finally {
      setCreating(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}分钟前更新`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前更新`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前更新`;
    return `${Math.floor(days / 7)}周前更新`;
  };

  const statCards = [
    { label: '项目总数', value: stats.totalProjects },
    { label: '进行中的工作流', value: stats.runningWorkflows },
    { label: '已完成的工作流', value: stats.completeWorkflows },
    { label: '待审批', value: stats.pendingReview },
  ];

  return (
    <div className="dashboard">
      <PageTip
        title="工作台："
        description="展示所有项目列表、工作流统计数据和快速创建入口。"
      />

      <div className="dashboard-header">
        <h2>我的项目</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          新建项目
        </Button>
      </div>

      <Spin spinning={loading}>
        <div className="stats">
          {statCards.map((item) => (
            <div className="stat-card" key={item.label}>
              <div className="stat-number">{item.value}</div>
              <div className="stat-label">{item.label}</div>
            </div>
          ))}
        </div>

        {projects.length === 0 && !loading ? (
          <Empty description="暂无项目，点击右上角新建" />
        ) : (
          <div className="project-list">
            {projects.map((project) => (
              <div
                className="project-card"
                key={project.id}
                onClick={() => navigate(`/pipeline?projectId=${project.id}`)}
              >
                <h3>{project.name}</h3>
                <div className="project-desc">{project.description || '暂无描述'}</div>
                <div className="project-meta">
                  {project.gitUrl && (
                    <span className="project-tag tag-blue">已关联仓库</span>
                  )}
                  <span>{formatTime(project.updatedAt)}</span>
                </div>
              </div>
            ))}
            <div className="project-card project-card-add" onClick={() => setModalOpen(true)}>
              <div className="add-content">
                <div className="add-icon">+</div>
                <div>新建项目</div>
              </div>
            </div>
          </div>
        )}
      </Spin>

      <Modal
        title="新建项目"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="如：user-center" />
          </Form.Item>
          <Form.Item name="description" label="项目描述">
            <Input.TextArea placeholder="简要描述项目用途" rows={3} />
          </Form.Item>
          <Form.Item name="gitUrl" label="Git 仓库地址">
            <Input placeholder="如：https://github.com/xxx/xxx.git" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={creating} block>
              创建
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Dashboard;
