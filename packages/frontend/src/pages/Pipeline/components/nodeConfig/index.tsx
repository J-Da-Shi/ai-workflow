import { useState } from 'react';
import { Button, message } from 'antd';
import type { NodeConfig, PromptLayers } from '../../types';
import { updateNodeConfig } from '../../../../api/workflow';
import './index.css';

interface ConfigTabProps {
  config: NodeConfig;
  workflowId: string;
  nodeKey: string;
}

/**
 * Prompt 三层定义（从高到低）
 * Layer 3 节点级 > Layer 2 项目级 > Layer 1 系统默认
 * 高层覆盖低层，radio 选中哪层就以哪层为准
 */
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
  // ─── 状态 ───
  const [activeLayer, setActiveLayer] = useState(config.promptLayers?.activeLayer);  // 当前选中的生效层级
  const [editingKey, setEditingKey] = useState<string | null>(null);                // 正在编辑的层 key（null 表示未编辑）
  const [layers, setLayers] = useState<PromptLayers>({ ...config.promptLayers });   // 三层 Prompt 内容（本地副本）
  const [editText, setEditText] = useState('');                                     // textarea 中的临时编辑文本

  // ─── Prompt 编辑操作 ───

  /** 进入编辑模式：记录正在编辑的层，并用当前内容填充 textarea */
  const handleStartEdit = (key: string, content: string | null) => {
    setEditingKey(key);
    setEditText(content ?? '');
  };

  /** 取消编辑：丢弃 textarea 内容，退出编辑模式 */
  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditText('');
  };

  /** 保存编辑：将 textarea 内容写入对应层，空内容置为 null，并持久化到后端 */
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

  // ─── 渲染 ───
  return (
    <div className="config-tab">
      <div className="config-body">
        {/* 基本信息：节点类型、模型、超时、输入来源 */}
        <div className="config-section">
          <div className="config-section-title">基本信息</div>
          <div className="config-row">
            <span className="config-label">节点类型</span>
            <span className="config-value">{config.nodeType}</span>
          </div>
          <div className="config-row">
            <span className="config-label">AI 模型</span>
            <span className="config-value">{config.aiModel}</span>
          </div>
          <div className="config-row">
            <span className="config-label">超时设置</span>
            <span className="config-value">{config.timeout}</span>
          </div>
          <div className="config-row">
            <span className="config-label">输入来源</span>
            <span className="config-value">{config.inputSource}</span>
          </div>
        </div>

        {/* 执行数据：Token 消耗、耗时 */}
        <div className="config-section">
          <div className="config-section-title">执行数据</div>
          <div className="config-row">
            <span className="config-label">Token 消耗</span>
            <span className="config-value">{config.tokenUsage}</span>
          </div>
          <div className="config-row">
            <span className="config-label">耗时</span>
            <span className="config-value">{config.duration}</span>
          </div>
        </div>

        {/* Prompt 三层模板：radio 切换生效层，每层支持 inline 编辑 */}
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

                  {/* 展示模式：显示 Prompt 内容，空层显示占位提示 */}
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

                  {/* 编辑模式：textarea + 保存/取消按钮 */}
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

        {/* 输入数据：数据来源 + 变更文件列表 */}
        <div className="config-section">
          <div className="config-section-title">输入数据</div>
          <div className="config-data-block">
            <div className="config-data-label">来源</div>
            <div>{config.inputData?.source}</div>
            {config.inputData?.files.length > 0 && (
              <>
                <div className="config-data-label" style={{ marginTop: 8 }}>变更文件</div>
                <div className="config-file-list">
                  {config.inputData.files.map((f) => (
                    <div key={f} className="config-file-item">{f}</div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 输出数据：执行结果摘要 + 生成文件列表 */}
        <div className="config-section">
          <div className="config-section-title">输出数据</div>
          <div className="config-data-block">
            <div className="config-data-summary">{config.outputData?.summary}</div>
            {config.outputData?.files.length > 0 && (
              <>
                <div className="config-data-label" style={{ marginTop: 8 }}>生成文件</div>
                <div className="config-file-list">
                  {config.outputData?.files.map((f) => (
                    <div key={f} className="config-file-item">{f}</div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 底部操作栏：重新执行 / 执行节点 */}
      <div className="config-actions">
        <Button style={{ flex: 1 }}>重新执行</Button>
        <Button type="primary" style={{ flex: 1 }}>执行节点</Button>
      </div>
    </div>
  );
}
