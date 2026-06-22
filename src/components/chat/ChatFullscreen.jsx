import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    X, Send, Sparkles, Loader2, FileText, Sheet, Copy, Check,
    StopCircle, RefreshCcw, ArrowDown, Plus,
} from 'lucide-react';
import clsx from 'clsx';
import { exportMessageToPDF, exportMessageToXLSX } from './exportUtils';
import ChatChart from './ChatChart';

const WEBHOOK_URL = 'https://n8n.juntosfarmn8n.cloud/webhook/sales-chat';
const MODEL_LABEL = 'GLM 5.2 · OpenRouter';

const newSessionId = () => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const EXAMPLE_PROMPTS = [
    '¿Cuántas limonadas se han vendido este año?',
    '¿Cómo va Juntos house esta semana vs la semana anterior?',
    'Top 5 productos en Tasting place este mes',
    'Compara revenue por BU en mayo',
];

// Status text that cycles while waiting for the agent. Sets the expectation
// that the bot is doing real work, not silently hanging.
const STATUS_STEPS = [
    'Leyendo la pregunta…',
    'Consultando la base de datos…',
    'Analizando los datos…',
    'Componiendo la respuesta…',
];

const ChatFullscreen = ({ open, onClose }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [statusIdx, setStatusIdx] = useState(0);
    const [showScrollDown, setShowScrollDown] = useState(false);
    const sessionIdRef = useRef(newSessionId());
    const abortRef = useRef(null);
    const lastQuestionRef = useRef(null);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);

    // ─── Lifecycle ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        setTimeout(() => inputRef.current?.focus(), 50);
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    // Auto-scroll to bottom on new messages, unless the user has scrolled up.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceFromBottom < 120) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        }
    }, [messages, busy]);

    // Watch scroll position to show/hide the "jump to bottom" pill.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
            const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
            setShowScrollDown(distance > 200);
        };
        el.addEventListener('scroll', onScroll);
        return () => el.removeEventListener('scroll', onScroll);
    }, [open]);

    // Cycle status messages while busy.
    useEffect(() => {
        if (!busy) { setStatusIdx(0); return; }
        const t = setInterval(() => setStatusIdx(i => (i + 1) % STATUS_STEPS.length), 2200);
        return () => clearInterval(t);
    }, [busy]);

    // Auto-resize the textarea up to ~6 lines.
    useEffect(() => {
        const ta = inputRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }, [input]);

    // ─── Networking ────────────────────────────────────────────────────────
    const send = useCallback(async (text) => {
        const message = (text ?? input).trim();
        if (!message || busy) return;
        setError(null);
        setInput('');
        lastQuestionRef.current = message;
        setMessages(m => [...m, { role: 'user', text: message }]);
        setBusy(true);

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        try {
            const today = new Date().toISOString().slice(0, 10);
            const res = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, sessionId: sessionIdRef.current, today }),
                signal: ctrl.signal,
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
            }
            const data = await res.json();
            const reply = data.reply || data.output || data.text || JSON.stringify(data);
            setMessages(m => [...m, { role: 'assistant', text: reply, question: message }]);
        } catch (e) {
            if (e.name === 'AbortError') {
                setMessages(m => [...m, { role: 'assistant', text: '_Respuesta cancelada._', question: message, cancelled: true }]);
            } else {
                setError(e.message || String(e));
            }
        } finally {
            setBusy(false);
            abortRef.current = null;
        }
    }, [input, busy]);

    const cancel = () => abortRef.current?.abort();

    const retry = () => {
        if (!lastQuestionRef.current) return;
        // Drop the last assistant message if it was an error/cancel
        setMessages(m => {
            const last = m[m.length - 1];
            if (last?.role === 'assistant' && (last.cancelled || /error|cancel/i.test(last.text))) {
                return m.slice(0, -1);
            }
            return m;
        });
        setError(null);
        send(lastQuestionRef.current);
    };

    const newConversation = () => {
        sessionIdRef.current = newSessionId();
        setMessages([]);
        setError(null);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const scrollToBottom = () => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
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
                        <h2 className="font-serif text-lg text-primary">Juntos Inteligence</h2>
                        <p className="text-[11px] text-gray-500">{MODEL_LABEL}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {messages.length > 0 && (
                        <button
                            onClick={newConversation}
                            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-primary px-3 py-2 rounded-lg hover:bg-gray-50 transition"
                            title="Empezar nueva conversación"
                        >
                            <Plus className="w-3.5 h-3.5" /> Nueva
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100 transition"
                        title="Cerrar (Esc)"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-32 py-8 relative">
                {messages.length === 0 && (
                    <div className="max-w-2xl mx-auto text-center mt-8">
                        <Sparkles className="w-10 h-10 text-primary/40 mx-auto mb-4" />
                        <h3 className="font-serif text-2xl text-primary mb-2">¿Sobre qué quieres preguntar?</h3>
                        <p className="text-sm text-gray-500 mb-8">
                            Pregunto sobre productos, transacciones, comparativas de fechas y BUs. Recuerdo el contexto durante esta conversación.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-3">
                            {EXAMPLE_PROMPTS.map(p => (
                                <button
                                    key={p}
                                    onClick={() => send(p)}
                                    className="text-left text-sm px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-primary hover:bg-primary/5 hover:shadow-sm transition-all"
                                >{p}</button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="max-w-3xl mx-auto space-y-6">
                    {messages.map((m, i) => (
                        <MessageBubble
                            key={i}
                            role={m.role}
                            text={m.text}
                            question={m.question}
                            cancelled={m.cancelled}
                            isLast={i === messages.length - 1}
                            onSuggestion={send}
                        />
                    ))}
                    {busy && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 px-2 transition-all">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            <span className="animate-in fade-in duration-300" key={statusIdx}>
                                {STATUS_STEPS[statusIdx]}
                            </span>
                        </div>
                    )}
                    {error && !busy && (
                        <div className="flex items-start gap-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="flex-1">
                                <strong>Error:</strong> {error}
                            </div>
                            <button
                                onClick={retry}
                                className="inline-flex items-center gap-1.5 text-xs font-medium bg-white border border-red-300 hover:bg-red-100 px-2.5 py-1 rounded-md transition"
                            >
                                <RefreshCcw className="w-3 h-3" /> Reintentar
                            </button>
                        </div>
                    )}
                </div>

                {/* Scroll-to-bottom pill */}
                {showScrollDown && (
                    <button
                        onClick={scrollToBottom}
                        className="sticky bottom-4 left-1/2 -translate-x-1/2 mx-auto flex items-center gap-1.5 bg-primary text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg hover:scale-105 transition-transform"
                    >
                        <ArrowDown className="w-3 h-3" /> Bajar
                    </button>
                )}
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
                        disabled={busy}
                        placeholder={busy ? 'Esperando respuesta…' : 'Escribe tu pregunta…  (Enter para enviar · Shift+Enter para salto de línea)'}
                        className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
                        style={{ minHeight: '52px', maxHeight: '200px' }}
                    />
                    {busy ? (
                        <button
                            onClick={cancel}
                            className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm font-medium bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition"
                            title="Detener la respuesta"
                        >
                            <StopCircle className="w-4 h-4" />
                            Detener
                        </button>
                    ) : (
                        <button
                            onClick={() => send()}
                            disabled={!input.trim()}
                            className={clsx(
                                'rounded-xl px-4 py-3 transition-all flex items-center gap-2 text-sm font-medium',
                                input.trim()
                                    ? 'bg-primary text-white hover:bg-opacity-90 hover:shadow-md'
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            )}
                        >
                            <Send className="w-4 h-4" />
                            Enviar
                        </button>
                    )}
                </div>
                <p className="text-[10px] text-gray-400 text-center mt-2">
                    Las respuestas vienen de la base de datos del dashboard. La IA puede equivocarse — verifica cifras críticas.
                </p>
            </div>
        </div>
    );
};

// ─── Message bubble ────────────────────────────────────────────────────────
const MessageBubble = ({ role, text, question, cancelled, isLast, onSuggestion }) => {
    const isUser = role === 'user';
    const [copied, setCopied] = useState(false);

    const inferredTitle = (() => {
        if (!text) return 'Respuesta';
        const firstHeading = text.match(/^##?#?\s+(.+)$/m);
        if (firstHeading) return firstHeading[1].replace(/[*_`]/g, '').slice(0, 60);
        const firstLine = text.split('\n').find(l => l.trim().length > 0) || '';
        return firstLine.replace(/[*_`#]/g, '').slice(0, 60) || 'Respuesta';
    })();

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // ignore — clipboard can be blocked in non-https contexts
        }
    };

    // Suggestion chips: derive 2-3 follow-up questions from the previous turn.
    // We do it client-side rather than asking the model, to avoid round-trips.
    const suggestions = isLast && !cancelled && !isUser ? buildSuggestions(question, text) : [];

    return (
        <div className={clsx('flex animate-in fade-in slide-in-from-bottom-2 duration-300', isUser ? 'justify-end' : 'justify-start')}>
            <div
                className={clsx(
                    'max-w-[88%] rounded-2xl px-4 py-3',
                    isUser
                        ? 'bg-primary text-white rounded-br-sm'
                        : 'bg-white border border-gray-200 rounded-bl-sm shadow-sm'
                )}
            >
                {isUser ? (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
                ) : (
                    <>
                        <div className="markdown-body prose-sm max-w-none">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    code({ inline, className, children, ...props }) {
                                        if (inline) return <code className={className} {...props}>{children}</code>;
                                        const lang = (className || '').match(/language-([\w-]+)/)?.[1] || '';
                                        const raw = String(children).trim();
                                        const looksLikeChart = lang === 'chart' || lang === '' || lang === 'json';
                                        if (looksLikeChart && raw.startsWith('{') && raw.endsWith('}')) {
                                            try {
                                                const spec = JSON.parse(raw);
                                                const isChartSpec =
                                                    ['bar', 'line', 'pie', 'doughnut'].includes(spec.type) &&
                                                    (Array.isArray(spec.labels) || Array.isArray(spec.values) || Array.isArray(spec.datasets));
                                                if (isChartSpec) return <ChatChart spec={spec} />;
                                            } catch {
                                                if (lang === 'chart') {
                                                    return (
                                                        <pre className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2">
                                                            Chart JSON inválido: {raw.slice(0, 200)}…
                                                        </pre>
                                                    );
                                                }
                                            }
                                        }
                                        return <code className={className} {...props}>{children}</code>;
                                    },
                                }}
                            >
                                {text}
                            </ReactMarkdown>
                        </div>

                        {!cancelled && (
                            <div className="flex items-center gap-1 mt-3 pt-2 border-t border-gray-100">
                                <button
                                    onClick={copy}
                                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-primary hover:bg-gray-50 px-2 py-1 rounded-md transition-colors"
                                    title="Copiar respuesta"
                                >
                                    {copied
                                        ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> <span className="text-emerald-700">Copiado</span></>
                                        : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                                </button>
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
                        )}

                        {suggestions.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {suggestions.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => onSuggestion(s)}
                                        className="text-[11px] text-primary border border-primary/30 hover:bg-primary/5 px-2.5 py-1 rounded-full transition-colors"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

// ─── Suggestion generator (client-side, no LLM round-trip) ─────────────────
const buildSuggestions = (question, reply) => {
    if (!question) return [];
    const q = question.toLowerCase();
    const out = [];
    const has = (re) => re.test(q) || re.test((reply || '').toLowerCase());

    // Time-based
    if (has(/semana|week/)) out.push('¿Cómo va vs la semana anterior?');
    if (has(/mes|month|abril|mayo|junio|julio|enero|febrero|marzo|agosto|septiembre|octubre|noviembre|diciembre/)) out.push('¿Y vs el mismo mes de 2025?');
    if (has(/(2025|2026)/)) out.push('Compáralo con el año anterior');

    // BU-based
    if (has(/juntos house|tasting|picadeli|juntos deli|farm shop|boutique|distribution/)) out.push('Desglosa por día');
    if (has(/revenue|facturación|ventas|ingresos/)) out.push('Sácame el volumen de transacciones también');
    if (has(/transacciones|tickets|pax|órdenes/)) out.push('Y el revenue por BU');

    // Product-based
    if (has(/producto|top|vendido|limonada/)) out.push('Hazme un gráfico');
    if (has(/limonada|cerveza|pollo|pita|hummus/)) out.push('¿Cuántas se vendieron el mes pasado?');

    // Default for empty
    if (!out.length) out.push('Hazme un gráfico', 'Compáralo con el año anterior');

    // Dedupe + cap to 3
    return [...new Set(out)].slice(0, 3);
};

export default ChatFullscreen;
