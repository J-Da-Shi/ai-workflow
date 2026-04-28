import { useEffect, useState, useRef } from "react";
import { getChatHistory, clearChatHistory } from "../../../../api/workflow";
// Markdown 渲染：将 AI 回复的 Markdown 文本渲染为 HTML                                                                                                                                 
import ReactMarkdown from 'react-markdown';
// GitHub Flavored Markdown 插件：支持表格、删除线、任务列表                                                                                                                            
import remarkGfm from 'remark-gfm';
// 复用 Step 1 安装的语法高亮组件，用于渲染 Markdown 中的代码块                                                                                                                         
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './index.css';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatTabProps {
    workflowId: string;
    nodeKey: string;
}

export default function ChatTab({ workflowId, nodeKey }: ChatTabProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // 加载历史消息                                                                                                                                    
    useEffect(() => {
        getChatHistory(workflowId, nodeKey).then(res => {
            setMessages(res as unknown as ChatMessage[]);
        })
    }, [workflowId, nodeKey]);

    // 发送消息                                                                                                                                        
    const handleSend = async () => {
        if (!input.trim() || loading) return;
        setLoading(true);
        const data = input.trim();

        // 1. 先把用户消息加入列表    
        const userMsg: ChatMessage = { role: 'user', content: data };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        // 2. 再加一条空的 assistant 消息（用于流式追加）
        setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
        // 3. fetch SSE，逐 token 更新最后一条 assistant 消息  
        const res = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ workflowId, nodeKey, message: data }),
        });
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            // SSE 格式每行是 "data: xxx\n\n", 需要解析
            // 简单做法：提取 data：后面的内容
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const text = line.slice(6); // 去掉 data:
                    if (text === '[DONE]') break;
                    const textStr = JSON.parse(text);
                    setMessages((prev) => {
                        const copy = [...prev];
                        const last = copy[copy.length - 1];
                        copy[copy.length - 1] = { ...last, content: last.content + textStr.text };
                        return copy;
                    });
                }
            }
        }
        // 4. 完成后 setLoading(false)      
        setLoading(false);
    };

    // 清空对话                                                                                                                                        
    const handleClear = async () => {
        clearChatHistory(workflowId, nodeKey);
        setMessages([]);
    };

    return (
        <div className="chat-tab">
            <div className="chat-messages">
                {messages.map((msg, i) => (
                    <div key={i} className={`chat-message ${msg.role}`}>
                        {msg.role === 'assistant' ? (
                            // assistant 消息用 Markdown 渲染                                                                                                                           
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    // 自定义代码块渲染：用 SyntaxHighlighter 替代默认的 <code>                                                                                         
                                    code({ className, children, ...props }) {
                                        // className 格式为 "language-xxx"，提取语言名                                                                                                  
                                        const match = /language-(\w+)/.exec(className || '');
                                        // 判断是否是多行代码块（而不是行内 `code`）                                                                                                    
                                        const isBlock = String(children).includes('\n');
                                        return match && isBlock ? (
                                            <SyntaxHighlighter
                                                style={vscDarkPlus}
                                                language={match[1]}
                                                PreTag="div"
                                            >
                                                {/* 去掉末尾多余的换行符 */}
                                                {String(children).replace(/\n$/, '')}
                                            </SyntaxHighlighter>
                                        ) : (
                                            // 行内代码：保持默认的 <code> 标签                                                                                                         
                                            <code className={className} {...props}>
                                                {children}
                                            </code>
                                        );
                                    },
                                }}
                            >
                                {msg.content}
                            </ReactMarkdown>
                        ) : (
                            // 用户消息保持纯文本                                                                                                                                       
                            msg.content
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <div className="chat-input-area">
                {/* textarea 替代 input：支持多行输入 */}
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        // Enter 发送，Shift+Enter 换行                                                                                                                                 
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder="输入消息...（Shift+Enter 换行）"
                    rows={2}
                />
                <button onClick={handleSend} disabled={loading}>发送</button>
                <button onClick={handleClear}>清空</button>
            </div>
        </div>
    );
} 