import { BaseEdge, getSmoothStepPath, useNodes } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import type { StageNodeData, NodeStatus } from '../../types';

// 边的状态类型，用于决定颜色和样式
type EdgeStatus = 'approved' | 'waiting' | 'pending';

/**
 * 根据源节点和目标节点的状态，计算这条边应该显示什么状态
 * - 两端都通过 → 边也是 approved（绿色实线）
 * - 目标节点正在等待或运行中 → 边是 waiting（黄色虚线）
 * - 其他情况 → 边是 pending（灰色实线）
 */
const getEdgeStatus = (
  sourceStatus: NodeStatus,
  targetStatus: NodeStatus,
): EdgeStatus => {
  if (sourceStatus === 'approved' && targetStatus === 'approved')
    return 'approved';
  if (targetStatus === 'waiting' || targetStatus === 'running')
    return 'waiting';
  return 'pending';
};

// 边状态 → 颜色映射
const COLOR: Record<EdgeStatus, string> = {
  approved: '#52c41a', // 绿色：已通过
  waiting: '#faad14', // 黄色：等待中
  pending: '#c0c0c0', // 灰色：未开始
};

/**
 * 自定义边组件
 * ReactFlow 会自动传入 EdgeProps，包含了边的所有信息：
 * - id: 边的唯一标识
 * - sourceX/Y, targetX/Y: 源和目标的坐标（ReactFlow 自动计算）
 * - sourcePosition/targetPosition: 连接点方向（Left/Right/Top/Bottom）
 * - source/target: 源节点和目标节点的 id
 *
 * 这个组件的作用是：根据两端节点的流程状态，动态改变连线的颜色和样式
 */
export function StageEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  source,
  target,
}: EdgeProps) {
  // useNodes() 获取画布上所有节点，用来读取源/目标节点的 status
  const nodes = useNodes();

  // 通过 id 找到源节点和目标节点
  const sourceNode = nodes.find((n) => n.id === source);
  const targetNode = nodes.find((n) => n.id === target); // 注意是 === 比较，不是 = 赋值

  // 读取节点 data 中的 status，默认 pending
  const sourceStatus =
    (sourceNode?.data as StageNodeData)?.status || 'pending';
  const targetStatus =
    (targetNode?.data as StageNodeData)?.status || 'pending';

  // 根据两端状态计算边的状态
  const edgeStatus = getEdgeStatus(sourceStatus, targetStatus);
  const color = COLOR[edgeStatus];
  // waiting 状态显示虚线，其他显示实线
  const isDashed = edgeStatus === 'waiting';

  // getSmoothStepPath 生成一条带圆角的折线路径（SVG path 字符串）
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: color,
        strokeWidth: 2,
        strokeDasharray: isDashed ? '6 4' : undefined,
        animation: isDashed ? 'edge-flow 0.6s linear infinite' : undefined,
      }}
    />
  );
}
