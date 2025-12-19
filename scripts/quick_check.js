import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function quickCheck() {
    const { data } = await supabase
        .from('sales_records')
        .select('date, amount, transaction_count, business_units(name)')
        .gte('date', '2025-12-01')
        .lte('date', '2025-12-07');

    const sums = {};
    data.forEach(r => {
        const u = r.business_units?.name;
        if (!sums[u]) sums[u] = { s: 0, t: 0 };
        sums[u].s += Number(r.amount);
        sums[u].t += Number(r.transaction_count);
    });

    console.log('Week 01/12-07/12 totals:');
    Object.entries(sums).sort().forEach(([u, v]) => {
        console.log(`${u}: €${v.s}, ${v.t} trans`);
    });
}
quickCheck();
