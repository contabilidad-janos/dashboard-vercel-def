import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function verifyDecemberData() {
    console.log('Verifying December 2024 Data in Supabase...\n');

    // Fetch all records for December 2024
    const { data, error } = await supabase
        .from('sales_records')
        .select('date, amount, transaction_count, business_units(name)')
        .gte('date', '2024-12-01')
        .lte('date', '2024-12-31')
        .order('date', { ascending: true });

    if (error) {
        console.error('Error fetching December data:', error);
        return;
    }

    console.log(`Total December 2024 records in DB: ${data.length}\n`);

    // Group by date for weekly analysis
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

    console.log('Records grouped by date:');
    Object.keys(byDate).sort().forEach(date => {
        console.log(`\n${date}:`);
        byDate[date].forEach(r => {
            console.log(`  ${r.unit}: €${r.amount}, ${r.transactions} transactions`);
        });
    });

    // Check specifically for week 01/12-07/12
    console.log('\n\n=== Week 01/12-07/12 Analysis ===');
    const weekDates = ['2024-12-01', '2024-12-02', '2024-12-03', '2024-12-04', '2024-12-05', '2024-12-06', '2024-12-07'];

    const weekData = data.filter(r => weekDates.includes(r.date));
    console.log(`Records in week 01/12-07/12: ${weekData.length}`);

    // Aggregate by unit for this week
    const weekSummary = {};
    weekData.forEach(r => {
        const unit = r.business_units?.name || 'Unknown';
        if (!weekSummary[unit]) weekSummary[unit] = { amount: 0, transactions: 0 };
        weekSummary[unit].amount += Number(r.amount);
        weekSummary[unit].transactions += Number(r.transaction_count);
    });

    console.log('\nWeek 01/12-07/12 Summary by Business Unit:');
    Object.keys(weekSummary).sort().forEach(unit => {
        const s = weekSummary[unit];
        console.log(`  ${unit}: €${s.amount} total, ${s.transactions} transactions`);
    });

    // Check what weeks exist in December
    console.log('\n=== All Unique December Dates ===');
    const uniqueDates = [...new Set(data.map(r => r.date))].sort();
    console.log('Dates with data:', uniqueDates.join(', '));
}

verifyDecemberData();
