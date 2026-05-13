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
import type { StageNodeData, NodeExecution } from '../../types';
import { stageNode } from './../stageNode/nodeTypes';
import { stageEdge } from '../stageEdge/edgeTypes';
import {
  getCanvas,
  updateCanvas,
  createNodeConfig,
  updateNodeConfig,
  executeWorkflow,
  getExecutions,
} from '../../../../api/workflow';
import './index.css';
import NodeDrawer from '../nodeDrawer';

interface NodePagesProps {
  workflowId: string;
}

const CORE_NODE_KEYS = ['1', '2', '3'];

const CORE_NODE_DEFINITIONS = [
  {
    id: 'prd-review',
    key: '1',
    name: 'PRD审核',
    backendType: 'PRD审核',
    icon: 'P',
    color: 'blue' as const,
    position: { x: 80, y: 150 },
    meta: 'RAG 增强审核',
    requireApproval: false,
  },
  {
    id: 'requirement-analysis',
    key: '2',
    name: '需求分析',
    backendType: '需求评审',
    icon: 'A',
    color: 'cyan' as const,
    position: { x: 350, y: 150 },
    meta: '输出技术方案',
    requireApproval: false,
  },
  {
    id: 'code-development',
    key: '3',
    name: '代码开发',
    backendType: '代码开发',
    icon: 'C',
    color: 'green' as const,
    position: { x: 620, y: 150 },
    meta: 'Agent 写代码 + Diff',
    requireApproval: true,
  },
];

const CORE_EDGES: Edge[] = [
  {
    id: 'edge-prd-analysis',
    source: 'prd-review',
    target: 'requirement-analysis',
    type: 'stage',
  },
  {
    id: 'edge-analysis-code',
    source: 'requirement-analysis',
    target: 'code-development',
    type: 'stage',
  },
];

const createCoreNodes = (workflowId: string): Node[] =>
  CORE_NODE_DEFINITIONS.map((item) => ({
    id: item.id,
    type: 'stage',
    position: item.position,
    data: {
      name: item.name,
      key: item.key,
      icon: item.icon,
      color: item.color,
      status: 'pending',
      workflowId,
      meta: item.meta,
      backendType: item.backendType,
      ragEnabled: item.key === '1',
      verification: item.key === '3' ? 'pending' : undefined,
      diffCount: item.key === '3' ? 0 : undefined,
    } satisfies StageNodeData,
  }));

