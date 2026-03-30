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
    const { data: buList } = await supabase.from('business_units').select('*');
    if (!buList || buList.length === 0) {
        console.log("NO BUSINESS UNITS RETURNED FROM DB");
    }

    let allData = [];
    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from('sales_daily_def')
            .select('date, revenue, business_unit, VOLUME')
            .gte('date', '2025-01-01')
            .lte('date', '2025-12-31')
            .range(from, from + 999)
            .order('date', { ascending: true });
        if (error) break;
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < 1000) break;
        from += 1000;
    }

    const weeksCount = 53;
    const result = {};
    const BU_MAP = {
        'Juntos house': 'Juntos house',
        'Juntos boutique': 'Juntos boutique',
        'Picadeli': 'Picadeli',
        'Juntos farm shop': 'Juntos farm shop',
        'Tasting place': 'Tasting place',
        'Distribution b2b': 'Distribution b2b',
        'Juntos Products': 'Juntos Products',
        'Activities': 'Activities',
    };
    
    buList.forEach(u => { result[u.name] = new Array(weeksCount).fill(0); });
    
    allData.forEach(record => {
        if (!record.date) return;
        const dateObj = new Date(record.date);
        const buName = BU_MAP[record.business_unit] || record.business_unit;
        if (!result[buName]) return;

        let weekIdx = getWeekNumber(dateObj);
        const y = dateObj.getFullYear();
        const m = dateObj.getMonth();
        const d = dateObj.getDate();
        if ((y === 2025 && m === 11 && d >= 29) || (y === 2026 && m === 0 && d <= 4)) weekIdx = 52;
        
        if (weekIdx >= 0 && weekIdx < weeksCount) {
            result[buName][weekIdx] += Number(record.revenue) || 0;
        }
    });

    console.log("Sales 2025 W13 (index 12):");
    let tot = 0;
    for (const bu of Object.keys(result)) {
        console.log(`  ${bu}: ${result[bu][12]}`);
        tot += result[bu][12];
    }
    console.log("Total index 12:", tot);
}
test();
