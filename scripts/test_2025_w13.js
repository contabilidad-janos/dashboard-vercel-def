import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const getWeekNumber = (d) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7) - 1;
};

async function test() {
    let allData = [];
    let from = 0;
    const chunkSize = 1000;
    let done = false;
    while (!done) {
        const { data, error } = await supabase
            .from('sales_daily_def')
            .select('date, revenue, business_unit, VOLUME')
            .gte('date', '2025-01-01')
            .lte('date', '2025-12-31')
            .range(from, from + chunkSize - 1)
            .order('date', { ascending: true });
        if (error) throw error;
        if (data && data.length > 0) {
            allData = allData.concat(data);
            from += chunkSize;
            if (data.length < chunkSize) done = true;
        } else {
            done = true;
        }
    }
    
    console.log(`Total 2025 records: ${allData.length}`);
    
    const byWeek = {};
    allData.forEach(r => {
        if (!r.date) return;
        const d = new Date(r.date);
        const wIdx = getWeekNumber(d);
        if (!byWeek[wIdx]) byWeek[wIdx] = 0;
        byWeek[wIdx] += Number(r.revenue);
    });
    
    console.log(`Revenue by week (Index 12 is week 13):`, byWeek[12]);
}

test();
