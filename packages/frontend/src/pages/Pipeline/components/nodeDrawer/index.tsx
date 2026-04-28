import { useEffect, useState } from 'react';
import { Tabs, Drawer, Spin, Button, Modal, message } from 'antd';
import type { NodeDrawerProps, NodeConfig } from '../../types';
import { getNodeConfig, getWorkspaceFiles, getWorkspaceFileContent, saveWorkspaceFileContent } from '../../../../api/workflow';
import ConfigTab from '../nodeConfig';
import ChatTab from '../nodeChat';
// react-syntax-highlighter 的 Prism 版本（支持更多语言 + 更好的高亮效果）                                                                                                              
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// VS Code 暗色主题，和我们 Modal 的 #1e1e1e 背景一致                                                                                                                                   
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Editor from '@monaco-editor/react';
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

/**                                                   
   * 文件扩展名 → SyntaxHighlighter 语言标识 映射                                                                                                                                         
   *                                                                                                                                                                                      
   * SyntaxHighlighter 需要知道代码是什么语言才能正确高亮                                                                                                                                 
   * 我们从文件名中提取扩展名，然后查这个表                                                                                                                                               
   * 没匹配到的扩展名会降级为 'text'（纯文本，不高亮）                                                                                                                                    
   */
const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  py: 'python',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  css: 'css',
  html: 'html',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  dockerfile: 'dockerfile',
  xml: 'xml',
  java: 'java',
  go: 'go',
  rs: 'rust',
};

