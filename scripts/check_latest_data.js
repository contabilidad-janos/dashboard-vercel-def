import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('sales_daily_def')
        .select('*')
        .gte('date', '2026-03-23')
        .lte('date', '2026-03-29')
        .order('date', { ascending: true });
        
    if (error) {
        console.error(error);
        return;
    }
    
    console.log(`Found ${data.length} records between 2026-03-23 and 2026-03-29:`);
    const byDate = {};
    for (const r of data) {
        if (!byDate[r.date]) byDate[r.date] = [];
        byDate[r.date].push(`${r.business_unit}: €${r.revenue}`);
    }
    
    for (const [d, recs] of Object.entries(byDate)) {
        console.log(`\nDate: ${d}`);
        console.log(recs.join(', '));
    }
}

check();
