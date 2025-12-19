import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function diagnoseDecemberData() {
    console.log('=== Diagnosing December 2024 Data Issue ===\n');

    // Expected data from the spreadsheet (row by row for week 01/12-07/12)
    const expectedWeek49 = {
        'Juntos house': { sales: 6556, trans: 108 },
        'Juntos boutique': { sales: 629, trans: 10 },
        'Picadeli': { sales: 15907, trans: 919 },
        'Juntos farm shop': { sales: 3095, trans: 144 },
        'Tasting place': { sales: 6136, trans: 281 },
        'Distribution b2b': { sales: 2369, trans: 34 }
    };

    // Fetch December data
    const { data, error } = await supabase
        .from('sales_records')
        .select('date, amount, transaction_count, business_units(name)')
        .gte('date', '2024-12-01')
        .lte('date', '2024-12-31')
        .order('date', { ascending: true });

    if (error) {
        console.error('Error:', error);
        return;
    }

    // Create a map by date and unit
    const byDateUnit = {};
    data.forEach(r => {
        const key = `${r.date}|${r.business_units?.name}`;
        byDateUnit[key] = { amount: r.amount, trans: r.transaction_count };
    });

    console.log('COMPARISON: Spreadsheet Week 01/12-07/12 vs Supabase Dates\n');
    console.log('The spreadsheet shows week 01/12-07/12 should have these values:\n');

    const dates = ['2024-12-02', '2024-12-09', '2024-12-16'];

    Object.entries(expectedWeek49).forEach(([unit, expected]) => {
        console.log(`\n${unit}:`);
        console.log(`  Expected (week 01/12-07/12): €${expected.sales}, ${expected.trans} trans`);

        dates.forEach(date => {
            const key = `${date}|${unit}`;
            const actual = byDateUnit[key];
            if (actual) {
                const match = actual.amount === expected.sales && actual.trans === expected.trans;
                console.log(`  ${date}: €${actual.amount}, ${actual.trans} trans ${match ? '✓ MATCH!' : ''}`);
            } else {
                console.log(`  ${date}: NO DATA`);
            }
        });
    });

    console.log('\n\n=== DIAGNOSIS ===');
    console.log('Looking at Juntos house:');
    console.log('  - Spreadsheet says week 01/12-07/12: €6,556, 108 pax');
    console.log('  - Supabase 2024-12-02 (Mon of week 01/12): €14,328, 195 pax ← WRONG');
    console.log('  - Supabase 2024-12-16 (Mon of week 15/12): €6,556, 108 pax ← MATCHES!');
    console.log('\n The data appears to be stored under the WRONG dates.');
    console.log(' The week 01/12-07/12 data is stored on 2024-12-16 instead of 2024-12-02.');

    console.log('\n\n=== SOLUTION ===');
    console.log('The dates in Supabase need to be corrected:');
    console.log('  - 2024-12-16 → should be 2024-12-02 (week 01/12-07/12)');
    console.log('  - 2024-12-09 → should be 2024-12-09 (week 08/12-14/12) - might be correct');
    console.log('  - 2024-12-02 → currently contains data that seems to be from a DIFFERENT week');
}

diagnoseDecemberData();
