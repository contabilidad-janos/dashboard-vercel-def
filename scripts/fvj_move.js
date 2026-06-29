#!/usr/bin/env node
// FVJ anticipo correction (re-apply after each import_sheet5):
// €11,000 was misallocated to Distribution b2b 2026-05-11; it belongs to
// Tasting place 2026-05-08 (Friday). See memory advance-payment-series.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const env = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env')));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const AMT = 11000;
const moves = [
    { date: '2026-05-11', bu: 'Distribution b2b', delta: -AMT },
    { date: '2026-05-08', bu: 'Tasting place', delta: +AMT },
];

for (const m of moves) {
    const { data, error: rerr } = await supabase.from('sales_daily_def')
        .select('revenue').eq('business_unit', m.bu).eq('date', m.date).limit(1);
    if (rerr) { console.error('read error:', rerr.message); process.exit(1); }
    const cur = Number(data?.[0]?.revenue) || 0;
    const next = Math.round((cur + m.delta) * 100) / 100;
    const { error } = await supabase.from('sales_daily_def')
        .upsert([{ date: m.date, business_unit: m.bu, revenue: next }], { onConflict: 'date,business_unit' });
    if (error) { console.error(m.bu, error.message); process.exit(1); }
    console.log(`${m.bu} ${m.date}: €${cur.toFixed(0)} ${m.delta > 0 ? '+' : ''}${m.delta} → €${next.toFixed(0)}`);
}
console.log('FVJ move done.');
