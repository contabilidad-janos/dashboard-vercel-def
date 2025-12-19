import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function diagnoseDuplicateData() {
    console.log('=== Diagnosing Duplicate Data Issue ===\n');

    // Expected weekly data from spreadsheet for week 01/12-07/12 (2025)
    const expectedWeekly = {
        'Juntos house': { sales: 6556, trans: 108 },
        'Juntos boutique': { sales: 629, trans: 10 },
        'Picadeli': { sales: 15907, trans: 919 },
        'Juntos farm shop': { sales: 3095, trans: 144 },
        'Tasting place': { sales: 6136, trans: 281 },
        'Distribution b2b': { sales: 2369, trans: 34 }
    };

    // Fetch December 2025 records
    const { data, error } = await supabase
        .from('sales_records')
        .select('date, amount, transaction_count, business_units(name)')
        .gte('date', '2025-12-01')
        .lte('date', '2025-12-07')
        .order('date', { ascending: true });

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('The data on 2025-12-01 looks like a weekly total (old seeding method)');
    console.log('The data on 2025-12-02 to 2025-12-07 looks like daily data (new seeding method)\n');

    // Separate the problematic 12-01 data from the daily data
    const dec01Data = data.filter(r => r.date === '2025-12-01');
    const dailyData = data.filter(r => r.date !== '2025-12-01');

    console.log('=== Data on 2025-12-01 (appears to be WEEKLY totals from 2024 seeding) ===');
    dec01Data.forEach(r => {
        console.log(`  ${r.business_units?.name}: €${r.amount}, ${r.transaction_count} trans`);
    });

    console.log('\n=== Sum of daily data 2025-12-02 to 2025-12-07 ===');
    const dailySums = {};
    dailyData.forEach(r => {
        const unit = r.business_units?.name;
        if (!dailySums[unit]) dailySums[unit] = { sales: 0, trans: 0 };
        dailySums[unit].sales += Number(r.amount);
        dailySums[unit].trans += Number(r.transaction_count);
    });

    Object.entries(dailySums).sort().forEach(([unit, vals]) => {
        const expected = expectedWeekly[unit];
        if (expected) {
            const match = vals.sales === expected.sales && vals.trans === expected.trans;
            console.log(`  ${unit}: €${vals.sales}, ${vals.trans} trans ${match ? '✓ MATCHES EXPECTED!' : ''}`);
        } else {
            console.log(`  ${unit}: €${vals.sales}, ${vals.trans} trans`);
        }
    });

    console.log('\n\n=== DIAGNOSIS ===');
    console.log('The record on 2025-12-01 appears to be DUPLICATE/OLD data that was');
    console.log('seeded using the weekly format (one record per week on Monday).');
    console.log('');
    console.log('The daily data (12-02 to 12-07) was seeded later with proper daily breakdown.');
    console.log('');
    console.log('This creates DOUBLE-COUNTING when the dashboard aggregates the week.');
    console.log('');
    console.log('SOLUTION: Delete the 2025-12-01 record as it duplicates the daily data,');
    console.log('OR verify which dataset is correct and keep only one.');

    // Check if daily sums match expected
    console.log('\n\n=== Verification: Does daily data match spreadsheet? ===');
    let allMatch = true;
    Object.entries(expectedWeekly).forEach(([unit, expected]) => {
        const actual = dailySums[unit] || { sales: 0, trans: 0 };
        const salesMatch = actual.sales === expected.sales;
        const transMatch = actual.trans === expected.trans;
        const status = salesMatch && transMatch ? '✓' : '✗';
        if (!salesMatch || !transMatch) allMatch = false;
        console.log(`  ${status} ${unit}: Actual €${actual.sales}/${actual.trans} vs Expected €${expected.sales}/${expected.trans}`);
    });

    if (!allMatch) {
        console.log('\n⚠️  Daily data does NOT match the spreadsheet.');
        console.log('   This suggests additional analysis or data re-syncing may be needed.');
    }
}

diagnoseDuplicateData();
