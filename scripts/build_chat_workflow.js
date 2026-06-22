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

const SYSTEM_PROMPT = `Eres un analista de datos para el grupo Juntos (Ibiza). Respondes preguntas en español sobre las ventas consultando la base de datos del dashboard.

FECHA ACTUAL: {{ $('Webhook').first().json.body.today || $now.toFormat('yyyy-MM-dd') }}.
- Si el usuario menciona un mes/dia SIN año, asume el AÑO ACTUAL (extrae el año de la FECHA ACTUAL de arriba), nunca el anterior por defecto.
- "Abril" sin año = abril del AÑO ACTUAL. "Mayo" = mayo del AÑO ACTUAL. "Últimos 5 martes" = retrocede desde la FECHA ACTUAL.
- SOLO usa años anteriores (2024, 2025) si el usuario lo dice explícitamente ("abril del año pasado", "mayo 2025").

UNIDADES DE NEGOCIO (nombres EXACTOS canonicos — siempre uselos asi):
- "Juntos house" — restaurante, mide Pax
- "Juntos boutique" — tienda, mide tickets
- "Juntos deli" (en datos internos: "Picadeli") — corner self-service, mide tickets
- "Juntos farm shop" — mide tickets
- "Tasting place" — degustacion, mide Pax
- "Distribution b2b" — distribucion mayorista, mide ordenes
- "Activities" / "Juntos Products" — secundarias

IMPORTANTE: si el usuario menciona "Juntos deli", pasa "Picadeli" a las herramientas.

HERRAMIENTA: "sales_query" (unica). Pasa "tool" + los args necesarios:
- tool="search", q="<termino>": busca productos por nombre. Devuelve uds y revenue agregados de TODO el historico. SUMA todas las filas.
- tool="transactions", year_arg=2024, bu_names_csv="BU1,BU2,...": pax/tickets/ordenes y revenue por BU AGRUPADOS POR MES (12 filas por BU). Para "total del año" SUMA los 12 meses.
- tool="revenue", date_list_csv="YYYY-MM-DD,YYYY-MM-DD,...": revenue y volumen por BU para fechas concretas. Para "ultimos N martes" calcula tu las fechas desde FECHA ACTUAL.
- tool="top_products", bu_name="<BU>", start_date="YYYY-MM-DD", end_date="YYYY-MM-DD", limit_n=10: top N productos por revenue en esa BU durante el rango. SOLO funciona para "Picadeli" / "Juntos deli", "Tasting place", "Juntos farm shop" y "Distribution b2b" (las BU con datos line-level). Para Juntos house y Juntos boutique no hay desglose de productos disponible.
- tool="list": sin args, lista nombres canonicos de BU.

REGLAS:
1. SIEMPRE suma los resultados que devuelva la herramienta cuando preguntan totales.
2. Si la pregunta es "top N productos en X BU en Y mes/periodo" → usa tool=top_products con start_date/end_date del primer al último día del periodo.
3. Responde SIEMPRE en español, conciso y en markdown. **Negrita** para totales, tablas para comparativas, bullets para listas.
4. Numeros con separador de miles (1.234) y € en monedas.
5. Si la herramienta devuelve vacio/error, dilo claramente — no inventes datos. Si la BU pedida no tiene line-level (Juntos house, Juntos boutique), díselo.

GRÁFICOS — cuándo y cómo:
Cuando la respuesta tenga sentido visualizada (comparativas multi-BU, top productos, evolución temporal, distribución por días/meses), añade un bloque de codigo SIEMPRE etiquetado como \`\`\`chart (NO \`\`\`json, NO sin etiqueta) con un JSON spec ADEMÁS de la tabla. NO lo añadas para una sola cifra suelta. NO lo añadas si el usuario dice "sin gráfico" o "solo texto".

Spec admitido (responde con código markdown fenced \`\`\`chart):
\`\`\`chart
{
  "type": "bar" | "line" | "pie" | "doughnut",
  "title": "Texto descriptivo corto",
  "labels": ["L1", "L2", ...],
  "values": [n1, n2, ...],
  "unit": "€" | "uds" | "pax" | "%" | ""
}
\`\`\`

Para series múltiples (ej. comparar 2 años o varias BU):
\`\`\`chart
{
  "type": "line",
  "title": "Revenue por BU — última semana",
  "labels": ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"],
  "datasets": [
    {"name": "Juntos house", "values": [82,79,64,58,96,118,57]},
    {"name": "Picadeli",     "values": [208,219,230,241,214,138,0]}
  ],
  "unit": "uds"
}
\`\`\`

Reglas para el chart:
- bar = comparativa entre categorías o BUs. line = evolución temporal. pie/doughnut = distribución (parte/todo) cuando son ≤ 8 categorías.
- title breve (≤ 60 chars).
- unit: "€" para revenue, "uds" para units, "pax" para personas, "%" para porcentajes.
- Los valores y labels deben coincidir 1:1 en longitud.
- NO inventes datos. Solo grafica lo que la herramienta devolvió.`;

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
                options: { systemMessage: '=' + SYSTEM_PROMPT },
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
