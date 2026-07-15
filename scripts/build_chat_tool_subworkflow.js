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

// Paginated REST reads (PostgREST caps 1000 rows/request).
const getAll = async (pathBase) => {
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await this.helpers.httpRequest({
      method: 'GET',
      url: supabaseUrl + pathBase + '&limit=1000&offset=' + offset,
      headers: { 'apikey': apikey, 'Authorization': 'Bearer ' + apikey },
      json: true,
    });
    if (Array.isArray(page)) all.push(...page);
    if (!Array.isArray(page) || page.length < 1000) break;
  }
  return all;
};

let result;
try {
  if (tool === 'search') {
    result = await callRpc('chat_search_products', {
      q: params.q || '',
      start_date: params.start_date || '2024-01-01',
      end_date: params.end_date || '2030-12-31',
    });
  } else if (tool === 'transactions') {
    result = await callRpc('chat_transactions_by_bu', { year_arg: Number(params.year_arg), bu_names_csv: params.bu_names_csv || '' });
  } else if (tool === 'revenue') {
    result = await callRpc('chat_revenue_for_dates', { date_list_csv: params.date_list_csv || '' });
  } else if (tool === 'product_daily') {
    result = await callRpc('chat_product_daily', {
      q: params.q || '',
      start_date: params.start_date || '2024-01-01',
      end_date: params.end_date || '2030-12-31',
    });
  } else if (tool === 'top_products') {
    result = await callRpc('chat_top_products_by_bu', {
      bu_name: params.bu_name || '',
      start_date: params.start_date || '2024-01-01',
      end_date: params.end_date || '2030-12-31',
      limit_n: Number(params.limit_n) || 10,
    });
  } else if (tool === 'revenue_range') {
    // Period analytics aggregated HERE (by BU / month / weekday, best day, pax)
    // so the model never enumerates hundreds of dates nor invents groupings.
    const sd = String(params.start_date || '2024-01-01').slice(0, 10);
    const ed = String(params.end_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const buFilter = String(params.bu_names_csv || '').split(',').map(s => s.trim()).filter(Boolean);
    const wanted = (b) => b && b !== 'OTROS' && (!buFilter.length || buFilter.includes(b));
    const ddef = await getAll('/rest/v1/sales_daily_def?select=date,business_unit,revenue&date=gte.' + sd + '&date=lte.' + ed);
    const recs = await getAll('/rest/v1/sales_records?select=date,transaction_count,business_units(name)&date=gte.' + sd + '&date=lte.' + ed);
    const DOWN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const byBu = {}, byMonth = {}, byDay = {};
    let tR = 0;
    for (const r of ddef) {
      const b = (r.business_unit || '').trim();
      if (!wanted(b)) continue;
      const rev = Number(r.revenue) || 0;
      tR += rev;
      (byBu[b] = byBu[b] || { business_unit: b, revenue: 0, pax: 0 }).revenue += rev;
      const ym = String(r.date).slice(0, 7);
      byMonth[ym] = (byMonth[ym] || 0) + rev;
      byDay[r.date] = (byDay[r.date] || 0) + rev;
    }
    let tP = 0;
    for (const r of recs) {
      const b = ((r.business_units && r.business_units.name) || '').trim();
      if (!wanted(b)) continue;
      const c = Number(r.transaction_count) || 0;
      tP += c;
      (byBu[b] = byBu[b] || { business_unit: b, revenue: 0, pax: 0 }).pax += c;
    }
    const byDow = {};
    for (const d of Object.keys(byDay)) {
      const w = DOWN[new Date(d + 'T00:00:00Z').getUTCDay()];
      (byDow[w] = byDow[w] || { weekday: w, revenue: 0, days: 0 });
      byDow[w].revenue += byDay[d];
      if (byDay[d] > 0) byDow[w].days++;
    }
    const dayEntries = Object.entries(byDay).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    result = {
      start_date: sd, end_date: ed,
      bu_filter: buFilter.length ? buFilter : 'all',
      total_revenue: round2(tR),
      total_pax: tP,
      by_bu: Object.values(byBu).map(x => ({ business_unit: x.business_unit, revenue: round2(x.revenue), pax: x.pax })).sort((a, b) => b.revenue - a.revenue),
      by_month: Object.entries(byMonth).map(([month, revenue]) => ({ month, revenue: round2(revenue) })).sort((a, b) => (a.month < b.month ? -1 : 1)),
      by_weekday: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].filter(w => byDow[w]).map(w => ({ weekday: w, revenue: round2(byDow[w].revenue), days: byDow[w].days, avg_per_day: round2(byDow[w].revenue / (byDow[w].days || 1)) })),
      best_day: dayEntries.length ? { date: dayEntries[0][0], revenue: round2(dayEntries[0][1]) } : null,
      worst_day: dayEntries.length ? { date: dayEntries[dayEntries.length - 1][0], revenue: round2(dayEntries[dayEntries.length - 1][1]) } : null,
      days_with_sales: dayEntries.length,
    };
  } else if (tool === 'open_days') {
    // Days open/closed per BU, aggregated HERE so the model never guesses.
    const sd = String(params.start_date || '2025-01-01').slice(0, 10);
    const ed = String(params.end_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const ddef = await getAll('/rest/v1/sales_daily_def?select=date,business_unit,revenue&date=gte.' + sd + '&date=lte.' + ed);
    const recs = await getAll('/rest/v1/sales_records?select=date,transaction_count,business_units(name)&date=gte.' + sd + '&date=lte.' + ed);
    const day = {}; // bu -> { date -> {r, t} }
    for (const r of ddef) {
      const bu = (r.business_unit || '').trim();
      if (!bu || bu === 'OTROS') continue;
      const d = (day[bu] = day[bu] || {});
      const c = (d[r.date] = d[r.date] || { r: 0, t: 0 });
      c.r += Number(r.revenue) || 0;
    }
    for (const r of recs) {
      const bu = ((r.business_units && r.business_units.name) || '').trim();
      if (!bu || bu === 'OTROS') continue;
      const d = (day[bu] = day[bu] || {});
      const c = (d[r.date] = d[r.date] || { r: 0, t: 0 });
      c.t += Number(r.transaction_count) || 0;
    }
    const DOWN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const byBu = [];
    for (const bu of Object.keys(day).sort()) {
      const byMonth = {}, byYear = {}, byDow = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
      let total = 0;
      for (let d = new Date(sd + 'T00:00:00Z'); ; d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (iso > ed) break;
        const ym = iso.slice(0, 7);
        const m = (byMonth[ym] = byMonth[ym] || { open: 0, days: 0 });
        m.days++;
        const v = day[bu][iso];
        if (v && (v.r > 0 || v.t > 0)) {
          m.open++; total++;
          byYear[iso.slice(0, 4)] = (byYear[iso.slice(0, 4)] || 0) + 1;
          byDow[DOWN[d.getUTCDay()]]++;
        }
      }
      byBu.push({
        business_unit: bu,
        days_open_total: total,
        by_year: byYear,
        by_month: Object.entries(byMonth).map(([month, v]) => ({ month, open: v.open, days_in_range: v.days })),
        by_weekday_open: byDow,
      });
    }
    byBu.sort((a, b) => b.days_open_total - a.days_open_total);
    result = { definition: 'open = day with revenue > 0 or recorded volume > 0; closed = no sales/volume recorded (real closure OR missing data)', start_date: sd, end_date: ed, by_bu: byBu };
  } else if (tool === 'list') {
    result = await callRpc('chat_list_business_units', {});
  } else {
    result = { error: 'Unknown tool. Use: search | transactions | revenue | revenue_range | top_products | product_daily | open_days | list', received: tool };
  }
} catch (e) {
  result = { error: String(e.message || e).slice(0, 300), tool };
}

// Pre-aggregate totals server-side so the model NEVER sums many rows itself
// (LLMs make arithmetic errors adding dozens of numbers). The model must read
// summary.* for any total; rows[] stays for fine-grained per-day/per-BU detail.
const rnd = (n) => Math.round((Number(n) || 0) * 100) / 100;
let summary = null;
if ((tool === 'open_days' || tool === 'revenue_range') && result && result.by_bu) {
  // these tools already ARE the aggregate: expose as summary, no raw rows.
  summary = result;
  result = [];
} else if (tool === 'search' && Array.isArray(result)) {
  // headline totals for the search rows, so the model never sums them by hand
  let tU = 0, tR = 0; const byBu = {};
  for (const r of result) {
    tU += Number(r.total_uds) || 0; tR += Number(r.total_revenue) || 0;
    const b = r.source || '?';
    (byBu[b] = byBu[b] || { business_unit: b, uds: 0, revenue: 0 });
    byBu[b].uds += Number(r.total_uds) || 0; byBu[b].revenue += Number(r.total_revenue) || 0;
  }
  summary = {
    matching_products: result.length,
    total_uds: rnd(tU), total_revenue: rnd(tR),
    by_bu: Object.values(byBu).map(x => ({ business_unit: x.business_unit, uds: rnd(x.uds), revenue: rnd(x.revenue) })).sort((a, b) => b.revenue - a.revenue),
  };
} else if (tool === 'product_daily' && Array.isArray(result)) {
  const byBu = {}; const days = new Set(); let tU = 0, tR = 0;
  for (const r of result) {
    const u = Number(r.uds) || 0, v = Number(r.revenue) || 0;
    tU += u; tR += v; days.add(r.date);
    const b = r.bu || '?';
    (byBu[b] = byBu[b] || { business_unit: b, uds: 0, revenue: 0 });
    byBu[b].uds += u; byBu[b].revenue += v;
  }
  summary = {
    total_uds: rnd(tU), total_revenue: rnd(tR),
    days_with_sales: days.size, rows_returned: result.length,
    truncated: result.length >= 1000,
    by_bu: Object.values(byBu).map(x => ({ business_unit: x.business_unit, uds: rnd(x.uds), revenue: rnd(x.revenue) })).sort((a, b) => b.revenue - a.revenue),
  };
} else if (Array.isArray(result)) {
  if (tool === 'revenue') {
    const byBu = {}, byDay = {}; let tR = 0, tU = 0, tP = 0;
    for (const r of result) {
      const rev = Number(r.revenue) || 0, u = Number(r.units_sold ?? r.volume) || 0, px = Number(r.pax) || 0, b = r.business_unit || '?';
      tR += rev; tU += u; tP += px;
      (byBu[b] = byBu[b] || { business_unit: b, revenue: 0, units_sold: 0, pax: 0 });
      byBu[b].revenue += rev; byBu[b].units_sold += u; byBu[b].pax += px;
      byDay[r.date] = (byDay[r.date] || 0) + rev;
    }
    summary = {
      total_revenue: rnd(tR), total_units_sold: rnd(tU), total_pax: tP,
      by_bu: Object.values(byBu).map(x => ({ business_unit: x.business_unit, revenue: rnd(x.revenue), units_sold: rnd(x.units_sold), pax: x.pax })).sort((a, b) => b.revenue - a.revenue),
      by_day: Object.entries(byDay).map(([date, revenue]) => ({ date, revenue: rnd(revenue) })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    };
  } else if (tool === 'transactions') {
    const byBu = {}; let tC = 0, tR = 0;
    for (const r of result) {
      const b = r.bu || r.business_unit || r.name || '?';
      const c = Number(r.transaction_count ?? r.transactions ?? r.pax ?? r.total_transactions ?? 0);
      const rev = Number(r.revenue ?? r.total_revenue ?? 0);
      tC += c; tR += rev;
      (byBu[b] = byBu[b] || { business_unit: b, transactions: 0, revenue: 0 }); byBu[b].transactions += c; byBu[b].revenue += rev;
    }
    summary = {
      total_transactions: tC, total_revenue: rnd(tR),
      by_bu: Object.values(byBu).map(x => ({ business_unit: x.business_unit, transactions: x.transactions, revenue: rnd(x.revenue) })).sort((a, b) => b.revenue - a.revenue),
    };
  }
}

return [{ json: { tool, summary, rows: result } }];
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
