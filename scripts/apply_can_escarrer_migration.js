#!/usr/bin/env node
/**
 * Apply the can_escarrer_sales migration via Supabase Management API.
 * Splits into small statements because a single large query hits the
 * connection timeout on this project.
 *
 * Usage:  SUPA_PAT=<pat> node scripts/apply_can_escarrer_migration.js
 *         (falls back to hard-coded PAT in argv[2] if provided)
 */
import https from 'https';

const PAT = process.env.SUPA_PAT || process.argv[2];
const PROJECT_REF = process.env.SUPA_PROJECT || 'agjvhvjhrmwkvszyjitl';

if (!PAT) {
    console.error('Missing Supabase PAT. Pass via SUPA_PAT env or argv[2].');
    process.exit(1);
}

const run = (query) => new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request({
        method: 'POST',
        host: 'api.supabase.com',
        path: `/v1/projects/${PROJECT_REF}/database/query`,
        headers: {
            'Authorization': `Bearer ${PAT}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
        },
        timeout: 120000,
    }, (res) => {
        let chunks = '';
        res.on('data', d => { chunks += d; });
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(chunks);
            } else {
                reject(new Error(`${res.statusCode}: ${chunks}`));
            }
        });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Request timed out')); });
    req.write(body);
    req.end();
});

const steps = [
    ['Enable uuid extension', `create extension if not exists "uuid-ossp";`],

    ['Create can_escarrer_sales table', `
        create table if not exists public.can_escarrer_sales (
            id uuid default uuid_generate_v4() primary key,
            date date not null,
            bu text not null,
            serie text,
            cliente text,
            tipo_cliente text,
            origen text,
            descripcion text,
            descripcion_raw text,
            departamento text,
            seccion text,
            familia text,
            marca text,
            budget text,
            uds numeric(10,3) default 0,
            importe numeric(12,2) default 0,
            precio_unitario numeric(12,4) default 0,
            row_hash text not null unique,
            imported_at timestamp with time zone default timezone('utc'::text, now()) not null
        );
    `],

    ['Index: date',          `create index if not exists idx_can_escarrer_sales_date          on public.can_escarrer_sales(date);`],
    ['Index: bu',            `create index if not exists idx_can_escarrer_sales_bu            on public.can_escarrer_sales(bu);`],
    ['Index: bu+date',       `create index if not exists idx_can_escarrer_sales_bu_date       on public.can_escarrer_sales(bu, date);`],
    ['Index: departamento',  `create index if not exists idx_can_escarrer_sales_departamento  on public.can_escarrer_sales(departamento);`],
    ['Index: seccion',       `create index if not exists idx_can_escarrer_sales_seccion       on public.can_escarrer_sales(seccion);`],
    ['Index: marca',         `create index if not exists idx_can_escarrer_sales_marca         on public.can_escarrer_sales(marca);`],
    ['Index: cliente',       `create index if not exists idx_can_escarrer_sales_cliente       on public.can_escarrer_sales(cliente);`],

    ['Enable RLS',           `alter table public.can_escarrer_sales enable row level security;`],

    ['Create read policy', `
        do $$
        begin
          if not exists (
            select 1 from pg_policies
            where schemaname = 'public' and tablename = 'can_escarrer_sales'
              and policyname = 'Enable read access for all users'
          ) then
            create policy "Enable read access for all users"
              on public.can_escarrer_sales for select using (true);
          end if;
        end$$;
    `],
];

(async () => {
    for (const [label, sql] of steps) {
        process.stdout.write(`→ ${label}... `);
        try {
            await run(sql);
            console.log('OK');
        } catch (err) {
            console.log('FAIL');
            console.error(String(err.message).slice(0, 300));
            process.exit(1);
        }
    }
    console.log('\nMigration complete.');
})();
