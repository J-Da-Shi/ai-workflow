import PageTip from '../../../../components/PageTip';
import type { NodeCategory, NodeItem } from '../../types';
import './index.css';

const COLOR_MAP: Record<string, string> = {
  blue: '#1890ff',
  green: '#52c41a',
  cyan: '#13c2c2',
  orange: '#fa8c16',
  red: '#ff4d4f',
  purple: '#722ed1',
};

const CORE_CATEGORIES: NodeCategory[] = [
  {
    name: '三节点闭环',
    key: 'coreLoop',
    children: [
      { name: 'PRD审核', key: '1', icon: 'P', color: 'blue' },
      { name: '需求分析', key: '2', icon: 'A', color: 'cyan' },
      { name: '代码开发', key: '3', icon: 'C', color: 'green' },
    ],
  },
];

export default function NodePanel() {
  const onDragStart = (e: React.DragEvent, node: NodeItem) => {
    e.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({
        name: node.name,
        icon: node.icon,
        color: node.color,
        key: node.key,
        backendType: node.key === '2' ? '需求评审' : node.name,
      }),
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="panel-container">
      <div className="panel-header">节点面板</div>
      <div className="panel-menus">
        <PageTip
          title="闭环节点："
          description="当前只保留 PRD 审核、需求分析、代码开发三步。"
        />
        {CORE_CATEGORIES.map((group) => (
          <div className="panel-group" key={group.key}>
            <div className="panel-group-title">{group.name}</div>
            <div className="panel-group-list">
              {group.children.map((node) => (
                <div
                  className="panel-node-item"
                  key={node.key}
                  draggable
                  onDragStart={(e) => onDragStart(e, node)}
                >
                  <div
                    className="panel-node-icon"
                    style={{ background: COLOR_MAP[node.color] }}
                  >
                    {node.icon}
                  </div>
                  <span className="panel-node-name">{node.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
