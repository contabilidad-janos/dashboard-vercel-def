#!/usr/bin/env node
/**
 * Idempotent builder for the chat AI workflow in n8n.
 *
 * Topology:
 *   Webhook POST /webhook/sales-chat
 *     → AI Agent (langchain v1.7)
 *         ├── LM: OpenRouter google/gemini-3.1-flash-lite
 *         ├── Memory: bufferWindow per sessionId
 *         └── Tool: sales_query  (subworkflow @n8n/n8n-nodes-langchain.toolWorkflow)
 *                      → dispatcher subworkflow (see build_chat_tool_subworkflow.js)
 *                      → Supabase RPCs:
 *                          chat_search_products / chat_transactions_by_bu /
 *                          chat_revenue_for_dates / chat_list_business_units
 *     → Respond to Webhook
 *
 * Why toolWorkflow instead of four toolHttpRequest nodes: the latter triggers
 * a schema-validation bug in @n8n/n8n-nodes-langchain that rejects every tool
 * call. The single subworkflow + $fromAI() params bypasses it cleanly.
 *
 * Run:
 *   N8N_KEY=<jwt> node scripts/build_chat_workflow.js
 */

import https from 'https';

const N8N_HOST = 'n8n.juntosfarmn8n.cloud';
const N8N_KEY = process.env.N8N_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZTUxOGRiOS01MzVkLTRiMDMtYjk5Zi0xM2QyOWI3YzVkMzQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZTBiZDljM2MtZDZmNi00MmU5LWJkYmItNjcxNTkyYjA0YzM5IiwiaWF0IjoxNzczMDAwMDcwfQ.t0VchsyvDrgYIVzuq0EClvp1nipbuZIJgM9IRsRqDBA';

const WEBHOOK_PATH = 'sales-chat';
const MODEL = 'z-ai/glm-5.2';
const DISPATCHER_ID = '8Pvf8ZyvgBSirdN6'; // Sub-workflow id created by build_chat_tool_subworkflow.js
const DISPATCHER_NAME = 'SALES DASHBOARD - Chat Tool Dispatcher';

