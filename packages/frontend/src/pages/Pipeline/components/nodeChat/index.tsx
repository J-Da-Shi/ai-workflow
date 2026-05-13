import { useEffect, useState, useRef } from 'react';
import { Spin, message } from 'antd';
import ReactMarkdown from 'react-markdown';
import { getChatHistory, clearChatHistory } from '../../../../api/workflow';
import './index.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface NodeChatProps {
  workflowId: string;
  nodeKey: string;
}

export default function NodeChat({ workflowId, nodeKey }: NodeChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const chatBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const res = await getChatHistory(workflowId, nodeKey);
        const data = Array.isArray(res) ? res : (res as any).data || [];
        setMessages(data.map((m: any) => ({ role: m.role, content: m.content })));
      } catch {
        setMessages([]);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [workflowId, nodeKey]);

  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ workflowId, nodeKey, message: text }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                copy[copy.length - 1] = {
                  ...last,
                  content: last.content + (parsed.text || ''),
                };
                return copy;
              });
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      message.error('发送失败');
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    try {
      await clearChatHistory(workflowId, nodeKey);
      setMessages([]);
      message.success('对话已清空');
    } catch {
      message.error('清空失败');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return <Spin style={{ display: 'block', margin: '40px auto' }} />;
  }

  return (
    <div className="node-chat">
      <div className="chat-body" ref={chatBodyRef}>
        {messages.length === 0 && (
          <div className="chat-empty">输入消息开始对话，AI 会基于当前节点的上下文回答</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className={`chat-avatar ${msg.role}`}>
              {msg.role === 'assistant' ? 'AI' : 'U'}
            </div>
            <div className="chat-bubble">
              {msg.role === 'assistant' ? (
                <ReactMarkdown>{msg.content || '...'}</ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-footer">
        <button className="chat-clear-btn" onClick={handleClear} title="清空对话">🗑</button>
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，Shift+Enter 换行..."
          rows={1}
          disabled={sending}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={sending || !input.trim()}
        >
          {sending ? '...' : '发送'}
        </button>
      </div>
    </div>
  );
}
