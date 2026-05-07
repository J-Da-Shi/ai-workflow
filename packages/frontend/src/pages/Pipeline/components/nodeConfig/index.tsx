import { useState } from 'react';
import { Switch, Collapse, message } from 'antd';
import type { NodeConfig, PromptLayers } from '../../types';
import { updateNodeConfig } from '../../../../api/workflow';
import './index.css';

interface ConfigTabProps {
  config: NodeConfig;
  workflowId: string;
  nodeKey: string;
}

const LAYER_ITEMS: {
  key: keyof Omit<PromptLayers, 'activeLayer'>;
  label: string;
  note: string;
  level: 1 | 2 | 3;
}[] = [
    { key: 'node', label: 'Layer 3：节点级自定义', note: '仅对当前节点生效', level: 3 },
    { key: 'project', label: 'Layer 2：项目级模板', note: '对本项目所有节点生效', level: 2 },
    { key: 'system', label: 'Layer 1：系统内置默认', note: '开箱即用的通用最佳实践', level: 1 },
  ];

export default function ConfigTab({ config, workflowId, nodeKey }: ConfigTabProps) {
  const [activeLayer, setActiveLayer] = useState(config.promptLayers?.activeLayer);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [layers, setLayers] = useState<PromptLayers>({ ...config.promptLayers });
  const [editText, setEditText] = useState('');

  const handleStartEdit = (key: string, content: string | null) => {
    setEditingKey(key);
    setEditText(content ?? '');
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditText('');
  };

  const handleSaveEdit = async (key: keyof Omit<PromptLayers, 'activeLayer'>) => {
    const val = editText.trim();
    const newLayers = { ...layers, [key]: val || null, activeLayer };
    setLayers(newLayers);
    setEditingKey(null);
    setEditText('');
    try {
      await updateNodeConfig(workflowId, nodeKey, { promptLayers: newLayers });
      message.success('Prompt 已保存');
    } catch {
      message.error('保存失败');
    }
  };

  return (
    <div className="config-tab">
      <div className="config-body">
        {/* Prompt 编辑器 */}
        <div className="config-section">
          <div className="config-section-title">Prompt 模板</div>
          <div className="prompt-layers">
            {LAYER_ITEMS.map((item) => {
              const isSelected = item.level === activeLayer;
              const content = layers[item.key];
              const isEditing = editingKey === item.key;

              return (
                <div
                  key={item.key}
                  className={`prompt-layer${isSelected ? ' selected' : ''}`}
                >
                  <div
                    className="prompt-layer-header"
                    onClick={() => {
                      setActiveLayer(item.level);
                      updateNodeConfig(workflowId, nodeKey, {
                        promptLayers: { ...layers, activeLayer: item.level },
                      });
                    }}
                  >
                    <div className="prompt-layer-radio">
                      <input
                        type="radio"
                        name="prompt-layer"
                        checked={isSelected}
                        onChange={() => {
                          setActiveLayer(item.level);
                          updateNodeConfig(workflowId, nodeKey, {
                            promptLayers: { ...layers, activeLayer: item.level },
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="prompt-layer-title">
                        {item.label}
                        <span className={`prompt-layer-tag ${isSelected ? 'active' : 'inactive'}`}>
                          {isSelected ? '当前使用' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="prompt-layer-actions">
                      <span
                        className="prompt-edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isEditing) {
                            handleCancelEdit();
                          } else {
                            handleStartEdit(item.key, content);
                          }
                        }}
                      >
                        编辑
                      </span>
                      <span className="prompt-layer-note">{item.note}</span>
                    </div>
                  </div>

                  {!isEditing && (
                    <div className={`prompt-layer-body${!content ? ' empty' : ''}`}>
                      {content
                        ? content.split('\n').map((line, i) => (
                          <span key={i}>
                            {i > 0 && <br />}
                            {line}
                          </span>
                        ))
                        : '点击「编辑」添加自定义 Prompt'}
                    </div>
                  )}

                  {isEditing && (
                    <div className="prompt-layer-editor">
                      <textarea
                        className="prompt-layer-textarea"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        autoFocus
                      />
                      <div className="prompt-layer-edit-actions">
                        <button className="cancel" onClick={handleCancelEdit}>
                          取消
                        </button>
                        <button
                          className="save"
                          onClick={() => handleSaveEdit(item.key)}
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 高级设置 */}
        <Collapse
          ghost
          size="small"
          items={[{
            key: 'advanced',
            label: '高级设置',
            children: (
              <div className="advanced-settings">
                <div className="config-row">
                  <span className="config-label">AI 模型</span>
                  <span className="config-value">{config.aiModel || '-'}</span>
                </div>
                <div className="config-row">
                  <span className="config-label">超时设置</span>
                  <span className="config-value">{config.timeout || '-'}</span>
                </div>
                <div className="config-row">
                  <span className="config-label">输入来源</span>
                  <span className="config-value">{config.inputSource || '-'}</span>
                </div>
                <div className="config-row">
                  <span className="config-label">需要审批</span>
                  <span className="config-value">
                    <Switch
                      size="small"
                      defaultChecked={config.requireApproval !== false}
                      onChange={(checked) => {
                        updateNodeConfig(workflowId, nodeKey, { requireApproval: checked });
                      }}
                    />
                  </span>
                </div>
              </div>
            ),
          }]}
        />
      </div>
    </div>
  );
}
