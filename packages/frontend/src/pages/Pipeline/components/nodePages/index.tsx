import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Background,
  Controls,
  useReactFlow,
} from '@xyflow/react';
import type { Node, Edge, NodeChange, EdgeChange, Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, message } from 'antd';
import type { StageNodeData } from '../../types';
import { stageNode } from './../stageNode/nodeTypes';
import { stageEdge } from '../stageEdge/edgeTypes';
import { getCanvas, updateCanvas, createNodeConfig } from '../../../../api/workflow';
import './index.css';
import NodeDrawer from '../nodeDrawer';

interface NodePagesProps {
  workflowId: string;
}

export default function NodePages({ workflowId }: NodePagesProps) {
  // ─── 画布状态 ───
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // ─── 撤销/重做历史栈 ───
  const [history, setHistory] = useState<{ nodes: Node[], edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // ─── 抽屉状态 ───
  const [selectedNode, setSelectedNode] = useState<StageNodeData | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // ─── 加载画布数据 ───
  useEffect(() => {
    const loadCanvas = async () => {
      const res = (await getCanvas(workflowId)) as unknown as {
        nodes: Node[];
        edges: Edge[];
      };
      if (res) {
        setNodes(res.nodes || []);
        setEdges(res.edges || []);
      }
    };
    loadCanvas();
  }, [workflowId]);

  // ─── 保存画布 ───
  const saveCanvas = useCallback(async () => {
    await updateCanvas(workflowId, { nodes, edges });
    message.success('画布已保存');
  }, [workflowId, nodes, edges]);

  // 标记当前操作是否为撤销/重做，避免将回退操作本身也记入历史
  const isUndoRedo = useRef(false);

  /**
   * 历史快照记录
   * nodes 或 edges 变化后，延迟 300ms 写入历史栈（防抖），
   * 如果是撤销/重做触发的变化则跳过记录。
   */
  useEffect(() => {
    if (isUndoRedo.current) {
      isUndoRedo.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setHistory((h) => [...h.slice(0, historyIndex + 1), { nodes, edges }]);
      setHistoryIndex((i) => i + 1);
    }, 300)
    return () => clearTimeout(timer);
  }, [nodes, edges])

  const navigate = useNavigate();
  const { screenToFlowPosition, fitView } = useReactFlow();

  // ─── ReactFlow 拖放处理 ───

  /** 允许拖放：阻止默认行为并设置 dropEffect */
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  /** 放置节点：从 dataTransfer 读取节点信息，转换屏幕坐标为画布坐标，创建新节点 */
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/reactflow');
      if (!raw) return;

      const { name, icon, color, key } = JSON.parse(raw);
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const data: StageNodeData = { name, key, icon, color, status: 'pending' };

      const newNode: Node = {
        id: `node_${Date.now()}`,
        type: 'stage',
        position,
        data,
      };

      setNodes((nds) => [...nds, newNode]);

      // 在后端创建默认节点配置
      createNodeConfig(workflowId, {
        nodeKey: key,
        nodeType: name,
        aiModel: 'GPT-4o',
      });
    },
    [screenToFlowPosition, setNodes, workflowId],
  );

  // ─── ReactFlow 核心事件回调（标准模式） ───

  /** 节点变化（拖动、选中、删除等）→ 应用到 nodes 状态 */
  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        return next;
      }),
    [],
  );

  /** 边变化（选中、删除等）→ 应用到 edges 状态 */
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        return next;
      }),
    [],
  );

  /** 两个节点连线 → 新增 edge */
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) => {
        const next = addEdge(params, eds);
        return next;
      }),
    [],
  );

  // ─── 工具栏操作 ───

  /** 缩放适配：将画布视口调整为刚好容纳所有节点 */
  const scaling = () => {
    return fitView({ padding: 10 })
  };

  /** 撤销：回退到历史栈中的上一步快照 */
  const cancel = useCallback(() => {
    if (historyIndex <= 0) return;
    isUndoRedo.current = true;
    const prev = history[historyIndex - 1];
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setHistoryIndex((i) => i - 1);
  }, [history, historyIndex])

  /** 恢复（重做）：前进到历史栈中的下一步快照 */
  const recover = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    isUndoRedo.current = true;
    const next = history[historyIndex + 1];
    setNodes(next.nodes);
    setEdges(next.edges);
    setHistoryIndex((i) => i + 1);
  }, [history, historyIndex])

  /** 运行工作流（待实现） */
  const run = () => { };

  // ─── 节点交互 ───

  /** 点击画布节点 → 打开右侧抽屉展示节点详情 */
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.data as StageNodeData)
    setDrawerOpen(true)
  }, [])

  return (
    <div className="pipeline-page">
      <div className="pipeline-header">
        <div className="back">
          <Button type="link" onClick={() => navigate('/')}>← 返回</Button>
        </div>
        <div className="btn">
          <Button onClick={saveCanvas}>保存</Button>
          <Button onClick={scaling}>缩放适配</Button>
          <Button disabled={historyIndex <= 0} onClick={cancel}>撤销</Button>
          <Button disabled={historyIndex >= history.length - 1} onClick={recover}>恢复</Button>
          <Button type="primary" onClick={run}>运行工作流</Button>
        </div>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={stageNode}
        edgeTypes={stageEdge}
        defaultEdgeOptions={{ type: 'stage' }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeClick={onNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
      <NodeDrawer
        open={drawerOpen}
        node={selectedNode}
        workflowId={workflowId}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
