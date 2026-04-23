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
  summary?: string;
  workflowId?: string;
}

// 节点面板中的可拖拽项（不含运行时状态）
export type NodeItem = Pick<StageNodeData, 'name' | 'key' | 'icon' | 'color'>;

// 节点面板分组
export interface NodeCategory {
  name: string;
  key: string;
  children: NodeItem[];
}

// Prompt 三层结构
export interface PromptLayers {
  system: string;
  project: string | null;
  node: string | null;
  activeLayer: 1 | 2 | 3;
}

// 节点配置
export interface NodeConfig {
  nodeType: string;
  aiModel: string;
  timeout: string;
  inputSource: string;
  tokenUsage: string;
  duration: string;
  requireApproval: boolean;
  promptLayers: PromptLayers;
  inputData: { source: string; files: string[] };
  outputData: { summary: string; files: string[] };
}

// 节点执行记录
export interface NodeExecution {
  id: string;
  workflowId: string;
  nodeKey: string;
  status: NodeStatus;
  input: string | null;
  output: string | null;
  summary: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

// 抽屉
export interface NodeDrawerProps {
  open: boolean;
  node: StageNodeData | null;
  workflowId: string;
  onClose: () => void;
}