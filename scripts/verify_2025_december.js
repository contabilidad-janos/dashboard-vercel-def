import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function verify2025DecemberData() {
    console.log('=== Verifying December 2025 Data in Supabase ===\n');
    console.log('Current date: 2025-12-08');
    console.log('Week in question: 01/12-07/12 (December 1-7, 2025)\n');

    // Expected data from user's spreadsheet for week 01/12-07/12 (2025!)
    const expectedWeek = {
        'Juntos house': { sales: 6556, trans: 108 },
        'Juntos boutique': { sales: 629, trans: 10 },
        'Picadeli': { sales: 15907, trans: 919 },
        'Juntos farm shop': { sales: 3095, trans: 144 },
        'Tasting place': { sales: 6136, trans: 281 },
        'Distribution b2b': { sales: 2369, trans: 34 }
    };

    // Fetch ALL December 2025 records
    const { data, error } = await supabase
        .from('sales_records')
        .select('date, amount, transaction_count, business_units(name)')
        .gte('date', '2025-12-01')
        .lte('date', '2025-12-31')
        .order('date', { ascending: true });

    if (error) {
        console.error('Error fetching December 2025 data:', error);
        return;
    }

    console.log(`Total December 2025 records in Supabase: ${data.length}\n`);

    if (data.length === 0) {
        console.log('⚠️  NO DATA FOUND for December 2025!');
        console.log('   This is likely the issue - the 2025 December data has not been uploaded yet.');
        return;
    }

    // Group by date
    const byDate = {};
    data.forEach(record => {
        const date = record.date;
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push({
            unit: record.business_units?.name,
            amount: record.amount,
            transactions: record.transaction_count
        });
    });

    console.log('Dates with data in December 2025:');
    Object.keys(byDate).sort().forEach(date => {
        console.log(`\n${date}:`);
        byDate[date].forEach(r => {
            console.log(`  ${r.unit}: €${r.amount}, ${r.transactions} transactions`);
        });
    });

    // Check specifically for week 01/12-07/12 (2025)
    // Monday of that week is 2025-12-01
    console.log('\n\n=== Week 01/12-07/12 (2025) Analysis ===');
    console.log('Expected (from spreadsheet):');
    Object.entries(expectedWeek).forEach(([unit, vals]) => {
        console.log(`  ${unit}: €${vals.sales}, ${vals.trans} transactions`);
    });

    // Check for data on 2025-12-01 (Monday of week 01/12-07/12)
    const weekData = data.filter(r => r.date >= '2025-12-01' && r.date <= '2025-12-07');
    console.log(`\nRecords found for dates 2025-12-01 to 2025-12-07: ${weekData.length}`);

    if (weekData.length > 0) {
        const weekSummary = {};
        weekData.forEach(r => {
            const unit = r.business_units?.name || 'Unknown';
            if (!weekSummary[unit]) weekSummary[unit] = { amount: 0, transactions: 0 };
            weekSummary[unit].amount += Number(r.amount);
            weekSummary[unit].transactions += Number(r.transaction_count);
        });

        console.log('\nActual data for week 01/12-07/12 in Supabase:');
        Object.keys(expectedWeek).forEach(unit => {
            const actual = weekSummary[unit] || { amount: 0, transactions: 0 };
            const expected = expectedWeek[unit];
            const salesMatch = actual.amount === expected.sales;
            const transMatch = actual.transactions === expected.trans;
            const status = salesMatch && transMatch ? '✓' : '✗';
            console.log(`  ${status} ${unit}: €${actual.amount} (expected €${expected.sales}), ${actual.transactions} trans (expected ${expected.trans})`);
        });
    }
}

verify2025DecemberData();
