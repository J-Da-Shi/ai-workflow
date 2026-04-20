import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import type { StageNodeData } from '../../types';
import './index.css';

type StageNode = Node<StageNodeData, 'stage'>;

const STATUS_LABEL: Record<string, string> = {
  pending: '待开始',
  running: '运行中',
  waiting: '待审批',
  approved: '已通过',
  rejected: '已驳回',
};

const COLOR_MAP: Record<string, string> = {
  blue: '#1890ff',
  green: '#52c41a',
  cyan: '#13c2c2',
  orange: '#fa8c16',
  red: '#ff4d4f',
  purple: '#722ed1',
};

export function StageNode({ data }: NodeProps<StageNode>) {

  return (
    <div className={`stage-node ${data.status}`}>
      <Handle type="target" position={Position.Left} />
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
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
