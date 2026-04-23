#!/usr/bin/env node
/**
 * Re-normalise `descripcion` in place for all existing can_escarrer_sales
 * rows. Uses the same rules as the importer's normalizeDesc:
 *   - strip accents, UPPERCASE
 *   - unwrap "(KG)" / "(/KG)" style unit parens
 *   - collapse whitespace
 *
 * Done server-side with a single SQL UPDATE so 68k rows are rewritten in
 * one shot without round-tripping every record.
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
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(chunks);
            else reject(new Error(`${res.statusCode}: ${chunks}`));
        });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.write(body);
    req.end();
});

const SQL = `
update public.can_escarrer_sales
set descripcion = trim(regexp_replace(
    regexp_replace(
        translate(
            upper(descripcion_raw),
            'ÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑàáâãäåèéêëìíîïòóôõöùúûüçñ',
            'AAAAAAEEEEIIIIOOOOOUUUUCNAAAAAAEEEEIIIIOOOOOUUUUCN'
        ),
        '\\(\\s*/?\\s*([A-Z0-9]+)\\s*\\)', '\\1', 'g'
    ),
    '\\s+', ' ', 'g'
))
where descripcion_raw is not null;
`;

(async () => {
    console.log('→ Running UPDATE on can_escarrer_sales.descripcion...');
    try {
        const r = await run(SQL);
        console.log('OK:', r.slice(0, 200));
    } catch (e) {
        console.error('FAIL:', e.message);
        process.exit(1);
    }

    console.log('\n→ Verifying MEZCLUM variants:');
    const verify = await run(
        "select descripcion, count(*) as rows, round(sum(importe)::numeric,0) as revenue from public.can_escarrer_sales where descripcion like 'MEZCLUM%' group by 1 order by 2 desc"
    );
    console.log(verify);
})();