export default function NodeDrawer({
  open,
  node,
  workflowId,
  onClose,
}: NodeDrawerProps) {
  const [config, setConfig] = useState<NodeConfig | null>(null);
  const [loading, setLoading] = useState(false);
  // ─── 文件列表相关状态 ───                                                                                                                                                             
  // files: Agent 产出的文件路径列表，例如 ['src/app.ts', 'package.json']                                                                                                                 
  const [files, setFiles] = useState<string[]>([]);
  // selectedFile: 当前选中查看的文件路径，null 表示未选中                                                                                                                                
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  // fileContent: 选中文件的内容文本                                                                                                                                                      
  const [fileContent, setFileContent] = useState('');
  // fileLoading: 文件内容是否正在加载                                                                                                                                                    
  const [fileLoading, setFileLoading] = useState(false);
  // editing: 是否处于编辑模式（true=Monaco Editor，false=SyntaxHighlighter 只读）                                                                                                      
  const [editing, setEditing] = useState(false);
  // editContent: 编辑模式下的文件内容（和 fileContent 分开，方便取消编辑时恢复）                                                                                                       
  const [editContent, setEditContent] = useState('');

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

  /**                                                                                                                                                                                     
   * 加载 Agent 产出的文件列表                                                                                                                                                            
   * 在"执行日志" tab 被打开时调用                                                                                                                                                        
   */
  const loadFiles = async () => {
    if (!node) return;
    try {
      // 调用后端接口获取工作目录下的文件列表                                                                                                                                             
      const res = (await getWorkspaceFiles(workflowId, node.key)) as unknown as string[];
      setFiles(res || []);
    } catch {
      setFiles([]);
    }
  };

  /**                                                   
   * 加载指定文件的内容                                                                                                                                                                   
   * 用户点击文件列表中的某个文件时调用                                                                                                                                                   
   *                                                                                                                                                                                      
   * @param filePath - 文件相对路径                                                                                                                                                       
   */
  const loadFileContent = async (filePath: string) => {
    if (!node) return;
    setSelectedFile(filePath);
    setFileLoading(true);
    try {
      // 调用后端接口获取文件内容（返回纯文本字符串）                                                                                                                                     
      const res = (await getWorkspaceFileContent(workflowId, node.key, filePath)) as unknown as string;
      setFileContent(res || '');
    } catch {
      setFileContent('无法读取文件');
    } finally {
      setFileLoading(false);
    }
  };

  /**                                                                                                                                                                                   
    * 保存编辑后的文件内容                                                                                                                                                               
    * 调用后端接口将修改写回磁盘，成功后同步本地状态                                                                                                                                     
    */
  const handleSaveFile = async () => {
    if (!node || !selectedFile) return;
    try {
      await saveWorkspaceFileContent(workflowId, node.key, selectedFile, editContent);
      // 保存成功：把编辑内容同步到只读状态，退出编辑模式                                                                                                                               
      setFileContent(editContent);
      setEditing(false);
      message.success('保存成功');
    } catch {
      message.error('保存失败');
    }
  };

  if (!node) return null;

  return (
    <>
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
            defaultActiveKey="config"
            onChange={(key) => {
              // 切换到"执行日志" tab 时，自动加载文件列表                                                                                                                                        
              if (key === 'logs') {
                loadFiles();
              }
            }}
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
                children: <ChatTab workflowId={workflowId} nodeKey={node.key} />,
              },
              {
                key: 'logs',
                label: '执行日志',
                children: <div>
                  {/* 文件列表标题 + 刷新按钮 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <strong>Agent 产出文件</strong>
                    {/* 点击刷新重新加载文件列表 */}
                    <Button size="small" onClick={loadFiles}>刷新</Button>
                  </div>

                  {/* 文件列表 */}
                  {files.length === 0 ? (
                    // 没有文件时的提示                                                                                                                                                                 
                    <div style={{ color: '#999' }}>
                      暂无文件（节点需使用 Claude Agent 执行后才会产出文件）
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {files.map((f) => (
                        <div
                          key={f}
                          onClick={() => loadFileContent(f)}
                          style={{
                            // 当前选中的文件高亮显示
                            padding: '4px 8px',
                            cursor: 'pointer',
                            borderRadius: 4,
                            background: selectedFile === f ? '#e6f4ff' : 'transparent',
                            fontSize: 13,
                            fontFamily: 'monospace',
                          }}
                        >
                          {/* 文件图标 + 文件路径 */}
                          📄 {f}
                        </div>
                      ))}
                    </div>
                  )}

                </div>,
              },
            ]}
          />
        )}
      </Drawer>

      {/* 文件内容弹框 — 点击文件列表中的文件时弹出 */}
      <Modal
        open={!!selectedFile}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{selectedFile}</span>
            <Button
              size="small"
              onClick={() => {
                // 复制当前显示的内容（编辑模式下复制编辑中的内容）                                                                                                                             
                navigator.clipboard.writeText(editing ? editContent : fileContent);
                message.success('已复制到剪贴板');
              }}
            >
              复制
            </Button>
          </div>
        }
        onCancel={() => {
          setSelectedFile(null);
          setFileContent('');
          setEditing(false);
          setEditContent('');
        }}
        footer={
          // Modal 底部按钮：编辑模式和只读模式显示不同按钮                                                                                                                             
          editing ? (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button onClick={() => setEditing(false)}>取消</Button>
              <Button type="primary" onClick={handleSaveFile}>保存</Button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button
                onClick={() => {
                  // 进入编辑模式：把当前文件内容复制到编辑缓冲区                                                                                                                       
                  setEditContent(fileContent);
                  setEditing(true);
                }}
              >
                编辑
              </Button>
            </div>
          )
        }
        width={800}
        styles={{
          body: { padding: 0 },
        }}
      >
        {fileLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : editing ? (
          // ─── 编辑模式：Monaco Editor ───                                                                                                                                            
          <Editor
            height="70vh"
            // Monaco 用的语言标识和 SyntaxHighlighter 的映射表一致                                                                                                                     
            language={EXT_LANG[selectedFile?.split('.').pop()?.toLowerCase() || ''] || 'plaintext'}
            theme="vs-dark"
            value={editContent}
            onChange={(value) => setEditContent(value || '')}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
            }}
          />
        ) : (
          // ─── 只读模式：SyntaxHighlighter（加载快，适合纯浏览） ───                                                                                                                  
          <SyntaxHighlighter
            language={EXT_LANG[selectedFile?.split('.').pop()?.toLowerCase() || ''] || 'text'}
            style={vscDarkPlus}
            showLineNumbers
            customStyle={{
              margin: 0,
              borderRadius: '0 0 8px 8px',
              fontSize: 13,
              lineHeight: 1.6,
              maxHeight: '70vh',
              overflow: 'auto',
            }}
          >
            {fileContent}
          </SyntaxHighlighter>
        )}
      </Modal>
    </>
  );
}
