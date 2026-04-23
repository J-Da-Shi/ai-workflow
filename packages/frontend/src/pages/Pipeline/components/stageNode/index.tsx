import { useState } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import type { StageNodeData } from '../../types';
import { approveNode, rejectNode, deleteExecution } from '../../../../api/workflow';
import './index.css';

type StageNode = Node<StageNodeData, 'stage'>;

const STATUS_LABEL: Record<string, string> = {
  pending: '待开始',
  running: '运行中',
  waiting: '待审批',
  approved: '已通过',
  rejected: '已驳回',
  failed: '执行失败',
};

const COLOR_MAP: Record<string, string> = {
  blue: '#1890ff',
  green: '#52c41a',
  cyan: '#13c2c2',
  orange: '#fa8c16',
  red: '#ff4d4f',
  purple: '#722ed1',
};

export function StageNode({ id, data }: NodeProps<StageNode>) {
  const { setNodes, setEdges } = useReactFlow();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    // 删除节点时清除对应的执行记录
    if (data.workflowId) {
      deleteExecution(data.workflowId as string, data.key);
    }
  };

  // 审批通过
  const handleApprove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setApproving(true);

    // 立刻把当前节点改成 approved，让用户马上看到反馈
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, status: 'approved', summary: '' } } : n,
      ),
    );

    // 通知 nodePages 开始轮询后续节点状态
    window.dispatchEvent(new CustomEvent('start-poll-executions'));

    // 发起审批请求，不阻塞 UI — 后续节点状态由轮询驱动更新
    approveNode(data.workflowId as string, data.key)
      .catch(() => {
        // 审批失败时回退状态
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, status: 'waiting' } } : n,
          ),
        );
      })
      .finally(() => setApproving(false));
  };

  // 审批驳回
  const handleReject = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRejecting(true);
    rejectNode(data.workflowId as string, data.key)
      .then(() => {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, status: 'rejected', summary: '' } } : n,
          ),
        );
      })
      .finally(() => setRejecting(false));
  };

  return (
    <div className={`stage-node ${data.status}`}>
      <Handle type="target" position={Position.Left} />
      <button className="stage-node-delete" onClick={handleDelete}>×</button>
      <div className="stage-node-header">
        <div
          className="stage-node-icon"
          style={{ background: COLOR_MAP[data.color] }}
        >
          {data.icon}
        </div>
        <span className="stage-node-title">{data.name}</span>
      </div>
      <div className="stage-node-body">
        <span className={`stage-node-status ${data.status}`}>
          {STATUS_LABEL[data.status]}
        </span>
        {data.meta && <div className="stage-node-meta">{data.meta}</div>}
      </div>
      {/* waiting 状态：显示摘要 + 审批按钮 */}
      {data.status === 'waiting' && (
        <div className="stage-node-approval">
          {data.summary && (
            <div className="stage-node-summary">{data.summary}</div>
          )}
          <div className="stage-node-approval-actions">
            <button className="approve-btn" onClick={handleApprove} disabled={approving || rejecting}>
              {approving ? '处理中...' : '通过'}
            </button>
            <button className="reject-btn" onClick={handleReject} disabled={approving || rejecting}>
              {rejecting ? '处理中...' : '驳回'}
            </button>
          </div>
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