const SYSTEM_PROMPT = `You are a data analyst for the Juntos group (Ibiza). You answer questions in English about sales by querying the dashboard's database.

LANGUAGE: Always answer in English (en), regardless of the language of the user's question. Even if the user writes in Spanish, reply in English. The frontend sets locale="en".

TODAY: {{ $('Webhook').first().json.body.today || $now.toFormat('yyyy-MM-dd') }}.
- If the user mentions a month/day WITHOUT a year, assume the CURRENT YEAR (extract the year from TODAY above), never the previous one by default.
- "April" without a year = April of the CURRENT YEAR. "May" = May of the CURRENT YEAR. "Last 5 Tuesdays" = walk back from TODAY.
- Only use previous years (2024, 2025) if the user says so explicitly ("April last year", "May 2025").

BUSINESS UNITS (exact canonical names — always use them this way):
- "Juntos house" — restaurant, measured in Pax (covers)
- "Juntos boutique" — retail shop, measured in tickets
- "Juntos deli" (internal name: "Picadeli") — self-service corner, measured in tickets
- "Juntos farm shop" — measured in tickets
- "Tasting place" — tasting/events, measured in Pax
- "Distribution b2b" — wholesale distribution, measured in orders
- "Activities" / "Juntos Products" — secondary BUs

IMPORTANT: if the user mentions "Juntos deli", pass "Picadeli" to the tools.

TOOL: "sales_query" (single tool). Pass "tool" + the required args:
- tool="search", q="<term>": product search by name. Returns units and revenue aggregated over the whole history. Always SUM all rows it returns.
- tool="transactions", year_arg=2024, bu_names_csv="BU1,BU2,...": pax/tickets/orders and revenue per BU GROUPED BY MONTH (12 rows per BU). For "year total" SUM the 12 months.
- tool="revenue", date_list_csv="YYYY-MM-DD,YYYY-MM-DD,...": revenue and volume per BU for explicit dates. For "last N Tuesdays" YOU compute the dates starting from TODAY. CRITICAL: for a date RANGE or a "this week vs last week" comparison, compute ALL the dates yourself (e.g. all 14 days of both weeks) and pass them in ONE single call as one comma-separated date_list_csv. NEVER call this tool once per day or once per week — a single call must contain every date you need.
- tool="top_products", bu_name="<BU>", start_date="YYYY-MM-DD", end_date="YYYY-MM-DD", limit_n=10: top N products by revenue in that BU during the range. Only works for "Picadeli" / "Juntos deli", "Tasting place", "Juntos farm shop", "Distribution b2b" (line-level BUs). For Juntos house and Juntos boutique there is no product-level breakdown available.
- tool="list": no args, returns canonical BU names.

RESPONSE RULES:
1. ALWAYS sum the rows the tool returns when the user asks for totals.
2. If the question is "top N products in X BU in Y month/period" → use tool=top_products with start_date/end_date covering the first and last day of the period.
3. Reply in English, concise, in markdown.
4. NUMBER FORMAT: English style. Comma as thousands separator, dot as decimal: "1,234"; "1,234.56"; "€12,391". The € symbol goes BEFORE the number (€12,391), not after. Never use "$".
5. If the tool returns empty or an error, say so clearly — don't invent data. If the requested BU has no line-level data (Juntos house, Juntos boutique), tell the user.
6. MINIMIZE tool calls — you have a limited budget per question. Batch everything into as few calls as possible: all dates in ONE revenue call, all BUs in ONE transactions call. Do NOT loop calling the same tool repeatedly; if you already have the data, compose the answer.

RECOMMENDED STRUCTURE for each answer:
- **Headline** (1 line): the most important number/conclusion in **bold** at the top. e.g. "**Juntos house in May: €247,281 (+38% vs April).**"
- **KPI tiles** (optional): when the answer revolves around 2-4 key numbers (e.g. revenue, growth %, best day, transactions), add a fenced \`\`\`kpi block right after the headline (see KPI TILES section). Max 4 tiles.
- **Table** (when it makes sense): for comparing BUs, listing top products, or breaking down by day/month. Concise headers. Numeric alignment to the right (markdown GFM with \`---:\`).
- **Chart** (when it adds visual value, see CHARTS section below): always tagged as \`\`\`chart with the JSON spec.
- **Closing insight** (1-2 sentences): useful observation with an optional emoji. e.g. "📈 Saturday was the strongest day (€22,344)". ALWAYS proactively flag the single most notable anomaly/outlier (a day, BU or product that deviates strongly up or down) with ⚠️ when one exists, e.g. "⚠️ Distribution b2b is down −15% vs last month — check for pending orders".

AVOID:
- Starting by repeating the user's question.
- Long paragraphs without structure.
- Stating the headline 3 times in different formats.
- Numbers without context (€140k on its own says nothing — vs what?).

CHARTS — when and how:
When the answer benefits from a visual (multi-BU comparison, top products, time evolution, distribution by day/month), add a code block ALWAYS tagged as \`\`\`chart (NOT \`\`\`json, NOT untagged) with a JSON spec ALONGSIDE the table. Do NOT add a chart for a single isolated number. Do NOT add it if the user says "no chart" or "text only".

Accepted spec (reply with a fenced \`\`\`chart code block):
\`\`\`chart
{
  "type": "bar" | "line" | "pie" | "doughnut",
  "title": "Short descriptive text",
  "labels": ["L1", "L2", ...],
  "values": [n1, n2, ...],
  "unit": "€" | "uds" | "pax" | "%" | ""
}
\`\`\`

For multiple series (e.g. comparing 2 years or several BUs):
\`\`\`chart
{
  "type": "line",
  "title": "Revenue by BU — last week",
  "labels": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],
  "datasets": [
    {"name": "Juntos house", "values": [82,79,64,58,96,118,57]},
    {"name": "Picadeli",     "values": [208,219,230,241,214,138,0]}
  ],
  "unit": "uds"
}
\`\`\`

For comparing MANY entities at once where each also has a GROWTH figure (all BUs side by side, or top products, showing both size AND whether each is up or down), use a BUBBLE chart — size = amount, colour = growth (green up / red down):
\`\`\`chart
{
  "type": "bubble",
  "title": "BU performance — this week vs last",
  "unit": "€",
  "bubbles": [
    {"label": "Juntos house",   "value": 43440, "change": -12},
    {"label": "Tasting place",  "value": 18200, "change": 24},
    {"label": "Juntos deli",    "value": 9100,  "change": 3},
    {"label": "Juntos boutique","value": 6400,  "change": -8}
  ],
  "drill": "How is {label} doing day by day?"
}
\`\`\`

KPI TILES — fenced \`\`\`kpi block for 2-4 headline metrics:
\`\`\`kpi
{
  "type": "kpi",
  "kpis": [
    {"label": "Revenue",      "value": 247281, "unit": "€",   "change": 38},
    {"label": "Best day",     "value": "Sat",  "hint": "€22,344"},
    {"label": "Transactions", "value": 1820,   "unit": "pax", "change": -4}
  ]
}
\`\`\`
- value = a number (auto-formatted) or a short string. change = % vs the comparison period (optional; drives the up/down arrow + colour). hint = small caption (optional). Max 4 tiles.

Chart rules:
- bar = comparison across categories or BUs. line = time evolution. pie/doughnut = part-of-whole distribution when ≤ 8 categories.
- bubble = ≥ 4 entities AND you have a growth/change % for each one. If you have no change figure, use bar instead.
- title short (≤ 60 chars), in English.
- Optional "drill" field on any chart: a question template containing {label}. Clicking a bar/segment/bubble (or a table row) sends it as a follow-up, with {label} replaced by the clicked item. e.g. "drill": "Break down {label} by day".
- unit: "€" for revenue, "uds" for units, "pax" for people, "%" for percentages.
- values and labels must match 1:1 in length.
- Don't invent data. Only chart what the tool returned.`;

