import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// WEEKLY_LABELS_2025 from SEED_DATA.js (used for 2024 weekly indexing too)
const WEEKLY_LABELS = [
    "01/01-05/01", "06/01-12/01", "13/01-19/01", "20/01-26/01", "27/01-02/02",
    "03/02-09/02", "10/02-16/02", "17/02-23/02", "24/02-02/03", "03/03-09/03",
    "10/03-16/03", "17/03-23/03", "24/03-30/03", "31/03-06/04", "07/04-13/04",
    "14/04-20/04", "21/04-27/04", "28/04-04/05", "05/05-11/05", "12/05-18/05",
    "19/05-25/05", "26/05-01/06", "02/06-08/06", "09/06-15/06", "16/06-22/06",
    "23/06-29/06", "30/06-06/07", "07/07-13/07", "14/07-20/07", "21/07-27/07",
    "28/07-03/08", "04/08-10/08", "11/08-17/08", "18/08-24/08", "25/08-31/08",
    "01/09-07/09", "08/09-14/09", "15/09-21/09", "22/09-28/09", "29/09-05/10",
    "06/10-12/10", "13/10-19/10", "20/10-26/10", "27/10-02/11", "03/11-09/11",
    "10/11-16/11", "17/11-23/11", "24/11-30/11",
    "01/12-07/12", "08/12-14/12", "15/12-21/12", "22/12-28/12", "29/12-04/01"
];

async function verifyWeeklyAlignment() {
    console.log('Verifying Weekly Data Alignment...\n');
    console.log(`Expected number of weekly labels: ${WEEKLY_LABELS.length}`);

    // Fetch ALL 2024 sales records ordered by date
    const { data, error } = await supabase
        .from('sales_records')
        .select('date, amount, transaction_count, business_units(name)')
        .gte('date', '2024-01-01')
        .lte('date', '2024-12-31')
        .order('date', { ascending: true });

    if (error) {
        console.error('Error:', error);
        return;
    }

    // Group by business unit
    const byUnit = {};
    data.forEach(record => {
        const unit = record.business_units?.name;
        if (!unit) return;
        if (!byUnit[unit]) byUnit[unit] = [];
        byUnit[unit].push({
            date: record.date,
            amount: record.amount,
            transactions: record.transaction_count
        });
    });

    console.log('\nRecords per business unit:');
    Object.keys(byUnit).sort().forEach(unit => {
        console.log(`  ${unit}: ${byUnit[unit].length} records`);
    });

    // Check dates alignment for Juntos house specifically
    console.log('\n\n=== Juntos house date-to-index mapping ===');
    const jhData = byUnit['Juntos house'] || [];

    console.log(`Total records for Juntos house: ${jhData.length}`);
    console.log('\nFirst 5 records:');
    jhData.slice(0, 5).forEach((r, i) => {
        console.log(`  Index ${i}: ${r.date} -> €${r.amount}`);
    });

    console.log('\nLast 5 records (December):');
    jhData.slice(-5).forEach((r, i) => {
        const idx = jhData.length - 5 + i;
        console.log(`  Index ${idx}: ${r.date} -> €${r.amount}`);
    });

    // The week "01/12-07/12" should map to index 48 (0-indexed from January)
    // Let's check what's at index 48
    console.log('\n\n=== Week 01/12-07/12 Check (should be index 48) ===');
    console.log(`Expected week label at index 48: ${WEEKLY_LABELS[48]}`);

    if (jhData[48]) {
        console.log(`Actual data at index 48: ${jhData[48].date} -> €${jhData[48].amount}`);
    } else {
        console.log(`No data at index 48 - array only has ${jhData.length} items`);
    }

    // Cross-check with spreadsheet values from user
    console.log('\n=== Expected vs Actual for Week 01/12-07/12 ===');
    console.log('From user spreadsheet (WEEK SALES column for row 48):');
    console.log('  Juntos house: €6,556 (108 pax)');
    console.log('  Juntos boutique: €629 (10 tickets)');
    console.log('  Picadeli: €15,907 (919 tickets)');
    console.log('  Juntos farm shop: €3,095 (144 tickets)');
    console.log('  Tasting place: €6,136 (281 tickets)');
    console.log('  Distribution b2b: €2,369 (34 orders)');

    // Find the record for 2024-12-02 (Monday of week 01/12-07/12)
    console.log('\n\nActual Supabase data for 2024-12-02 (Monday of week 01/12-07/12):');
    Object.keys(byUnit).sort().forEach(unit => {
        const record = byUnit[unit].find(r => r.date === '2024-12-02');
        if (record) {
            console.log(`  ${unit}: €${record.amount} (${record.transactions} transactions)`);
        } else {
            console.log(`  ${unit}: NO DATA`);
        }
    });

    // Now let's look at 2024-12-16 (which contains data for week 15/12-21/12 based on output)
    console.log('\n\nActual Supabase data for 2024-12-16:');
    Object.keys(byUnit).sort().forEach(unit => {
        const record = byUnit[unit].find(r => r.date === '2024-12-16');
        if (record) {
            console.log(`  ${unit}: €${record.amount} (${record.transactions} transactions)`);
        } else {
            console.log(`  ${unit}: NO DATA`);
        }
    });
}

verifyWeeklyAlignment();
