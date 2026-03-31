'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface NotebookDoc {
  id: string;
  name: string;
  docCount: number;
  selected: boolean;
}

function getInitials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} mins ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'assistant',
    content: "Hello scholar! I'm your Quizzard AI tutor. Select documents from the left panel and I'll use them to answer your questions, generate flashcards, or quiz you on any topic.",
    timestamp: new Date(Date.now() - 60000).toISOString(),
  },
];

export default function AiChatPage() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [notebooks, setNotebooks] = useState<NotebookDoc[]>([]);

  const chatRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch notebooks for context selector
  useEffect(() => {
    fetch('/api/notebooks')
      .then((r) => r.json())
      .then((j) => {
        if (j.success && Array.isArray(j.data)) {
          setNotebooks(
            j.data.map((nb: { id: string; name: string; _count?: { documents?: number } }) => ({
              id: nb.id,
              name: nb.name,
              docCount: nb._count?.documents ?? 0,
              selected: true,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const toggleNotebook = useCallback((id: string) => {
    setNotebooks((prev) => prev.map((nb) => nb.id === id ? { ...nb, selected: !nb.selected } : nb));
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Stub AI response — replace with real API call when available
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: `Great question! Based on your selected study materials, here's what I found:\n\nThe topic you're asking about relates to several key concepts in your documents. I'd recommend reviewing the relevant sections and creating flashcards for the main ideas.\n\nWould you like me to generate a quiz or summary based on your notes?`,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, aiMsg]);
    setIsTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 192) + 'px';
  };

  const selectedCount = notebooks.filter((n) => n.selected).length;

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>

      {/* Left panel: Document Context */}
      <aside
        style={{
          width: '320px',
          minWidth: '320px',
          background: '#161630',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          padding: '24px',
          borderRight: '1px solid rgba(70,69,96,0.1)',
          overflowY: 'auto',
        }}
        className="custom-scrollbar"
      >
        <div>
          <h3
            style={{
              fontFamily: '"Shrikhand", serif',
              fontStyle: 'italic',
              fontSize: '20px',
              color: '#b9c3ff',
              margin: '0 0 8px',
            }}
          >
            Document Context
          </h3>
          <p style={{ fontSize: '12px', color: '#aaa8c8', margin: 0, lineHeight: 1.6 }}>
            Select which materials the AI should use to generate answers.
          </p>
        </div>

        {/* Notebook items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {notebooks.length === 0 && (
            <p style={{ fontSize: '13px', color: '#555578', textAlign: 'center', padding: '24px 0' }}>
              No notebooks yet. Create one to get started.
            </p>
          )}
          {notebooks.map((nb) => (
            <label
              key={nb.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '16px',
                background: nb.selected ? '#1c1c38' : '#111126',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'background 0.15s',
                border: '1px solid',
                borderColor: nb.selected ? 'transparent' : 'rgba(70,69,96,0.2)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLLabelElement).style.background = '#232342'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLLabelElement).style.background = nb.selected ? '#1c1c38' : '#111126'; }}
            >
              <input
                type="checkbox"
                checked={nb.selected}
                onChange={() => toggleNotebook(nb.id)}
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '4px',
                  accentColor: '#ae89ff',
                  flexShrink: 0,
                  marginTop: '2px',
                  cursor: 'pointer',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: nb.selected ? '#e5e3ff' : 'rgba(229,227,255,0.5)',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {nb.name}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    color: '#8888a8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginTop: '2px',
                    display: 'block',
                  }}
                >
                  {nb.docCount} doc{nb.docCount !== 1 ? 's' : ''}
                </span>
              </div>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '18px', color: nb.selected ? '#aaa8c8' : '#555578', flexShrink: 0 }}
              >
                description
              </span>
            </label>
          ))}
        </div>

        {/* Add source button */}
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px',
            border: '2px dashed rgba(70,69,96,0.3)',
            borderRadius: '12px',
            background: 'transparent',
            color: '#aaa8c8',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(174,137,255,0.5)';
            (e.currentTarget as HTMLButtonElement).style.color = '#ae89ff';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(70,69,96,0.3)';
            (e.currentTarget as HTMLButtonElement).style.color = '#aaa8c8';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload_file</span>
          Add New Source
        </button>

        {selectedCount > 0 && (
          <p style={{ fontSize: '11px', color: '#8888a8', textAlign: 'center', margin: '0' }}>
            {selectedCount} source{selectedCount !== 1 ? 's' : ''} active
          </p>
        )}
      </aside>

      {/* Right panel: Chat */}
      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#111126', position: 'relative', overflow: 'hidden' }}>

        {/* Chat history */}
        <div
          ref={chatRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '48px',
            paddingBottom: '160px',
            display: 'flex',
            flexDirection: 'column',
            gap: '32px',
          }}
          className="custom-scrollbar"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                gap: '16px',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                maxWidth: '768px',
                marginLeft: msg.role === 'user' ? 'auto' : '0',
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: msg.role === 'assistant' ? '#8348f6' : '#001971',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {msg.role === 'assistant' ? (
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: '20px',
                      color: '#ffffff',
                      fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                    }}
                  >
                    auto_fix_high
                  </span>
                ) : (
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#8b9eff' }}>
                    {getInitials(session?.user?.name)}
                  </span>
                )}
              </div>

              {/* Bubble */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  {msg.role === 'user' && (
                    <span style={{ fontSize: '10px', color: '#aaa8c8' }}>{relativeTime(msg.timestamp)}</span>
                  )}
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: msg.role === 'assistant' ? '#ae89ff' : '#b9c3ff',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {msg.role === 'assistant' ? 'Quizzard AI' : 'You'}
                  </span>
                  {msg.role === 'assistant' && (
                    <span style={{ fontSize: '10px', color: '#aaa8c8' }}>{relativeTime(msg.timestamp)}</span>
                  )}
                </div>

                <div
                  style={{
                    padding: '20px 24px',
                    borderRadius: '20px',
                    borderTopLeftRadius: msg.role === 'assistant' ? '4px' : '20px',
                    borderTopRightRadius: msg.role === 'user' ? '4px' : '20px',
                    background: msg.role === 'assistant' ? '#1c1c38' : '#ae89ff',
                    border: msg.role === 'assistant' ? '1px solid rgba(70,69,96,0.1)' : 'none',
                    boxShadow: msg.role === 'assistant'
                      ? '0 8px 32px rgba(0,0,0,0.3)'
                      : '0 8px 32px rgba(174,137,255,0.2)',
                    lineHeight: 1.7,
                    fontSize: '15px',
                    color: msg.role === 'assistant' ? '#e5e3ff' : '#2a0066',
                    fontWeight: msg.role === 'user' ? 500 : 400,
                    whiteSpace: msg.role === 'user' ? 'pre-wrap' : undefined,
                  }}
                >
                  {msg.role === 'assistant' ? (
                    <MarkdownRenderer content={msg.content} />
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div style={{ display: 'flex', gap: '16px', maxWidth: '400px' }}>
              <div
                style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: '#8348f6',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '20px', color: '#ffffff', fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
                >
                  auto_fix_high
                </span>
              </div>
              <div
                style={{
                  padding: '20px 24px',
                  borderRadius: '20px',
                  borderTopLeftRadius: '4px',
                  background: '#1c1c38',
                  border: '1px solid rgba(70,69,96,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: '#ae89ff',
                      animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Floating input */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            padding: '32px',
            paddingTop: 0,
            background: 'linear-gradient(to top, #111126 60%, rgba(17,17,38,0.9) 80%, transparent)',
          }}
        >
          <div style={{ maxWidth: '768px', margin: '0 auto', position: 'relative' }}>
            {/* Glow ring */}
            <div
              style={{
                position: 'absolute',
                inset: '-4px',
                background: 'linear-gradient(135deg, rgba(174,137,255,0.3), rgba(255,237,179,0.3))',
                borderRadius: '28px',
                filter: 'blur(8px)',
                opacity: 0,
                transition: 'opacity 0.3s',
              }}
              className="input-glow"
            />

            <div
              style={{
                position: 'relative',
                background: '#232342',
                border: '1px solid rgba(70,69,96,0.2)',
                borderRadius: '24px',
                padding: '8px',
                display: 'flex',
                alignItems: 'flex-end',
                gap: '8px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
              }}
              onFocusCapture={(e) => {
                const glow = e.currentTarget.previousElementSibling as HTMLElement;
                if (glow) glow.style.opacity = '1';
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(174,137,255,0.3)';
              }}
              onBlurCapture={(e) => {
                const glow = e.currentTarget.previousElementSibling as HTMLElement;
                if (glow) glow.style.opacity = '0';
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(70,69,96,0.2)';
              }}
            >
              {/* Attach */}
              <button
                style={{
                  padding: '10px',
                  background: 'transparent',
                  border: 'none',
                  color: '#aaa8c8',
                  cursor: 'pointer',
                  borderRadius: '12px',
                  flexShrink: 0,
                  marginBottom: '4px',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ae89ff'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#aaa8c8'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>attach_file</span>
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask your AI tutor anything..."
                rows={1}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  color: '#e5e3ff',
                  fontSize: '15px',
                  fontFamily: 'inherit',
                  lineHeight: '1.6',
                  padding: '14px 8px',
                  maxHeight: '192px',
                  overflowY: 'auto',
                }}
                className="custom-scrollbar"
              />

              {/* Right buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexShrink: 0 }}>
                <button
                  style={{
                    padding: '10px',
                    background: 'transparent',
                    border: 'none',
                    color: '#aaa8c8',
                    cursor: 'pointer',
                    borderRadius: '12px',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ffedb3'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#aaa8c8'; }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>mic</span>
                </button>
                <button
                  onClick={sendMessage}
                  disabled={isTyping || !input.trim()}
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '16px',
                    background: isTyping || !input.trim() ? '#2a2a4c' : '#ae89ff',
                    border: 'none',
                    color: isTyping || !input.trim() ? '#555578' : '#2a0066',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: isTyping || !input.trim() ? 'not-allowed' : 'pointer',
                    boxShadow: isTyping || !input.trim() ? 'none' : '0 4px 16px rgba(174,137,255,0.4)',
                    transition: 'background 0.2s, color 0.2s, box-shadow 0.2s, transform 0.15s cubic-bezier(0.22,1,0.36,1)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isTyping && input.trim()) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                  }}
                  onMouseDown={(e) => {
                    if (!isTyping && input.trim()) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.9)';
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: '22px',
                      fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                    }}
                  >
                    magic_button
                  </span>
                </button>
              </div>
            </div>

            {/* Footer notes */}
            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center', gap: '24px' }}>
              {[
                { icon: 'history_edu', text: 'AI can hallucinate. Verify with your docs.' },
                { icon: 'lock', text: 'Notes are private to this session.' },
              ].map(({ icon, text }) => (
                <span
                  key={text}
                  style={{
                    fontSize: '10px',
                    color: '#aaa8c8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{icon}</span>
                  {text}
                </span>
              ))}
            </div>
          </div>
        </div>

        <style>{`
          @keyframes typingBounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
            30% { transform: translateY(-6px); opacity: 1; }
          }
        `}</style>
      </section>
    </div>
  );
}
