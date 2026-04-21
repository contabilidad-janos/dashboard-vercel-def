// Runs the picadeli_inventory migration via Supabase Management API.
import fs from 'fs';

const TOKEN = 'sbp_49a82bffca5236e2c8adc6f5c6e58f70fd382b3e';
const PROJECT_REF = 'agjvhvjhrmwkvszyjitl';
const SQL_FILE = 'migrations/2026-04-21_picadeli_inventory.sql';

const sql = fs.readFileSync(SQL_FILE, 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
});

const text = await res.text();
console.log('Status:', res.status);
console.log('Response:', text);