function buildWorkflow() {
    const nodes = [
        // 1. Webhook trigger
        {
            parameters: {
                httpMethod: 'POST',
                path: WEBHOOK_PATH,
                responseMode: 'responseNode',
                options: {},
            },
            id: 'webhook-trigger',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 2,
            position: [-400, 0],
            webhookId: 'sales-chat-webhook',
        },

        // 2. AI Agent — systemMessage prefixed with '=' so n8n evaluates the
        //               {{ $('Webhook').first().json.body.today }} expression
        //               inside it. Otherwise the literal expression text reaches
        //               the model and it falls back to its training-data year.
        {
            parameters: {
                promptType: 'define',
                text: '={{ $json.body.message }}',
                options: { systemMessage: '=' + SYSTEM_PROMPT, maxIterations: 25 },
            },
            id: 'ai-agent',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1.7,
            position: [-150, 0],
        },

        // 3. LM — OpenRouter / Gemini 3.1 Flash Lite
        {
            parameters: {
                model: MODEL,
                options: { temperature: 0.2 },
            },
            id: 'lm-openrouter',
            name: 'Gemini 3 Flash (OpenRouter)',
            type: '@n8n/n8n-nodes-langchain.lmChatOpenRouter',
            typeVersion: 1,
            position: [-320, 220],
        },

        // 4. Memory
        {
            parameters: {
                sessionIdType: 'customKey',
                sessionKey: '={{ $(\'Webhook\').first().json.body.sessionId || \'default\' }}',
                contextWindowLength: 8,
            },
            id: 'memory-buffer',
            name: 'Memoria por sesión',
            type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
            typeVersion: 1.3,
            position: [-150, 220],
        },

        // 5. Single tool: dispatcher subworkflow
        {
            parameters: {
                name: 'sales_query',
                description: 'Consulta la base de datos de ventas. Pasa "tool" + los args necesarios:\n- tool="search", q="<producto>": busca productos por nombre (LIMONADA, CERVEZA, ...).\n- tool="transactions", year_arg=2024, bu_names_csv="Juntos house,Tasting place": transacciones por BU y mes. bu_names_csv vacio = todas las BU.\n- tool="revenue", date_list_csv="2026-05-12,2026-05-05": revenue por BU para fechas concretas.\n- tool="list": lista nombres canonicos de BU.\nUsa "Picadeli" si el usuario dice "Juntos deli".',
                workflowId: { __rl: true, value: DISPATCHER_ID, mode: 'list', cachedResultName: DISPATCHER_NAME },
                workflowInputs: {
                    mappingMode: 'defineBelow',
                    value: {
                        tool: "={{ $fromAI('tool', 'Acción: search, transactions, revenue, top_products o list', 'string') }}",
                        q: "={{ $fromAI('q', 'Para tool=search: termino del producto. Vacio para otras tools.', 'string', '') }}",
                        year_arg: "={{ $fromAI('year_arg', 'Para tool=transactions: año entero (2024, 2025). 0 para otras tools.', 'number', 0) }}",
                        bu_names_csv: "={{ $fromAI('bu_names_csv', 'Para tool=transactions: BU separadas por coma. Vacio para todas.', 'string', '') }}",
                        date_list_csv: "={{ $fromAI('date_list_csv', 'Para tool=revenue: fechas YYYY-MM-DD separadas por coma.', 'string', '') }}",
                        bu_name: "={{ $fromAI('bu_name', 'Para tool=top_products: una sola BU (ej. \"Tasting place\", \"Picadeli\", \"Juntos farm shop\", \"Distribution b2b\").', 'string', '') }}",
                        start_date: "={{ $fromAI('start_date', 'Para tool=top_products: fecha inicio YYYY-MM-DD (incluida).', 'string', '') }}",
                        end_date: "={{ $fromAI('end_date', 'Para tool=top_products: fecha fin YYYY-MM-DD (incluida).', 'string', '') }}",
                        limit_n: "={{ $fromAI('limit_n', 'Para tool=top_products: cuantos productos devolver (5, 10, 20).', 'number', 10) }}",
                    },
                    matchingColumns: [],
                    schema: [
                        { id: 'tool', displayName: 'tool', required: true, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
                        { id: 'q', displayName: 'q', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
                        { id: 'year_arg', displayName: 'year_arg', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
                        { id: 'bu_names_csv', displayName: 'bu_names_csv', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
                        { id: 'date_list_csv', displayName: 'date_list_csv', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
                        { id: 'bu_name', displayName: 'bu_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
                        { id: 'start_date', displayName: 'start_date', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
                        { id: 'end_date', displayName: 'end_date', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
                        { id: 'limit_n', displayName: 'limit_n', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
                    ],
                    attemptToConvertTypes: false,
                    convertFieldsToString: false,
                },
            },
            id: 'tool-dispatcher',
            name: 'sales_query',
            type: '@n8n/n8n-nodes-langchain.toolWorkflow',
            typeVersion: 2.2,
            position: [200, 220],
        },

        // 6. Respond to Webhook
        {
            parameters: {
                respondWith: 'json',
                responseBody: '={{ { reply: $json.output, sessionId: $(\'Webhook\').first().json.body.sessionId } }}',
                options: {},
            },
            id: 'respond',
            name: 'Respond to Webhook',
            type: 'n8n-nodes-base.respondToWebhook',
            typeVersion: 1.1,
            position: [120, 0],
        },
    ];

    const connections = {
        'Webhook':                       { main: [[{ node: 'AI Agent', type: 'main', index: 0 }]] },
        'AI Agent':                      { main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]] },
        'Gemini 3 Flash (OpenRouter)':   { ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]] },
        'Memoria por sesión':            { ai_memory: [[{ node: 'AI Agent', type: 'ai_memory', index: 0 }]] },
        'sales_query':                   { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] },
    };

    return {
        name: 'SALES DASHBOARD - Chat AI (Gemini 3 Flash)',
        nodes,
        connections,
        settings: { executionOrder: 'v1' },
    };
}

function n8nRequest(method, path, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const req = https.request({
            method,
            host: N8N_HOST,
            path,
            headers: {
                'X-N8N-API-KEY': N8N_KEY,
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            },
            timeout: 30000,
        }, (res) => {
            let chunks = '';
            res.on('data', d => { chunks += d; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(chunks)); } catch { resolve(chunks); }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 500)}`));
                }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

(async () => {
    const workflow = buildWorkflow();
    console.log('Looking up existing workflow by name...');
    let existingId = null;
    let existingCreds = null;
    try {
        const list = await n8nRequest('GET', '/api/v1/workflows?limit=100', null);
        const match = (list.data || []).find(w => w.name === workflow.name);
        if (match) {
            existingId = match.id;
            const full = await n8nRequest('GET', `/api/v1/workflows/${existingId}`, null);
            const lm = (full.nodes || []).find(n => n.type === '@n8n/n8n-nodes-langchain.lmChatOpenRouter');
            if (lm && lm.credentials) existingCreds = lm.credentials;
        }
    } catch (e) {
        console.warn('Workflow lookup failed:', e.message);
    }

    if (existingCreds) {
        console.log('Preserving existing OpenRouter credential binding.');
        const lm = workflow.nodes.find(n => n.type === '@n8n/n8n-nodes-langchain.lmChatOpenRouter');
        lm.credentials = existingCreds;
    }

    try {
        if (existingId) {
            console.log(`Updating workflow ${existingId}...`);
            const r = await n8nRequest('PUT', `/api/v1/workflows/${existingId}`, workflow);
            console.log(`OK. Updated ${r.id} — active=${r.active}`);
            try {
                await n8nRequest('POST', `/api/v1/workflows/${existingId}/activate`, null);
                console.log('Workflow re-activated.');
            } catch (e) {
                console.warn('Activation failed:', e.message);
            }
        } else {
            console.log('Creating new workflow...');
            const r = await n8nRequest('POST', '/api/v1/workflows', workflow);
            console.log(`OK. Workflow ID: ${r.id} — Name: ${r.name}`);
            console.log(`\nWebhook URL (after activation): https://${N8N_HOST}/webhook/${WEBHOOK_PATH}`);
        }
    } catch (e) {
        console.error('FAIL:', e.message);
        process.exit(1);
    }
})();
