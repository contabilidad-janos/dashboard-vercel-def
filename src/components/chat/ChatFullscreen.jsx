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
const MODEL_LABEL = 'Gemini Flash · auto-routing';

// Per-question model routing to save tokens: simple single-fact lookups go to the
// cheap model; anything needing comparison, ranges, multi-BU, trends or a chart
// goes to the smart model. Conservative — defaults to SMART on any signal.
const SMART_MODEL = 'google/gemini-3.5-flash';
const CHEAP_MODEL = 'google/gemini-3.1-flash-lite';
const pickModel = (q) => {
    const s = (q || '').toLowerCase();
    const signals = [
        /\bvs\b|versus|compar|tren|evolu|growth|crec|chang|cambi|diferen/,
        /last (week|month|year)|previous year|same (month|period)|semana pasada|mes pasado|a[ñn]o pasado/,
        /by day|by week|by month|per day|breakdown|desglos|por d[ií]a|por semana|por mes|each|cada|every|todas?/,
        /all (bu|business|groups)|by bu|every bu/,
        /chart|graph|gr[áa]fic|plot|bubble|visual/,
        /top \d/,
        /q[1-4]\b|quarter|trimestre|ytd|summer|temporada/,
    ];
    let score = signals.reduce((n, re) => n + (re.test(s) ? 1 : 0), 0);
    if ((q || '').length > 90) score += 1;
    const buHits = (s.match(/juntos house|tasting|picadeli|juntos deli|farm shop|boutique|distribution|products|activities/g) || []).length;
    const timeHits = (s.match(/\b(week|semana|month|mes|year|a[ñn]o|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/g) || []).length;
    if (buHits >= 2) score += 1;
    if (timeHits >= 2) score += 1;
    return score === 0 ? CHEAP_MODEL : SMART_MODEL;
};

const newSessionId = () => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Pull display text out of one n8n streaming chunk line. Tolerant of several
// shapes: SSE `data:` lines, raw JSON event objects, or plain text.
const extractDelta = (line) => {
    let s = line.trim();
    if (!s || s === '[DONE]') return '';
    if (s.startsWith('data:')) s = s.slice(5).trim();
    if (!s || s === '[DONE]') return '';
    try {
        const o = JSON.parse(s);
        if (typeof o === 'string') return o;
        if (o.type && ['begin', 'end', 'error'].includes(o.type)) return o.content || '';
        return o.content ?? o.delta ?? o.text ?? o.output ?? o.reply ?? o.chunk ?? '';
    } catch {
        return s; // plain-text chunk
    }
};

const EXAMPLE_PROMPTS = [
    'How many lemonades have been sold this year?',
    'How is Juntos house doing this week vs last week?',
    'Top 5 products at Tasting place this month',
    'Compare revenue by BU in May',
];

// Status text that cycles while waiting for the agent. Sets the expectation
// that the bot is doing real work, not silently hanging.
const STATUS_STEPS = [
    'Reading the question…',
    'Querying the database…',
    'Analyzing the data…',
    'Composing the answer…',
];

const ChatFullscreen = ({ open, onClose }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [statusIdx, setStatusIdx] = useState(0);
    const [showScrollDown, setShowScrollDown] = useState(false);
    const [artifact, setArtifact] = useState(null); // { title, text, question } — opens the left side panel
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

    // Esc closes the artifact panel first (before closing the whole chat).
    useEffect(() => {
        if (!artifact) return;
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setArtifact(null); } };
        window.addEventListener('keydown', onKey, true); // capture: runs before the chat-close handler
        return () => window.removeEventListener('keydown', onKey, true);
    }, [artifact]);

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
    // Update / finalise the trailing assistant message (the one being streamed).
    const patchAssistant = useCallback((patch) => {
        setMessages(m => {
            const copy = m.slice();
            for (let i = copy.length - 1; i >= 0; i--) {
                if (copy[i].role === 'assistant') {
                    copy[i] = { ...copy[i], ...(typeof patch === 'function' ? patch(copy[i]) : patch) };
                    break;
                }
            }
            return copy;
        });
    }, []);

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
        let assistantOpen = false;
        const openAssistant = () => {
            if (assistantOpen) return;
            assistantOpen = true;
            setMessages(m => [...m, { role: 'assistant', text: '', question: message, streaming: true }]);
        };

        try {
            const today = new Date().toISOString().slice(0, 10);
            const res = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' },
                body: JSON.stringify({ message, sessionId: sessionIdRef.current, today, locale: 'en', model: pickModel(message) }),
                signal: ctrl.signal,
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
            }

            const ctype = res.headers.get('content-type') || '';
            const isStream = ctype.includes('text/event-stream') || ctype.includes('stream');

            if (isStream && res.body?.getReader) {
                // ── Real server-side streaming (SSE) ──
                openAssistant();
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let got = false;
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const ln of lines) {
                        const d = extractDelta(ln);
                        if (d) { got = true; patchAssistant(a => ({ text: a.text + d })); }
                    }
                }
                const tail = extractDelta(buffer);
                if (tail) { got = true; patchAssistant(a => ({ text: a.text + tail })); }
                if (!got) throw new Error('Empty streaming response');
                patchAssistant({ streaming: false });
            } else {
                // ── Plain JSON: reveal it progressively for a streaming feel ──
                const data = await res.json();
                const reply = data.reply || data.output || data.text || JSON.stringify(data);
                openAssistant();
                // Reveal by chunks, ~45 steps max, abortable, capped to ~1.3s total.
                const total = reply.length;
                const steps = Math.min(45, Math.max(1, Math.ceil(total / 14)));
                const size = Math.ceil(total / steps);
                for (let i = 0; i < total; i += size) {
                    if (ctrl.signal.aborted) { patchAssistant({ text: reply, streaming: false }); break; }
                    const upto = reply.slice(0, Math.min(total, i + size));
                    patchAssistant({ text: upto });
                    await sleep(Math.max(12, 1300 / steps));
                }
                patchAssistant({ text: reply, streaming: false });
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                if (assistantOpen) patchAssistant(a => ({ streaming: false, text: a.text || '_Response cancelled._', cancelled: !a.text }));
                else setMessages(m => [...m, { role: 'assistant', text: '_Response cancelled._', question: message, cancelled: true }]);
            } else {
                if (assistantOpen) patchAssistant({ streaming: false });
                setError(e.message || String(e));
            }
        } finally {
            setBusy(false);
            abortRef.current = null;
        }
    }, [input, busy, patchAssistant]);

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
        setArtifact(null);
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

    const lastMsg = messages[messages.length - 1];

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
                            title="Start a new conversation"
                        >
                            <Plus className="w-3.5 h-3.5" /> New
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100 transition"
                        title="Close (Esc)"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* Body: chat column (left) + optional artifact panel (right, Claude-style) */}
            <div className="flex-1 flex min-h-0">
                <div className={clsx('flex flex-col min-h-0 min-w-0', artifact ? 'hidden md:flex md:w-[36%] lg:w-[32%] shrink-0' : 'flex-1')}>
                    {/* Messages */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-8 relative">
                {messages.length === 0 && (
                    <div className="max-w-2xl mx-auto text-center mt-8">
                        <Sparkles className="w-10 h-10 text-primary/40 mx-auto mb-4" />
                        <h3 className="font-serif text-2xl text-primary mb-2">What would you like to ask?</h3>
                        <p className="text-sm text-gray-500 mb-8">
                            Ask me about products, transactions, date comparisons and BUs. I keep context across this conversation.
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

                <div className="max-w-5xl mx-auto space-y-6">
                    {messages.map((m, i) => (
                        <MessageBubble
                            key={i}
                            role={m.role}
                            text={m.text}
                            question={m.question}
                            cancelled={m.cancelled}
                            streaming={m.streaming}
                            isLast={i === messages.length - 1}
                            onSuggestion={send}
                            onDrill={send}
                            onOpenArtifact={setArtifact}
                        />
                    ))}
                    {busy && !(lastMsg?.role === 'assistant' && lastMsg?.streaming && lastMsg?.text) && (
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
                                <RefreshCcw className="w-3 h-3" /> Retry
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
                        <ArrowDown className="w-3 h-3" /> Jump down
                    </button>
                )}
            </div>

                    {/* Input bar */}
                    <div className="border-t border-gray-200 bg-white px-4 md:px-8 py-4">
                        <div className="max-w-5xl mx-auto flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        rows={1}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={onKeyDownInput}
                        disabled={busy}
                        placeholder={busy ? 'Waiting for the answer…' : 'Type your question…  (Enter to send · Shift+Enter for new line)'}
                        className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
                        style={{ minHeight: '52px', maxHeight: '200px' }}
                    />
                    {busy ? (
                        <button
                            onClick={cancel}
                            className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm font-medium bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition"
                            title="Stop the response"
                        >
                            <StopCircle className="w-4 h-4" />
                            Stop
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
                            Send
                        </button>
                    )}
                </div>
                        <p className="text-[10px] text-gray-400 text-center mt-2">
                            Answers come from the dashboard's database. AI can make mistakes — verify critical figures.
                        </p>
                    </div>
                </div>

                {artifact && (
                    <ArtifactPanel artifact={artifact} onClose={() => setArtifact(null)} />
                )}
            </div>
        </div>
    );
};

// ─── Rich markdown renderer (shared by chat bubbles and the artifact panel) ──
// Detects ```chart / ```kpi / ```bubble JSON blocks and renders them as visuals,
// and makes table rows clickable to drill in. `onDrill`/`streaming` are optional.
const RichMarkdown = ({ text, onDrill, streaming }) => (
    <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
            code({ inline, className, children, ...props }) {
                if (inline) return <code className={className} {...props}>{children}</code>;
                const lang = (className || '').match(/language-([\w-]+)/)?.[1] || '';
                const raw = String(children).trim();
                const looksLikeChart = ['chart', 'bubble', 'kpi', 'json', ''].includes(lang);
                if (looksLikeChart && raw.startsWith('{') && raw.endsWith('}')) {
                    try {
                        const spec = JSON.parse(raw);
                        const isChartSpec =
                            (['bar', 'line', 'pie', 'doughnut'].includes(spec.type) &&
                                (Array.isArray(spec.labels) || Array.isArray(spec.values) || Array.isArray(spec.datasets))) ||
                            (spec.type === 'bubble' && Array.isArray(spec.bubbles)) ||
                            (spec.type === 'kpi' && Array.isArray(spec.kpis));
                        if (isChartSpec) return <ChatChart spec={spec} onDrill={onDrill} />;
                    } catch {
                        // While streaming, a chart block may still be incomplete —
                        // don't flash a parse error; just hold until it closes.
                        if (streaming && (lang === 'chart' || lang === 'bubble' || lang === 'kpi')) {
                            return null;
                        }
                        if (lang === 'chart' || lang === 'bubble' || lang === 'kpi') {
                            return (
                                <pre className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2">
                                    Invalid chart JSON: {raw.slice(0, 200)}…
                                </pre>
                            );
                        }
                    }
                }
                return <code className={className} {...props}>{children}</code>;
            },
            tr({ children, ...props }) {
                // Click-to-drill: clicking a body row asks a follow-up about its first cell.
                return (
                    <tr
                        {...props}
                        className={onDrill ? 'hover:bg-primary/5 transition-colors' : undefined}
                        onClick={onDrill ? (e) => {
                            if (window.getSelection()?.toString()) return; // don't hijack text selection
                            const cell = e.currentTarget.querySelector('td');
                            const label = cell?.textContent?.trim();
                            if (label) onDrill(`Break down "${label}" in more detail`);
                        } : undefined}
                    >
                        {children}
                    </tr>
                );
            },
        }}
    >
        {text}
    </ReactMarkdown>
);

