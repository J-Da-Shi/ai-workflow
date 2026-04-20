import { Tabs, Drawer } from 'antd';
import type { NodeDrawerProps } from '../../types';
import './index.css'

const STATUS_LABEL: Record<string, string> = {
    pending: '待开始',
    running: '运行中',
    waiting: '待审批',
    approved: '已通过',
    rejected: '已驳回',
}

const COLOR_MAP: Record<string, string> = {
    blue: '#1890ff',
    green: '#52c41a',
    cyan: '#13c2c2',
    orange: '#fa8c16',
    red: '#ff4d4f',
    purple: '#722ed1',
}

export default function NodeDrawer({ open, node, onClose }: NodeDrawerProps) {
    if (!node) return null;
    return (
        <Drawer
            open={open}
            onClose={onClose}
            width={520}
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
            <Tabs
                defaultActiveKey="config"
                items={[
                    { key: 'config', label: '节点配置', children: <div>配置内容占位</div> },
                    { key: 'chat', label: 'AI 对话', children: <div>对话内容占位</div> },
                    { key: 'logs', label: '执行日志', children: <div>日志内容占位</div> },
                ]}
            />
        </Drawer>
    )
}
