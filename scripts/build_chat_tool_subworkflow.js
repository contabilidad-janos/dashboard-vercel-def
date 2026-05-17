#!/usr/bin/env node
/**
 * Creates a small "sales-chat-dispatcher" sub-workflow in n8n. The AI
 * Agent in the main chat workflow invokes it via toolWorkflow, passing
 * { tool: 'search'|'transactions'|'revenue'|'list', args: <obj> }.
 * The sub-workflow switches on `tool` and calls the matching Supabase
 * RPC, returning the JSON rows. Using toolWorkflow sidesteps the
 * schema-validation quirk we kept hitting with toolHttpRequest.
 */
import https from 'https';

const N8N_HOST = 'n8n.juntosfarmn8n.cloud';
const N8N_KEY = process.env.N8N_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZTUxOGRiOS01MzVkLTRiMDMtYjk5Zi0xM2QyOWI3YzVkMzQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZTBiZDljM2MtZDZmNi00MmU5LWJkYmItNjcxNTkyYjA0YzM5IiwiaWF0IjoxNzczMDAwMDcwfQ.t0VchsyvDrgYIVzuq0EClvp1nipbuZIJgM9IRsRqDBA';

const SUPABASE_URL = 'https://agjvhvjhrmwkvszyjitl.supabase.co';
const ANON = 'sb_publishable_cCZyt6Ty-V7OQ9hKwH8geQ_29UkfEI-';

const TOOL_NAME = 'SALES DASHBOARD - Chat Tool Dispatcher';

function buildSubworkflow() {
    // The dispatcher receives one input item with { tool, q, year_arg, bu_names_csv, date_list_csv }.
    // A single Code node does the routing + Supabase REST call + returns rows.
    const code = `
const params = $input.first().json;
const tool = (params.tool || '').toLowerCase();
const supabaseUrl = 'https://agjvhvjhrmwkvszyjitl.supabase.co';
const apikey = 'sb_publishable_cCZyt6Ty-V7OQ9hKwH8geQ_29UkfEI-';

const callRpc = async (fn, body) => {
  return await this.helpers.httpRequest({
    method: 'POST',
    url: supabaseUrl + '/rest/v1/rpc/' + fn,
    headers: { 'apikey': apikey, 'Authorization': 'Bearer ' + apikey, 'Content-Type': 'application/json' },
    body: body || {},
    json: true,
  });
};

let result;
if (tool === 'search') {
  result = await callRpc('chat_search_products', { q: params.q || '' });
} else if (tool === 'transactions') {
  result = await callRpc('chat_transactions_by_bu', { year_arg: Number(params.year_arg), bu_names_csv: params.bu_names_csv || '' });
} else if (tool === 'revenue') {
  result = await callRpc('chat_revenue_for_dates', { date_list_csv: params.date_list_csv || '' });
} else if (tool === 'list') {
  result = await callRpc('chat_list_business_units', {});
} else {
  result = { error: 'Unknown tool. Use: search | transactions | revenue | list', received: tool };
}

return [{ json: { tool, rows: result } }];
`;

    return {
        name: TOOL_NAME,
        nodes: [
            {
                parameters: { inputSource: 'passthrough' },
                id: 'trigger',
                name: 'When Executed by Another Workflow',
                type: 'n8n-nodes-base.executeWorkflowTrigger',
                typeVersion: 1.1,
                position: [0, 0],
            },
            {
                parameters: { jsCode: code },
                id: 'dispatcher',
                name: 'Dispatch + Supabase',
                type: 'n8n-nodes-base.code',
                typeVersion: 2,
                position: [240, 0],
            },
        ],
        connections: {
            'When Executed by Another Workflow': {
                main: [[{ node: 'Dispatch + Supabase', type: 'main', index: 0 }]],
            },
        },
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
    const wf = buildSubworkflow();
    console.log('Looking up existing dispatcher...');
    let existingId = null;
    try {
        const list = await n8nRequest('GET', '/api/v1/workflows?limit=100', null);
        const match = (list.data || []).find(w => w.name === wf.name);
        if (match) existingId = match.id;
    } catch (e) { console.warn('lookup failed:', e.message); }

    if (existingId) {
        console.log(`Updating ${existingId}...`);
        await n8nRequest('PUT', `/api/v1/workflows/${existingId}`, wf);
        await n8nRequest('POST', `/api/v1/workflows/${existingId}/activate`, null);
        console.log(`OK. Sub-workflow id: ${existingId}`);
    } else {
        const r = await n8nRequest('POST', '/api/v1/workflows', wf);
        await n8nRequest('POST', `/api/v1/workflows/${r.id}/activate`, null);
        console.log(`OK. Created sub-workflow id: ${r.id}`);
    }
})();
