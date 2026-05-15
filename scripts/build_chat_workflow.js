#!/usr/bin/env node
/**
 * Build + POST the AI chat workflow to n8n.
 *
 * What it creates in n8n:
 *   1. Webhook trigger (POST /webhook/sales-chat) — body { message, sessionId }
 *   2. AI Agent (langchain) with a Spanish system prompt
 *   3. LM: OpenRouter → google/gemini-3-flash-preview
 *   4. Memory Buffer Window keyed by sessionId
 *   5. Four HTTP Request Tools that call the Supabase RPC functions
 *      created in scripts/create_chat_rpcs.sql
 *   6. Respond to Webhook with the agent text output
 *
 * Run:
 *   N8N_KEY=<jwt> node scripts/build_chat_workflow.js
 *
 * After the workflow is created, the OpenRouter credential must be wired
 * up in the n8n UI (it can't be assigned blind from the API without the
 * credential's internal id). The script prints next steps at the end.
 */

import https from 'https';

const N8N_HOST = 'n8n.juntosfarmn8n.cloud';
const N8N_KEY = process.env.N8N_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZTUxOGRiOS01MzVkLTRiMDMtYjk5Zi0xM2QyOWI3YzVkMzQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZTBiZDljM2MtZDZmNi00MmU5LWJkYmItNjcxNTkyYjA0YzM5IiwiaWF0IjoxNzczMDAwMDcwfQ.t0VchsyvDrgYIVzuq0EClvp1nipbuZIJgM9IRsRqDBA';

const SUPABASE_URL = 'https://agjvhvjhrmwkvszyjitl.supabase.co';
const SUPABASE_ANON = 'sb_publishable_cCZyt6Ty-V7OQ9hKwH8geQ_29UkfEI-';

const WEBHOOK_PATH = 'sales-chat';

const SYSTEM_PROMPT = `Eres un analista de datos para el grupo Juntos (Ibiza). Respondes preguntas en español sobre las ventas de las distintas unidades de negocio (BU) consultando la base de datos del dashboard.

UNIDADES DE NEGOCIO (nombres EXACTOS canónicos — siempre úsalos así):
- "Juntos house" — restaurante, mide Pax (personas)
- "Juntos boutique" — tienda, mide tickets
- "Juntos deli" (en datos internos: "Picadeli") — corner self-service, mide tickets
- "Juntos farm shop" — mide tickets
- "Tasting place" — degustación, mide Pax
- "Distribution b2b" — distribución mayorista, mide órdenes/pedidos
- "Activities" / "Juntos Products" — secundarias

IMPORTANTE: cuando el usuario diga "Juntos deli" en su pregunta, pásale "Picadeli" a las herramientas (es el nombre interno en la base).

HERRAMIENTAS DISPONIBLES:
- chat_search_products(q): busca productos por nombre (case-insensitive, parcial). Devuelve uds vendidas y revenue totales agregados desde inicio del histórico, separados por origen ("picadeli" o "can_escarrer"). Útil para "cuántos X se han vendido".
- chat_transactions_by_bu(year_arg, bu_names): pax/tickets/órdenes y revenue por BU, agregados por mes. Si bu_names es null devuelve todas las BU.
- chat_revenue_for_dates(date_list): revenue y volumen por BU para una lista explícita de fechas (formato YYYY-MM-DD). Usa esto para comparar días específicos.
- chat_list_business_units(): lista los nombres canónicos exactos.

REGLAS DE RESPUESTA:
1. Si el usuario pide algo temporal relativo ("últimos 5 martes", "esta semana", "el mes pasado"), calcula las fechas TÚ MISMO basándote en la fecha de hoy y luego llama a la herramienta apropiada. Hoy es {{$today}}.
2. Si hace falta varias llamadas, hazlas. Si una llamada devuelve mucho, resume.
3. Responde en español, conciso y con formato markdown: usa **negrita** para totales, tablas markdown cuando compares varias filas (ej. BUs), y bullets para listas. NUNCA repitas la pregunta del usuario.
4. Da números con separador de miles ("1.234 uds", "€4.303"). Si hay un total claro, ponlo en una línea destacada.
5. Si la herramienta devuelve vacío, dilo claramente — no inventes datos.
6. Para "cuántas limonadas/X se han vendido", suma uds de TODAS las filas que la herramienta devuelva (varios productos pueden contener la palabra). Indica brevemente la composición (top 3 variantes).`;

