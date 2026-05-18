import React from 'react';
import {
    GlassWater, ScanLine, FileSpreadsheet, Download, Cog, Database,
    BarChart3, MessageSquare, Webhook, Sparkles, Wrench, Send,
    FileText, ArrowDown,
} from 'lucide-react';

// Visual explainer of the end-to-end pipeline:
// physical sale → ICG → CSV exports → importer scripts → Supabase
// → dashboard + chat agent → user gets an answer in markdown / PDF / XLSX.
// Built to show stakeholders without leaving the dashboard.

const CAPTURE_FLOW = [
    {
        icon: GlassWater,
        title: 'Cliente compra una limonada',
        desc: 'Un cliente pide una limonada en Juntos deli (o cualquier outlet del grupo).',
        badge: 'Físico',
        tone: 'beige',
    },
    {
        icon: ScanLine,
        title: 'TPV del outlet la registra',
        desc: 'El front-retail genera el ticket con producto, precio, hora y método de pago.',
        badge: 'TPV',
        tone: 'beige',
    },
    {
        icon: FileSpreadsheet,
        title: 'La venta llega a ICG',
        desc: 'El TPV sincroniza la venta al sistema contable ICG, que la consolida con el resto de operaciones del día.',
        badge: 'ICG',
        tone: 'beige',
    },
    {
        icon: Download,
        title: 'Janos descarga los reports',
        desc: 'Cada semana se exportan los CSV de ICG: Sheet5 (revenue diario por BU), VENTAS PICADELI y VENTAS CAN ESCARRER (line-level por producto).',
        badge: 'CSV',
        tone: 'beige',
    },
    {
        icon: Cog,
        title: 'Importer scripts procesan',
        desc: 'Scripts Node.js (import_sheet5.js, import_picadeli.js, import_can_escarrer.js) normalizan nombres, deduplican vía row_hash y hacen upsert idempotente.',
        badge: 'Node.js',
        tone: 'green',
    },
    {
        icon: Database,
        title: 'Supabase guarda los datos',
        desc: 'Postgres con RLS. Tablas: sales_daily_def (revenue/uds diarios), picadeli_sales y can_escarrer_sales (línea de factura), sales_records (pax/tickets/órdenes).',
        badge: 'Supabase',
        tone: 'green',
    },
    {
        icon: BarChart3,
        title: 'El dashboard lo visualiza',
        desc: 'React + Vite + ChartJS dibujan los KPIs, comparativas YoY y la pestaña Best Selling Products en tiempo real.',
        badge: 'React',
        tone: 'green',
    },
];

const CHAT_FLOW = [
    {
        icon: MessageSquare,
        title: 'Usuario pregunta',
        desc: '"¿Cuántas limonadas se han vendido?". Se envía como POST al webhook n8n con la sessionId del navegador.',
        badge: 'Frontend',
        tone: 'orange',
    },
    {
        icon: Webhook,
        title: 'Webhook n8n recibe',
        desc: 'El workflow "SALES DASHBOARD - Chat AI" arranca y pasa el mensaje al AI Agent.',
        badge: 'n8n',
        tone: 'orange',
    },
    {
        icon: Sparkles,
        title: 'AI Agent decide qué tool usar',
        desc: 'Gemini 3.1 Flash Lite (vía OpenRouter) lee el system prompt y elige la tool sales_query con tool="search", q="LIMONADA".',
        badge: 'Gemini 3 + OpenRouter',
        tone: 'orange',
    },
    {
        icon: Wrench,
        title: 'Dispatcher ejecuta la query',
        desc: 'Un sub-workflow n8n route a la RPC correcta. Para "search" llama chat_search_products(q) en Supabase.',
        badge: 'Sub-workflow',
        tone: 'orange',
    },
    {
        icon: Database,
        title: 'Supabase devuelve los datos',
        desc: 'La RPC busca ILIKE "%LIMONADA%" en picadeli_sales + can_escarrer_sales (index GIN trigram) y agrupa por producto.',
        badge: 'Postgres RPC',
        tone: 'green',
    },
    {
        icon: Send,
        title: 'Gemini formatea la respuesta',
        desc: 'El modelo recibe los rows, los suma y devuelve markdown estilizado con tabla y total destacado.',
        badge: 'Gemini 3',
        tone: 'orange',
    },
    {
        icon: FileText,
        title: 'Usuario recibe la respuesta',
        desc: '"1.233 unidades de limonada, €7.308". Puede descargarla como PDF o Excel con un click (generado client-side).',
        badge: 'PDF + XLSX',
        tone: 'orange',
    },
];

const TONE_STYLES = {
    beige:  { card: 'bg-[#F2EBE0] border-[#E0D4BD]', badge: 'bg-[#B09B80] text-white', icon: 'text-[#7B6D58] bg-white' },
    green:  { card: 'bg-[#E8EFE8] border-[#C8D6C9]', badge: 'bg-[#6E8C71] text-white', icon: 'text-[#3D4C41] bg-white' },
    orange: { card: 'bg-[#FBE9DC] border-[#F3CFB3]', badge: 'bg-[#D9825F] text-white', icon: 'text-[#A4583A] bg-white' },
};