const isCoreCanvas = (nodes: Node[]) => {
  if (nodes.length !== CORE_NODE_DEFINITIONS.length) return false;
  const keys = nodes.map((n) => (n.data as StageNodeData).key).sort();
  return keys.every((key, index) => key === CORE_NODE_KEYS[index]);
};

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
        const shouldSeedCoreCanvas = !isCoreCanvas(res.nodes || []);
        const canvasNodes = shouldSeedCoreCanvas ? createCoreNodes(workflowId) : res.nodes || [];
        const canvasEdges = shouldSeedCoreCanvas ? CORE_EDGES : res.edges || [];

        if (shouldSeedCoreCanvas) {
          await Promise.all(
            CORE_NODE_DEFINITIONS.map(async (item) => {
              try {
                await createNodeConfig(workflowId, {
                  nodeKey: item.key,
                  nodeType: item.backendType,
                  aiModel: 'GPT-4o',
                  inputSource: item.key === '1' ? '用户 PRD / 节点 Prompt' : '上一节点输出',
                });
              } catch {
                // 节点配置可能已存在，继续用 update 保证闭环配置正确。
              }
              await updateNodeConfig(workflowId, item.key, {
                requireApproval: item.requireApproval,
              });
            }),
          );
          await updateCanvas(workflowId, { nodes: canvasNodes, edges: canvasEdges });
        }

        // 给每个节点补上 workflowId，供 StageNode 审批按钮使用
        const loadedNodes = canvasNodes.map((n: Node) => ({
          ...n,
          data: { ...n.data, workflowId },
        }));

        // 加载执行状态，同步到节点上
        try {
          const executions = (await getExecutions(workflowId)) as unknown as NodeExecution[];
          if (executions && executions.length > 0) {
            loadedNodes.forEach((n: Node) => {
              const exec = executions.find((e) => e.nodeKey === (n.data as StageNodeData).key);
              if (exec) {
                (n.data as StageNodeData).status = exec.status as StageNodeData['status'];
                (n.data as StageNodeData).summary = exec.summary || '';
              }
            });
          }
        } catch { /* 首次加载可能没有执行记录 */ }

        setNodes(loadedNodes);
        setEdges(canvasEdges);
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

      const { name, icon, color, key, backendType } = JSON.parse(raw);
      if (!CORE_NODE_KEYS.includes(key)) return;
      if (nodes.some((node) => (node.data as StageNodeData).key === key)) {
        message.warning('闭环中该节点已存在');
        return;
      }
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const data: StageNodeData = {
        name,
        key,
        icon,
        color,
        status: 'pending',
        workflowId,
        backendType: backendType || name,
        meta: key === '1' ? 'RAG 增强审核' : key === '2' ? '输出技术方案' : 'Agent 写代码 + Diff',
      };

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
        nodeType: backendType || name,
        aiModel: 'GPT-4o',
      })
        .then(() =>
          updateNodeConfig(workflowId, key, {
            requireApproval: key === '3',
          }),
        )
        .catch(() => {
          updateNodeConfig(workflowId, key, {
            requireApproval: key === '3',
          });
        });
    },
    [nodes, screenToFlowPosition, setNodes, workflowId],
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

  /** 同步执行状态到画布节点 */
  const syncExecutions = useCallback(async () => {
    const executions = (await getExecutions(workflowId)) as unknown as NodeExecution[];
    if (!executions || executions.length === 0) return;
    setNodes((nds) =>
      nds.map((n) => {
        const exec = executions.find((e) => e.nodeKey === (n.data as StageNodeData).key);
        if (exec) {
          return {
            ...n,
            data: { ...n.data, status: exec.status, summary: exec.summary || '' },
          };
        }
        return n;
      }),
    );
  }, [workflowId, setNodes]);

  /** 轮询节点执行状态 */
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 连续无变化计数，用于自动停止轮询 */
  const noChangeCountRef = useRef(0);

  /** 上一次轮询拿到的状态快照，用于检测变化 */
  const lastPollRef = useRef<string>('');

  const startPolling = useCallback(() => {
    // 避免重复启动
    if (pollTimerRef.current) return;
    noChangeCountRef.current = 0;
    pollTimerRef.current = setInterval(async () => {
      try {
        const executions = (await getExecutions(workflowId)) as unknown as NodeExecution[];
        if (!executions || executions.length === 0) return;

        // 用 JSON 快照检测变化（简单可靠）
        const snapshot = JSON.stringify(executions.map((e) => `${e.nodeKey}:${e.status}:${e.summary || ''}`));
        if (snapshot !== lastPollRef.current) {
          lastPollRef.current = snapshot;
          noChangeCountRef.current = 0;
        } else {
          noChangeCountRef.current += 1;
        }

        // 更新节点状态
        setNodes((nds) =>
          nds.map((n) => {
            const exec = executions.find((e) => e.nodeKey === (n.data as StageNodeData).key);
            if (exec) {
              return {
                ...n,
                data: { ...n.data, status: exec.status, summary: exec.summary || '' },
              };
            }
            return n;
          }),
        );

        // 判断是否还有节点在执行中                                                                                                                                                     
          // hasRunning 为 true 说明工作流还在跑，不管有没有变化都不能停
          const hasRunning = executions.some((e) => e.status === 'running');                                                                                                              
                                                                                                                                                                                          
          if (hasRunning) {                                                                                                                                                               
            // 有节点在运行中 → 重置计数器，继续轮询                                                                                                                                      
            // 即使状态快照没变（一直是 running），也不能停                                                                                                                               
            noChangeCountRef.current = 0;                                                                                                                                                 
          }                                                                                                                                                                               
                                                                                                                                                                                          
          // 只有在没有 running 节点的情况下，连续 10 次无变化才停止                                                                                                                      
          // 这样确保：                                                                                                                                                                   
          // - 节点执行中（running）→ 永不停止                                                                                                                                            
          // - 节点执行完（waiting/approved/...）→ 30 秒无变化后停止                                                                                                                      
          if (!hasRunning && noChangeCountRef.current >= 10 && pollTimerRef.current) {                                                                                                    
            clearInterval(pollTimerRef.current);                                                                                                                                          
            pollTimerRef.current = null;                                                                                                                                                  
          }  
      } catch {
        // 轮询请求失败时不停止，等下次重试
      }
    }, 3000);
  }, [workflowId, setNodes]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // 监听 StageNode 审批通过后的事件
  useEffect(() => {
    const handleStartPoll = () => startPolling();
    const handleSync = () => {
      stopPolling();
      syncExecutions();
    };
    window.addEventListener('start-poll-executions', handleStartPoll);
    window.addEventListener('sync-executions', handleSync);
    return () => {
      window.removeEventListener('start-poll-executions', handleStartPoll);
      window.removeEventListener('sync-executions', handleSync);
      stopPolling();
    };
  }, [startPolling, stopPolling, syncExecutions]);

  /** 运行工作流 */
  const run = useCallback(async () => {
    message.info('开始执行三节点闭环');
    startPolling();
    try {
      await executeWorkflow(workflowId);
      message.success('闭环已推进，代码开发节点等待审批');
    } catch {
      message.error('工作流执行失败');
    } finally {
      stopPolling();
      syncExecutions();
    }
  }, [workflowId, startPolling, stopPolling, syncExecutions]);

  // ─── 节点交互 ───

  /** 点击画布节点 → 打开右侧抽屉展示节点详情 */
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.data as StageNodeData)
    setDrawerOpen(true)
  }, [])

  return (
    <div className="pipeline-page">
      <div className="pipeline-header">
        <div className="pipeline-title">
          <Button type="link" onClick={() => navigate('/')}>← 返回</Button>
          <div>
            <h2>PRD 到代码开发闭环</h2>
            <p>PRD 审核 → 需求分析 → 代码开发，前两步自动推进，代码开发后进入 Diff 审批。</p>
          </div>
        </div>
        <div className="btn">
          <Button onClick={saveCanvas}>保存</Button>
          <Button onClick={scaling}>缩放适配</Button>
          <Button disabled={historyIndex <= 0} onClick={cancel}>撤销</Button>
          <Button disabled={historyIndex >= history.length - 1} onClick={recover}>恢复</Button>
          <Button type="primary" onClick={run}>运行闭环</Button>
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
