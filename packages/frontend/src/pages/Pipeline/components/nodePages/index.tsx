import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
} from '@xyflow/react';
import type { Node, Edge, NodeChange, EdgeChange, Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from 'antd';
import type { StageNodeData } from '../../types';
import { stageNode } from './../stageNode/nodeTypes';
import { stageEdge } from '../stageEdge/edgeTypes';
import './index.css';
import NodeDrawer from '../nodeDrawer';

export default function NodePages() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [history, setHistory] = useState<{ nodes: Node[], edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [selectedNode, setSelectedNode] = useState<StageNodeData | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isUndoRedo = useRef(false); // 标记当前是否在撤销/重做，避免重复记录

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

  // // 每次节点或边变化时，推入历史记录
  // const pushHistory = useCallback((newNodes: Node[], newEdges: Edge[]) => {


  // }, [historyIndex]);

  // 允许放置
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  // 放置时创建新节点
  const onDrop = useCallback((e: React.DragEvent) => {
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

    setNodes((nds) => {
      const next = [...nds, newNode];
      return next;
    });
  }, [screenToFlowPosition, setNodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        return next;
      }),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        return next;
      }),
    [],
  );
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) => {
        const next = addEdge(params, eds);
        return next;
      }),
    [],
  );

  const scaling = () => {
    return fitView({ padding: 10 })
  };
  // 撤销
  const cancel = useCallback(() => {
    if (historyIndex <= 0) return;
    isUndoRedo.current = true;
    const prev = history[historyIndex - 1];
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setHistoryIndex((i) => i - 1);
  }, [history, historyIndex])

  const recover = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    isUndoRedo.current = true;
    const next = history[historyIndex + 1];
    setNodes(next.nodes);
    setEdges(next.edges);
    setHistoryIndex((i) => i + 1);
  }, [history, historyIndex])

  const run = () => { };

  const onNodeClick = useCallback((_: any, node: Node) => {
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
        <MiniMap />
      </ReactFlow>
      <NodeDrawer
        open={drawerOpen}
        node={selectedNode}
        onClose={() => setDrawerOpen(flase)}
      />
    </div>
  );
}
