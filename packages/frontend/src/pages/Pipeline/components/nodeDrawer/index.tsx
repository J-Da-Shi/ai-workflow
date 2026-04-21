import { useEffect, useState } from 'react';
import { Tabs, Drawer, Spin } from 'antd';
import type { NodeDrawerProps, NodeConfig } from '../../types';
import { getNodeConfig } from '../../../../api/workflow';
import ConfigTab from './nodeConfig';
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

  if (!node) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      styles={{ wrapper: { width: 520 } }}
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
          defaultActiveKey="config"
          items={[
            {
              key: 'config',
              label: '节点配置',
              children: config ? (
                <ConfigTab config={config} workflowId={workflowId} nodeKey={node.key} />
              ) : (
                <div>暂无配置</div>
              ),
            },
            {
              key: 'chat',
              label: 'AI 对话',
              children: <div>对话内容占位</div>,
            },
            {
              key: 'logs',
              label: '执行日志',
              children: <div>日志内容占位</div>,
            },
          ]}
        />
      )}
    </Drawer>
  );
}
