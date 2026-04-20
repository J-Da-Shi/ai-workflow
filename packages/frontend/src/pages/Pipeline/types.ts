export type NodeStatus = 'pending' | 'running' | 'waiting' | 'approved' | 'rejected';

export type NodeColor = 'blue' | 'green' | 'cyan' | 'orange' | 'red' | 'purple';

// 画布上节点的 data
export interface StageNodeData extends Record<string, unknown> {
  name: string;
  key: string;
  icon: string;
  color: NodeColor;
  status: NodeStatus;
  meta?: string;
}

// 节点面板中的可拖拽项（不含运行时状态）
export type NodeItem = Pick<StageNodeData, 'name' | 'key' | 'icon' | 'color'>;

// 节点面板分组
export interface NodeCategory {
  name: string;
  key: string;
  children: NodeItem[];
}
