import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    // Get distinct dates
    const { data: allRecords } = await supabase
        .from('sales_records')
        .select('date')
        .order('date', { ascending: true });

    const uniqueDates = [...new Set(allRecords.map(d => d.date))];

    console.log('=== DATA STRUCTURE ANALYSIS ===\n');
    console.log('Total records in DB:', allRecords.length);
    console.log('Unique dates:', uniqueDates.length);
    console.log('\nFirst 15 dates:', uniqueDates.slice(0, 15));
    console.log('\nLast 15 dates:', uniqueDates.slice(-15));

    // Check if consecutive days exist
    console.log('\n=== DATA GRANULARITY ===');
    if (uniqueDates.length > 2) {
        const d1 = new Date(uniqueDates[0]);
        const d2 = new Date(uniqueDates[1]);
        const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        console.log('Gap between first 2 dates:', diffDays, 'days');

        if (diffDays === 1) console.log('=> Looks like DAILY data');
        else if (diffDays >= 6 && diffDays <= 8) console.log('=> Looks like WEEKLY data');
        else if (diffDays >= 28 && diffDays <= 31) console.log('=> Looks like MONTHLY data');
    }
}

check();