// ─── Message bubble ────────────────────────────────────────────────────────
const MessageBubble = ({ role, text, question, cancelled, streaming, isLast, onSuggestion, onDrill, onOpenArtifact }) => {
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
    const suggestions = isLast && !cancelled && !isUser && !streaming ? buildSuggestions(question, text) : [];

    return (
        <div className={clsx('flex animate-in fade-in slide-in-from-bottom-2 duration-300', isUser ? 'justify-end' : 'justify-start')}>
            <div
                className={clsx(
                    'rounded-2xl px-4 py-3',
                    isUser
                        ? 'max-w-[85%] bg-primary text-white rounded-br-sm'
                        : 'w-full max-w-full bg-white border border-gray-200 rounded-bl-sm shadow-sm'
                )}
            >
                {isUser ? (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
                ) : (
                    <>
                        {streaming && !text && (
                            <div className="flex items-center gap-1 py-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        )}
                        <div className="markdown-body prose-sm max-w-none">
                            <RichMarkdown text={text} onDrill={onDrill} streaming={streaming} />
                            {streaming && text && (
                                <span className="inline-block w-2 h-4 align-text-bottom bg-primary/60 ml-0.5 animate-pulse rounded-sm" />
                            )}
                        </div>

                        {!cancelled && !streaming && (
                            <div className="flex items-center gap-1 mt-3 pt-2 border-t border-gray-100">
                                <button
                                    onClick={copy}
                                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-primary hover:bg-gray-50 px-2 py-1 rounded-md transition-colors"
                                    title="Copy answer"
                                >
                                    {copied
                                        ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> <span className="text-emerald-700">Copied</span></>
                                        : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                                </button>
                                <button
                                    onClick={() => onOpenArtifact?.({ title: inferredTitle, text, question })}
                                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-primary hover:bg-gray-50 px-2 py-1 rounded-md transition-colors"
                                    title="Open as document (preview + PDF export) on the side"
                                >
                                    <FileText className="w-3.5 h-3.5" /> PDF
                                </button>
                                <button
                                    onClick={() => exportMessageToXLSX(text, { title: inferredTitle, question })}
                                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-primary hover:bg-gray-50 px-2 py-1 rounded-md transition-colors"
                                    title="Download as Excel"
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
    if (has(/week|semana/)) out.push('How does it compare to last week?');
    if (has(/month|january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/)) out.push('And vs the same month in 2025?');
    if (has(/(2025|2026)/)) out.push('Compare it to the previous year');

    // BU-based
    if (has(/juntos house|tasting|picadeli|juntos deli|farm shop|boutique|distribution/)) out.push('Break it down by day');
    if (has(/revenue|sales|ingresos/)) out.push('Show me transaction volume too');
    if (has(/transactions|tickets|pax|orders|transacciones|órdenes/)) out.push('And revenue by BU');

    // Product-based
    if (has(/product|top|sold|lemonade|limonada/)) out.push('Show me a chart');
    if (has(/lemonade|beer|chicken|pita|hummus|limonada|pollo/)) out.push('How many were sold last month?');

    // Default for empty
    if (!out.length) out.push('Show me a chart', 'Compare it to last year');

    // Dedupe + cap to 3
    return [...new Set(out)].slice(0, 3);
};

// ─── Artifact side panel (left) — Claude-style document view ────────────────
const ArtifactPanel = ({ artifact, onClose }) => {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(artifact.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard can be blocked on non-https */ }
    };
    return (
        <div className="w-full md:flex-1 min-w-0 border-l border-gray-200 bg-gray-100 flex flex-col min-h-0 animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 bg-white">
                <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm font-serif text-primary truncate" title={artifact.title}>{artifact.title || 'Document'}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={() => exportMessageToPDF(artifact.text, { title: artifact.title })}
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600 hover:text-primary border border-gray-200 hover:border-primary/40 px-2 py-1 rounded-md transition-colors"
                        title="Download PDF"
                    >
                        <FileText className="w-3.5 h-3.5" /> PDF
                    </button>
                    <button
                        onClick={() => exportMessageToXLSX(artifact.text, { title: artifact.title, question: artifact.question })}
                        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600 hover:text-primary border border-gray-200 hover:border-primary/40 px-2 py-1 rounded-md transition-colors"
                        title="Download Excel"
                    >
                        <Sheet className="w-3.5 h-3.5" /> Excel
                    </button>
                    <button onClick={copy} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-600 hover:text-primary px-2 py-1 rounded-md transition-colors" title="Copy text">
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-md hover:bg-gray-100 transition" title="Close document">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-auto p-4 md:p-6">
                <div className="bg-white shadow-sm border border-gray-200 rounded-lg mx-auto max-w-[900px] p-6 md:p-8 markdown-body prose-sm">
                    <RichMarkdown text={artifact.text} />
                </div>
            </div>
        </div>
    );
};

export default ChatFullscreen;