function buildWorkflow() {
    const supabaseHeaders = {
        parameters: [
            { name: 'apikey', value: SUPABASE_ANON },
            { name: 'Authorization', value: `Bearer ${SUPABASE_ANON}` },
            { name: 'Content-Type', value: 'application/json' },
        ],
    };

    const makeSupabaseTool = (toolName, description, schemaProps, schemaRequired) => ({
        parameters: {
            toolDescription: description,
            method: 'POST',
            url: `${SUPABASE_URL}/rest/v1/rpc/${toolName}`,
            sendHeaders: true,
            headerParameters: supabaseHeaders,
            sendBody: true,
            specifyBody: 'json',
            jsonBody: '={{ $fromAI("body", "JSON body to send", "string") }}',
            placeholderDefinitions: { values: [] },
            options: {},
        },
        type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
        typeVersion: 1.1,
        name: toolName,
        // Position assigned below
    });

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

        // 2. AI Agent
        {
            parameters: {
                promptType: 'define',
                text: '={{ $json.body.message }}',
                options: {
                    systemMessage: SYSTEM_PROMPT,
                },
            },
            id: 'ai-agent',
            name: 'AI Agent',
            type: '@n8n/n8n-nodes-langchain.agent',
            typeVersion: 1.7,
            position: [-150, 0],
        },

        // 3. LM — OpenRouter / Gemini 3 Flash Preview
        {
            parameters: {
                model: { __rl: true, value: 'google/gemini-3-flash-preview', mode: 'list', cachedResultName: 'google/gemini-3-flash-preview' },
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

        // 5a. Tool: search_products
        Object.assign(
            makeSupabaseTool(
                'chat_search_products',
                'Busca productos por nombre (búsqueda parcial, case-insensitive) en las tablas de ventas line-level. Devuelve uds y revenue agregados de todo el histórico. Body JSON: {"q": "TERM"} donde TERM es un string del producto a buscar (ej. "LIMONADA").',
            ),
            { position: [20, 220], id: 'tool-search' }
        ),

        // 5b. Tool: transactions_by_bu
        Object.assign(
            makeSupabaseTool(
                'chat_transactions_by_bu',
                'Devuelve transacciones (Pax/Tickets/Orders) y revenue por BU agrupados por mes para un año concreto. Body JSON: {"year_arg": 2024, "bu_names": ["Juntos house","Tasting place"]}. Si bu_names es null o se omite, devuelve todas las BU. Recuerda usar "Picadeli" si el usuario pregunta por "Juntos deli".',
            ),
            { position: [190, 220], id: 'tool-trans' }
        ),

        // 5c. Tool: revenue_for_dates
        Object.assign(
            makeSupabaseTool(
                'chat_revenue_for_dates',
                'Devuelve revenue y volumen por BU para una lista explícita de fechas. Body JSON: {"date_list": ["2026-05-13","2026-05-06","2026-04-29","2026-04-22","2026-04-15"]}. Las fechas deben estar en formato YYYY-MM-DD. Útil para comparar días específicos (martes, fines de semana, etc.) — calcula tú las fechas antes de llamar.',
            ),
            { position: [360, 220], id: 'tool-rev-dates' }
        ),

        // 5d. Tool: list_business_units
        Object.assign(
            makeSupabaseTool(
                'chat_list_business_units',
                'Devuelve los nombres canónicos de las BU. Body JSON: {} (sin parámetros). Útil si no estás seguro del nombre exacto.',
            ),
            { position: [530, 220], id: 'tool-list-bus' }
        ),

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
        'Webhook': {
            main: [[{ node: 'AI Agent', type: 'main', index: 0 }]],
        },
        'AI Agent': {
            main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]],
        },
        'Gemini 3 Flash (OpenRouter)': {
            ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]],
        },
        'Memoria por sesión': {
            ai_memory: [[{ node: 'AI Agent', type: 'ai_memory', index: 0 }]],
        },
        'chat_search_products': {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]],
        },
        'chat_transactions_by_bu': {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]],
        },
        'chat_revenue_for_dates': {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]],
        },
        'chat_list_business_units': {
            ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]],
        },
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
    console.log('Posting workflow to n8n...');
    try {
        const r = await n8nRequest('POST', '/api/v1/workflows', workflow);
        console.log(`OK. Workflow ID: ${r.id} — Name: ${r.name}`);
        console.log(`\nWebhook URL (after activation): https://${N8N_HOST}/webhook/${WEBHOOK_PATH}`);
        console.log(`\nNext steps:`);
        console.log(`  1. Open n8n → Workflow "${r.name}"`);
        console.log(`  2. Open the "Gemini 3 Flash (OpenRouter)" node and assign your OpenRouter credential`);
        console.log(`  3. Activate the workflow`);
        console.log(`  4. Confirm the webhook URL above is reachable`);
    } catch (e) {
        console.error('FAIL:', e.message);
        process.exit(1);
    }
})();
