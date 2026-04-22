import { useEffect, useState, useRef } from "react";
import { getChatHistory, clearChatHistory } from "../../../../api/workflow";
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

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
    }

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.keyCode === 13) {
            handleSend()
        }
    }

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
                        {msg.content}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <div className="chat-input-area">
                <input value={input} onChange={onChange} onKeyDown={onKeyDown} />
                <button onClick={handleSend} disabled={loading}>发送</button>
                <button onClick={handleClear}>清空</button>
            </div>
        </div>
    );
} 