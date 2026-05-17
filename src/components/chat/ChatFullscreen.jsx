import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Send, Sparkles, Loader2, FileText, Sheet } from 'lucide-react';
import clsx from 'clsx';
import { exportMessageToPDF, exportMessageToXLSX } from './exportUtils';

const WEBHOOK_URL = 'https://n8n.juntosfarmn8n.cloud/webhook/sales-chat';

// Persistent per-tab session so the agent's memory survives within the same
// browsing session but resets on a fresh page open.
const newSessionId = () => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const EXAMPLE_PROMPTS = [
    '¿Cuántas limonadas se han vendido en total?',
    '¿Cuántas transacciones tuvieron Juntos house, Tasting place y Distribution b2b en 2024?',
    'Compara los últimos 5 martes por revenue de cada BU',
    'Top 5 productos vendidos en Tasting place en abril',
];

const ChatFullscreen = ({ open, onClose }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const sessionIdRef = useRef(newSessionId());
    const scrollRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        // Focus the input when opening
        setTimeout(() => inputRef.current?.focus(), 50);
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, busy]);

    const send = async (text) => {
        const message = (text ?? input).trim();
        if (!message || busy) return;
        setError(null);
        setInput('');
        setMessages(m => [...m, { role: 'user', text: message }]);
        setBusy(true);
        try {
            const res = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, sessionId: sessionIdRef.current }),
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
            }
            const data = await res.json();
            const reply = data.reply || data.output || data.text || JSON.stringify(data);
            // Tag each assistant message with the question that prompted it so the
            // export buttons can record context inside the generated file.
            setMessages(m => [...m, { role: 'assistant', text: reply, question: message }]);
        } catch (e) {
            setError(e.message || String(e));
            setMessages(m => [...m, { role: 'assistant', text: '_Lo siento, hubo un error consultando los datos._' }]);
        } finally {
            setBusy(false);
        }
    };

    const onKeyDownInput = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col">
            {/* Header */}
            <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between bg-white shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <h2 className="font-serif text-lg text-primary">Asistente de ventas</h2>
                        <p className="text-[11px] text-gray-500">Gemini 3 Flash · consulta tu base de datos</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100 transition"
                    title="Cerrar (Esc)"
                >
                    <X className="w-5 h-5" />
                </button>
            </header>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-32 py-8">
                {messages.length === 0 && (
                    <div className="max-w-2xl mx-auto text-center mt-8">
                        <Sparkles className="w-10 h-10 text-primary/40 mx-auto mb-4" />
                        <h3 className="font-serif text-2xl text-primary mb-2">¿Sobre qué quieres preguntar?</h3>
                        <p className="text-sm text-gray-500 mb-8">Pregunto sobre productos, transacciones, comparativas de fechas. Tengo memoria durante esta sesión.</p>
                        <div className="grid sm:grid-cols-2 gap-3">
                            {EXAMPLE_PROMPTS.map(p => (
                                <button
                                    key={p}
                                    onClick={() => send(p)}
                                    className="text-left text-sm px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 transition-colors"
                                >{p}</button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="max-w-3xl mx-auto space-y-6">
                    {messages.map((m, i) => (
                        <MessageBubble key={i} role={m.role} text={m.text} question={m.question} />
                    ))}
                    {busy && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 px-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Pensando…
                        </div>
                    )}
                    {error && (
                        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                            {error}
                        </div>
                    )}
                </div>
            </div>

            {/* Input bar */}
            <div className="border-t border-gray-200 bg-white px-4 md:px-12 lg:px-32 py-4">
                <div className="max-w-3xl mx-auto flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        rows={1}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={onKeyDownInput}
                        placeholder="Escribe tu pregunta…  (Enter para enviar · Shift+Enter para salto de línea)"
                        className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent max-h-40"
                        style={{ minHeight: '52px' }}
                    />
                    <button
                        onClick={() => send()}
                        disabled={!input.trim() || busy}
                        className={clsx(
                            'rounded-xl px-4 py-3 transition-all flex items-center gap-2 text-sm font-medium',
                            input.trim() && !busy
                                ? 'bg-primary text-white hover:bg-opacity-90'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        )}
                    >
                        <Send className="w-4 h-4" />
                        Enviar
                    </button>
                </div>
                <p className="text-[10px] text-gray-400 text-center mt-2">
                    Las respuestas vienen de tu base de datos del dashboard. La IA puede equivocarse — verifica cifras críticas.
                </p>
            </div>
        </div>
    );
};

const MessageBubble = ({ role, text, question }) => {
    const isUser = role === 'user';
    // First line / first heading of the reply makes a decent filename slug
    const inferredTitle = (() => {
        if (!text) return 'Respuesta';
        const firstHeading = text.match(/^##?#?\s+(.+)$/m);
        if (firstHeading) return firstHeading[1].slice(0, 60);
        const firstLine = text.split('\n').find(l => l.trim().length > 0) || '';
        return firstLine.replace(/[*_`]/g, '').slice(0, 60) || 'Respuesta';
    })();
    return (
        <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
            <div
                className={clsx(
                    'max-w-[85%] rounded-2xl px-4 py-3',
                    isUser
                        ? 'bg-primary text-white rounded-br-sm'
                        : 'bg-white border border-gray-200 rounded-bl-sm shadow-sm'
                )}
            >
                {isUser ? (
                    <p className="text-sm whitespace-pre-wrap">{text}</p>
                ) : (
                    <>
                        <div className="markdown-body prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                        </div>
                        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100">
                            <button
                                onClick={() => exportMessageToPDF(text, { title: inferredTitle })}
                                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-primary hover:bg-gray-50 px-2 py-1 rounded-md transition-colors"
                                title="Descargar como PDF"
                            >
                                <FileText className="w-3.5 h-3.5" /> PDF
                            </button>
                            <button
                                onClick={() => exportMessageToXLSX(text, { title: inferredTitle, question })}
                                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-primary hover:bg-gray-50 px-2 py-1 rounded-md transition-colors"
                                title="Descargar como Excel"
                            >
                                <Sheet className="w-3.5 h-3.5" /> Excel
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ChatFullscreen;
