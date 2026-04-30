import { useEffect, useState } from 'react';
import { Spin, Tag, Collapse, Empty } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  SearchOutlined,
  EditOutlined,
} from '@ant-design/icons';
import type { AgentLog } from '../../types';
import { getAgentLogs } from '../../../../api/workflow';
import './index.css';

const TOOL_META: Record<string, { label: string; icon: React.ReactNode }> = {
  list_directory: { label: '列出目录', icon: <FolderOpenOutlined /> },
  read_file: { label: '读取文件', icon: <FileTextOutlined /> },
  search_code: { label: '搜索代码', icon: <SearchOutlined /> },
  write_file: { label: '写入文件', icon: <EditOutlined /> },
};

interface AgentLogsProps {
  workflowId: string;
  nodeKey: string;
}

export default function AgentLogs({ workflowId, nodeKey }: AgentLogsProps) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const res = await getAgentLogs(workflowId, nodeKey);
        setLogs(res.data || []);
      } catch {
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [workflowId, nodeKey]);

  if (loading)
    return <Spin style={{ display: 'block', margin: '40px auto' }} />;

  if (logs.length === 0) {
    return <Empty description="暂无执行日志" style={{ marginTop: 40 }} />;
  }

  return (
    <div className="agent-logs">
      <div className="agent-logs-summary">
        共 {logs.length} 次工具调用
        <Tag color="green" style={{ marginLeft: 8 }}>
          成功 {logs.filter((l) => l.success).length}
        </Tag>
        <Tag color="red">
          失败 {logs.filter((l) => !l.success).length}
        </Tag>
      </div>

      <Collapse
        size="small"
        items={logs.map((log, index) => {
          const meta = TOOL_META[log.toolName] || {
            label: log.toolName,
            icon: null,
          };
          return {
            key: log.id || index,
            label: (
              <div className="agent-log-header">
                <span className="agent-log-index">#{index + 1}</span>
                {meta.icon}
                <span className="agent-log-tool">{meta.label}</span>
                {log.success ? (
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                ) : (
                  <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                )}
                <span className="agent-log-args">
                  {formatArgs(log.toolName, log.toolArgs)}
                </span>
              </div>
            ),
            children: <pre className="agent-log-result">{log.result}</pre>,
          };
        })}
      />
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
