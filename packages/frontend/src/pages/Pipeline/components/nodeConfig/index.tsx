import { useState, useEffect } from 'react';
import { Switch, Collapse, message, Select } from 'antd';
import type { NodeConfig, PromptLayers } from '../../types';
import { updateNodeConfig } from '../../../../api/workflow';
import { getKnowledgeBases } from '../../../../api/knowledge';
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

  // 知识库选择状态
  const [kbOptions, setKbOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>(config.knowledgeBaseIds || []);

  // 加载知识库列表
  useEffect(() => {
    const fetchKbs = async () => {
      try {
        // 获取所有知识库（暂不按 projectId 过滤，后续可加）
        const res = await getKnowledgeBases('');
        const list = Array.isArray(res) ? res : (res as any).data || [];
        setKbOptions(list.map((kb: any) => ({ value: kb.id, label: `${kb.name}（${kb.chunkCount} 条）` })));
      } catch {
        setKbOptions([]);
      }
    };
    fetchKbs();
  }, []);

  // 保存知识库选择
  const handleSaveKb = async (ids: string[]) => {
    setSelectedKbIds(ids);
    try {
      await updateNodeConfig(workflowId, nodeKey, { knowledgeBaseIds: ids });
      message.success('知识库配置已保存');
    } catch {
      message.error('保存失败');
    }
  };

  // Git 配置状态
  const [gitConfig, setGitConfig] = useState({
    gitRepo: config.gitRepo || '',
    gitPlatform: config.gitPlatform || 'github',
    gitToken: config.gitToken || '',
    gitBaseBranch: config.gitBaseBranch || 'main',
  });

  const handleSaveGit = async () => {
    try {
      await updateNodeConfig(workflowId, nodeKey, {
        gitRepo: gitConfig.gitRepo.trim() || null,
        gitPlatform: gitConfig.gitPlatform,
        gitToken: gitConfig.gitToken.trim() || null,
        gitBaseBranch: gitConfig.gitBaseBranch.trim() || 'main',
      });
      message.success('Git 配置已保存');
    } catch {
      message.error('保存失败');
    }
  };

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
                <div className="git-section">
                  <div className="git-section-title">Git 集成</div>
                  <div className="config-row">
                    <span className="config-label">Git 仓库</span>
                    <span className="config-value">
                      <input
                        className="config-input"
                        placeholder="https://github.com/user/repo.git"
                        defaultValue={config.gitRepo || ''}
                        onChange={(e) => setGitConfig(prev => ({ ...prev, gitRepo: e.target.value }))}
                      />
                    </span>
                  </div>
                  <div className="config-row">
                    <span className="config-label">Git 平台</span>
                    <span className="config-value">
                      <select
                        className="config-input"
                        defaultValue={config.gitPlatform || 'github'}
                        onChange={(e) => setGitConfig(prev => ({ ...prev, gitPlatform: e.target.value }))}
                      >
                        <option value="github">GitHub</option>
                        <option value="gitlab">GitLab</option>
                      </select>
                    </span>
                  </div>
                  <div className="config-row">
                    <span className="config-label">Git Token</span>
                    <span className="config-value">
                      <input
                        className="config-input"
                        type="password"
                        placeholder="ghp_xxx 或 glpat-xxx"
                        defaultValue={config.gitToken || ''}
                        onChange={(e) => setGitConfig(prev => ({ ...prev, gitToken: e.target.value }))}
                      />
                    </span>
                  </div>
                  <div className="config-row">
                    <span className="config-label">基准分支</span>
                    <span className="config-value">
                      <input
                        className="config-input"
                        placeholder="main"
                        defaultValue={config.gitBaseBranch || 'main'}
                        onChange={(e) => setGitConfig(prev => ({ ...prev, gitBaseBranch: e.target.value }))}
                      />
                    </span>
                  </div>
                  <div className="git-save-row">
                    <button className="git-save-btn" onClick={handleSaveGit}>
                      保存 Git 配置
                    </button>
                  </div>
                </div>

                {/* 知识库选择 */}
                <div className="kb-selector-section">
                  <div className="git-section-title">知识库关联</div>
                  <div className="config-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                    <span className="config-label">选择知识库（节点执行时从选中的知识库检索参考资料）</span>
                    <Select
                      mode="multiple"
                      style={{ width: '100%' }}
                      placeholder="选择要关联的知识库"
                      value={selectedKbIds}
                      options={kbOptions}
                      onChange={handleSaveKb}
                    />
                  </div>
                </div>
              </div>
            ),
          }]}
        />
      </div>
    </div>
  );
}