const Step = ({ step, index, last }) => {
    const Icon = step.icon;
    const styles = TONE_STYLES[step.tone] || TONE_STYLES.green;
    return (
        <div className="relative flex gap-5 items-start">
            {/* Number + vertical connector */}
            <div className="flex flex-col items-center flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-serif text-sm font-semibold shadow-sm">
                    {index + 1}
                </div>
                {!last && <div className="w-px flex-1 bg-gradient-to-b from-primary/30 to-primary/5 mt-2 min-h-[40px]" />}
            </div>

            {/* Content card */}
            <div className={`flex-1 rounded-xl border p-5 mb-6 ${styles.card}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${styles.icon}`}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <h3 className="font-serif text-lg text-primary leading-tight">{step.title}</h3>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${styles.badge}`}>
                        {step.badge}
                    </span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed mt-1 ml-13">{step.desc}</p>
            </div>
        </div>
    );
};

const Section = ({ title, subtitle, kicker, steps }) => (
    <section className="mb-16">
        <div className="mb-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent mb-2">{kicker}</p>
            <h2 className="text-3xl md:text-4xl font-serif text-primary mb-2">{title}</h2>
            <p className="text-sm text-gray-600 max-w-2xl">{subtitle}</p>
        </div>
        <div className="max-w-3xl mx-auto">
            {steps.map((s, i) => (
                <Step key={i} step={s} index={i} last={i === steps.length - 1} />
            ))}
        </div>
    </section>
);

const Bridge = () => (
    <div className="max-w-3xl mx-auto -mt-10 mb-12 flex items-center gap-4 px-5">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
        <div className="flex flex-col items-center text-gray-400">
            <ArrowDown className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-wider mt-1">Datos en Supabase</span>
            <ArrowDown className="w-4 h-4 mt-1" />
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
    </div>
);

const StackBadge = ({ label, sub }) => (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-center min-w-[140px]">
        <div className="font-serif text-primary text-sm">{label}</div>
        {sub && <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{sub}</div>}
    </div>
);

const Architecture = () => {
    return (
        <div className="animate-in fade-in duration-500 pb-12">
            {/* Hero */}
            <header className="text-center max-w-3xl mx-auto mb-16">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent mb-3">
                    Cómo funciona
                </p>
                <h1 className="text-4xl md:text-5xl font-serif text-primary mb-4 leading-tight">
                    El viaje de una limonada
                </h1>
                <p className="text-base text-gray-600 leading-relaxed">
                    Desde que un cliente la pide en el mostrador hasta que el equipo le pregunta al
                    asistente cuántas se han vendido. Dos flujos que conectan tienda física, contabilidad
                    e inteligencia artificial.
                </p>
            </header>

            {/* Flow 1: Capture */}
            <Section
                kicker="Fase 1 · Captura de datos"
                title="De la venta física a la base de datos"
                subtitle="Cada venta se registra en el TPV, sube a ICG, baja en CSV una vez por semana, los scripts la normalizan y la guardan en Supabase. Latencia típica: 3-7 días."
                steps={CAPTURE_FLOW}
            />

            <Bridge />

            {/* Flow 2: Chat */}
            <Section
                kicker="Fase 2 · Consulta inteligente"
                title="De la pregunta a la respuesta"
                subtitle="El asistente Juntos Inteligence orquesta el modelo, las herramientas y la base de datos en tiempo real. Respuesta típica en 3-5 segundos."
                steps={CHAT_FLOW}
            />

            {/* Stack at a glance */}
            <section className="max-w-5xl mx-auto mt-8">
                <div className="text-center mb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent mb-2">
                        Stack
                    </p>
                    <h2 className="text-2xl font-serif text-primary">Tecnología por debajo</h2>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                    <StackBadge label="ICG" sub="Contabilidad" />
                    <StackBadge label="CSV exports" sub="Semanal" />
                    <StackBadge label="Node.js" sub="Importers" />
                    <StackBadge label="Supabase" sub="Postgres + RLS" />
                    <StackBadge label="React + Vite" sub="Dashboard" />
                    <StackBadge label="ChartJS" sub="Visualización" />
                    <StackBadge label="n8n" sub="Orquestación IA" />
                    <StackBadge label="Gemini 3 Flash" sub="OpenRouter" />
                    <StackBadge label="jsPDF + XLSX" sub="Exports cliente" />
                </div>
            </section>

            {/* Footnote — latency / costs */}
            <section className="max-w-4xl mx-auto mt-12 grid md:grid-cols-3 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="text-3xl font-serif text-primary mb-1">~7 días</div>
                    <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Latencia datos</div>
                    <p className="text-xs text-gray-600">Desde la venta en el TPV hasta que aparece en el dashboard. Limitado por la frecuencia del export ICG.</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="text-3xl font-serif text-primary mb-1">~4 seg</div>
                    <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Respuesta IA</div>
                    <p className="text-xs text-gray-600">Gemini 3.1 Flash decide la herramienta, consulta Supabase y formatea la respuesta en markdown.</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="text-3xl font-serif text-primary mb-1">€0,002</div>
                    <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Coste por consulta</div>
                    <p className="text-xs text-gray-600">A precio actual de OpenRouter ($0.25 input / $1.50 output por millón de tokens).</p>
                </div>
            </section>
        </div>
    );
};

export default Architecture;
