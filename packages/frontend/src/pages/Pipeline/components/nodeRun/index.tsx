import { useEffect, useRef, useState } from 'react';
import { Button, Spin, Empty, message } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  SearchOutlined,
  EditOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import ReactDiffViewer from 'react-diff-viewer-continued';
import type { AgentLog } from '../../types';
import { getAgentLogs, approveNode, rejectNode, getNodeDiff } from '../../../../api/workflow';
import './index.css';

const TOOL_META: Record<string, { label: string; icon: React.ReactNode }> = {
  list_directory: { label: '列出目录', icon: <FolderOpenOutlined /> },
  read_file: { label: '读取文件', icon: <FileTextOutlined /> },
  search_code: { label: '搜索代码', icon: <SearchOutlined /> },
  write_file: { label: '写入文件', icon: <EditOutlined /> },
};

interface NodeRunProps {
  workflowId: string;
  nodeKey: string;
  onExecute: () => void;
  executing: boolean;
}

interface DiffItem {
  file: string;
  type: 'added' | 'modified' | 'deleted';
  before: string;
  after: string;
}

export default function NodeRun({ workflowId, nodeKey, onExecute, executing }: NodeRunProps) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [thinkingIteration, setThinkingIteration] = useState(0);
  const [finalReply, setFinalReply] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const timelineRef = useRef<HTMLDivElement>(null);

  // Diff 审批状态
  const [diffs, setDiffs] = useState<DiffItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  // 加载历史日志
  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const res = await getAgentLogs(workflowId, nodeKey);
        setLogs(Array.isArray(res) ? res : (res as any).data || []);
      } catch {
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [workflowId, nodeKey]);

  // 监听 SSE 实时事件
  useEffect(() => {
    const handler = (e: Event) => {
      const { detail } = e as CustomEvent;
      if (!detail) return;

      switch (detail.type) {
        case 'thinking':
          setThinkingIteration(detail.data.iteration || 0);
          break;
        case 'tool_done':
          setThinkingIteration(0);
          setLogs((prev) => [
            ...prev,
            {
              id: `live-${Date.now()}-${Math.random()}`,
              toolName: detail.data.toolName,
              toolArgs: detail.data.toolArgs,
              result: detail.data.result,
              success: detail.data.success,
              phase: null,
              createdAt: new Date().toISOString(),
            },
          ]);
          break;
        case 'done':
          setThinkingIteration(0);
          setFinalReply(detail.data.reply || '');
          break;
        case 'error':
          setThinkingIteration(0);
          break;
      }
    };

    window.addEventListener('agent-log-event', handler);
    return () => window.removeEventListener('agent-log-event', handler);
  }, []);

  // 执行完成后自动加载 Diff
  useEffect(() => {
    if (finalReply) {
      loadDiff();
    }
  }, [finalReply]);

  // 组件挂载时如果已有历史日志，也尝试加载 diff
  useEffect(() => {
    if (logs.length > 0 && !finalReply) {
      loadDiff();
    }
  }, [logs.length]);

  const loadDiff = async () => {
    setDiffLoading(true);
    try {
      const res = await getNodeDiff(workflowId, nodeKey);
      const data = Array.isArray((res as any).changes) ? (res as any).changes : [];
      setDiffs(data);
      if (data.length > 0) {
        setSelectedFile(data[0].file);
      }
    } catch {
      setDiffs([]);
    } finally {
      setDiffLoading(false);
    }
  };

  // 自动滚动到底部
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [logs, thinkingIteration, finalReply]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [gitPrUrl, setGitPrUrl] = useState('');

  const handleApprove = async () => {
    try {
      const res = await approveNode(workflowId, nodeKey);
      message.success('已通过');
      // 如果有 Git PR 链接，展示
      const data = res as any;
      if (data?.gitPrUrl) {
        setGitPrUrl(data.gitPrUrl);
        message.info('PR 已创建');
      }
      window.dispatchEvent(new Event('sync-executions'));
    } catch {
      message.error('操作失败');
    }
  };

  const handleReject = async () => {
    try {
      await rejectNode(workflowId, nodeKey);
      message.success('已驳回');
      window.dispatchEvent(new Event('sync-executions'));
    } catch {
      message.error('操作失败');
    }
  };

  if (loading) {
    return <Spin style={{ display: 'block', margin: '40px auto' }} />;
  }

  const selectedDiff = diffs.find((d) => d.file === selectedFile);

  return (
    <div className="node-run">
      <div className="run-timeline" ref={timelineRef}>
        {logs.length === 0 && thinkingIteration === 0 && !finalReply && (
          <Empty description="点击「执行节点」开始运行" style={{ marginTop: 60 }} />
        )}

        {logs.map((log) => {
          const meta = TOOL_META[log.toolName] || { label: log.toolName, icon: null };
          const isExpanded = expandedIds.has(log.id);

          return (
            <div key={log.id} className="timeline-item">
              <div className="timeline-dot">
                {log.success ? (
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                ) : (
                  <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                )}
              </div>
              <div className="timeline-content">
                <div
                  className="timeline-header"
                  onClick={() => toggleExpand(log.id)}
                >
                  {meta.icon}
                  <span className="timeline-tool">{meta.label}</span>
                  <span className="timeline-args">
                    {formatArgs(log.toolName, log.toolArgs)}
                  </span>
                </div>
                {isExpanded && (
                  <pre className="timeline-result">{log.result}</pre>
                )}
              </div>
            </div>
          );
        })}

        {thinkingIteration > 0 && (
          <div className="timeline-item thinking">
            <div className="timeline-dot">
              <LoadingOutlined style={{ color: '#1890ff' }} />
            </div>
            <div className="timeline-content">
              <span className="thinking-text">
                AI 正在思考（第 {thinkingIteration} 轮）...
              </span>
            </div>
          </div>
        )}

        {finalReply && (
          <div className="timeline-item done">
            <div className="timeline-dot">
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
            </div>
            <div className="timeline-content">
              <div className="final-reply">
                <ReactMarkdown>{finalReply}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Diff 审批区域 */}
      {diffs.length > 0 && (
        <div className="diff-section">
          <div className="diff-header">
            文件变更（{diffs.length} 个文件）
          </div>
          <div className="diff-layout">
            <div className="diff-file-list">
              {diffs.map((d) => (
                <div
                  key={d.file}
                  className={`diff-file-item ${d.type} ${selectedFile === d.file ? 'active' : ''}`}
                  onClick={() => setSelectedFile(d.file)}
                >
                  <span className={`diff-file-badge ${d.type}`}>
                    {d.type === 'added' ? '+' : d.type === 'modified' ? '~' : '-'}
                  </span>
                  <span className="diff-file-name">{d.file}</span>
                </div>
              ))}
            </div>
            <div className="diff-content">
              {diffLoading ? (
                <Spin style={{ display: 'block', margin: '40px auto' }} />
              ) : selectedDiff ? (
                <ReactDiffViewer
                  oldValue={selectedDiff.before}
                  newValue={selectedDiff.after}
                  splitView={false}
                  useDarkTheme={false}
                  leftTitle="修改前"
                  rightTitle="修改后"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Git PR 链接 */}
      {gitPrUrl && (
        <div className="git-pr-link">
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <span>PR 已创建：</span>
          <a href={gitPrUrl} target="_blank" rel="noopener noreferrer">{gitPrUrl}</a>
        </div>
      )}

      <div className="run-actions">
        <Button
          onClick={onExecute}
          loading={executing}
          style={{ flex: 1 }}
        >
          执行节点
        </Button>
        <Button
          type="primary"
          onClick={handleApprove}
          disabled={executing}
          style={{ flex: 1 }}
        >
          通过
        </Button>
        <Button
          danger
          onClick={handleReject}
          disabled={executing}
          style={{ flex: 1 }}
        >
          驳回
        </Button>
      </div>
    </div>
  );
}

function formatArgs(toolName: string, args: Record<string, any>): string {
  switch (toolName) {
    case 'list_directory':
      return args.path || '.';
    case 'read_file':
      return args.path || '';
    case 'search_code':
      return `"${args.pattern || ''}"`;
    case 'write_file':
      return args.path || '';
    default:
      return JSON.stringify(args).slice(0, 50);
  }
}
