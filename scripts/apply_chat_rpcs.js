#!/usr/bin/env node
// Apply the chat-agent RPC functions via Supabase Management API.
import https from 'https';
import fs from 'fs';

const PAT = process.env.SUPA_PAT || process.argv[2];
const PROJECT_REF = process.env.SUPA_PROJECT || 'agjvhvjhrmwkvszyjitl';
if (!PAT) { console.error('Missing SUPA_PAT'); process.exit(1); }

const sql = fs.readFileSync('scripts/create_chat_rpcs.sql', 'utf8');
const body = JSON.stringify({ query: sql });
const req = https.request({
    method: 'POST',
    host: 'api.supabase.com',
    path: `/v1/projects/${PROJECT_REF}/database/query`,
    headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
    },
    timeout: 60000,
}, (res) => {
    let chunks = '';
    res.on('data', d => { chunks += d; });
    res.on('end', () => {
        console.log(`HTTP ${res.statusCode}`);
        console.log(chunks.slice(0, 500));
    });
});
req.on('error', e => { console.error(e); process.exit(1); });
req.write(body);
req.end();
