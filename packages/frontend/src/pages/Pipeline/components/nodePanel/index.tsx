import { useEffect, useState } from 'react';
import PageTip from '../../../../components/PageTip';
import { getNodeCategories } from '../../../../api/workflow';
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

export default function NodePanel() {
  const [nodeCategories, setNodeCategories] = useState<NodeCategory[]>([]);

  useEffect(() => {
    const fetchCategories = async () => {
      const res = (await getNodeCategories()) as unknown as NodeCategory[];
      setNodeCategories(res);
    };
    fetchCategories();
  }, []);

  const onDragStart = (e: React.DragEvent, node: NodeItem) => {
    e.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({
        name: node.name,
        icon: node.icon,
        color: node.color,
        key: node.key,
      }),
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="panel-container">
      <div className="panel-header">节点面板</div>
      <div className="panel-menus">
        <PageTip
          title="拖拽节点："
          description="拖拽节点到右侧画布来构建你的工作流"
        />
        {nodeCategories.map((group) => (
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
