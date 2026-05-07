import { useEffect, useState } from 'react';
import { Tabs, Drawer, Spin, message } from 'antd';
import type { NodeDrawerProps, NodeConfig } from '../../types';
import { getNodeConfig } from '../../../../api/workflow';
import ConfigTab from '../nodeConfig';
import NodeRun from '../nodeRun';
import './index.css';

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

export default function NodeDrawer({
  open,
  node,
  workflowId,
  onClose,
}: NodeDrawerProps) {
  const [config, setConfig] = useState<NodeConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('config');
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    if (open && node) {
      const fetchConfig = async () => {
        setLoading(true);
        try {
          const res = (await getNodeConfig(
            workflowId,
            node.key,
          )) as unknown as NodeConfig;
          setConfig(res);
        } catch {
          setConfig(null);
        } finally {
          setLoading(false);
        }
      };
      fetchConfig();
    }
  }, [open, node, workflowId]);

  const handleExecute = async () => {
    if (!node) return;
    setExecuting(true);
    setActiveTab('run');
    window.dispatchEvent(new Event('start-poll-executions'));

    try {
      const res = await fetch(`/api/workflows/${workflowId}/nodes/${node.key}/execute-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const event = JSON.parse(data);
            window.dispatchEvent(
              new CustomEvent('agent-log-event', { detail: event }),
            );
          } catch {
            // ignore
          }
        }
      }

      message.success('节点执行完成');
    } catch {
      message.error('节点执行失败');
    } finally {
      setExecuting(false);
      window.dispatchEvent(new Event('sync-executions'));
    }
  };

  if (!node) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      styles={{ wrapper: { width: 820 } }}
      closable={false}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="drawer-node-icon"
            style={{ background: COLOR_MAP[node.color] }}
          >
            {node.icon}
          </span>
          {node.name}
          <span className={`drawer-node-status ${node.status}`}>
            {STATUS_LABEL[node.status]}
          </span>
        </div>
      }
    >
      {loading ? (
        <Spin />
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          destroyInactiveTabPane={false}
          items={[
            {
              key: 'config',
              label: '配置',
              children: config ? (
                <ConfigTab config={config} workflowId={workflowId} nodeKey={node.key} />
              ) : (
                <div>暂无配置</div>
              ),
            },
            {
              key: 'run',
              label: '运行',
              children: (
                <NodeRun
                  workflowId={workflowId}
                  nodeKey={node.key}
                  onExecute={handleExecute}
                  executing={executing}
                />
              ),
            },
          ]}
        />
      )}
    </Drawer>
  );
}
