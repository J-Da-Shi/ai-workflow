import { Button } from 'antd';
import { PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageTip from '../../components/PageTip';
import './index.css';

type StageStatus = 'pending' | 'running' | 'waiting' | 'approved' | 'rejected';

const statusLabel: Record<StageStatus, string> = {
  pending: '待开始',
  running: '执行中',
  waiting: '待审批',
  approved: '已通过',
  rejected: '已驳回',
};

const stages: { name: string; status: StageStatus; duration?: string }[] = [
  { name: 'PRD 审核', status: 'approved', duration: '3分钟' },
  { name: '需求评审', status: 'approved', duration: '5分钟' },
  { name: '代码开发', status: 'approved', duration: '12分钟' },
  { name: '代码自测', status: 'waiting', duration: '4分钟' },
  { name: '代码 Review', status: 'pending' },
  { name: '项目提测', status: 'pending' },
  { name: '代码上线', status: 'pending' },
];

const workflows = [
  {
    id: 3,
    name: '新增 OAuth 登录',
    currentStage: '代码自测',
    status: '进行中' as const,
    tagColor: 'orange' as const,
    createdAt: '2026-04-17',
  },
  {
    id: 2,
    name: '用户资料 API',
    currentStage: '代码上线',
    status: '已完成' as const,
    tagColor: 'green' as const,
    createdAt: '2026-04-15',
  },
  {
    id: 1,
    name: '基础注册与登录',
    currentStage: '代码上线',
    status: '已完成' as const,
    tagColor: 'green' as const,
    createdAt: '2026-04-10',
  },
];

const Pipeline = () => {
  const navigate = useNavigate();

  return (
    <div className="pipeline-page">
      <PageTip
        title="流水线视图："
        description="展示工作流的 7 个阶段。颜色表示状态：灰色 = 待开始，蓝色 = 执行中，黄色 = 待审批，绿色 = 已通过，红色 = 已驳回。点击阶段卡片进入详情。"
      />

      <div className="pipeline-header">
        <div className="pipeline-info">
          <a className="back-link" onClick={() => navigate('/')}>
            <ArrowLeftOutlined /> 返回
          </a>
          <h2>user-center</h2>
          <span className="pipeline-tag tag-blue">工作流 #3：新增 OAuth 登录</span>
        </div>
        <Button type="primary" icon={<PlusOutlined />}>新建工作流</Button>
      </div>

      {/* 7 个阶段卡片 */}
      <div className="pipeline-stages">
        {stages.map((stage, index) => (
          <div key={stage.name} className="stage-item">
            <div
              className={`stage-card ${stage.status}`}
              onClick={() => navigate('/stage-detail')}
            >
              <div className="stage-name">{stage.name}</div>
              <span className={`stage-status ${stage.status}`}>
                {statusLabel[stage.status]}
              </span>
              {stage.duration && (
                <div className="stage-duration">耗时：{stage.duration}</div>
              )}
            </div>
            {index < stages.length - 1 && (
              <span className="stage-arrow">&rarr;</span>
            )}
          </div>
        ))}
      </div>

      {/* 工作流历史 */}
      <div className="workflow-history">
        <h3>工作流历史</h3>
        <table className="workflow-table">
          <thead>
            <tr>
              <th>工作流</th>
              <th>当前阶段</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map((wf) => (
              <tr key={wf.id}>
                <td><strong>#{wf.id} {wf.name}</strong></td>
                <td>{wf.currentStage}</td>
                <td>
                  <span className={`wf-tag tag-${wf.tagColor}`}>{wf.status}</span>
                </td>
                <td>{wf.createdAt}</td>
                <td><a className="wf-action">查看</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Pipeline;
