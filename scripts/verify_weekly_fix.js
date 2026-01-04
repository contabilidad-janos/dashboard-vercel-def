import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function verifyWeeklyFix() {
    console.log("--- Verifying 2024 Weekly Comparison Data Fix ---");

    // 1. Fetch Late 2024 Data (Last few days of Year)
    const { data: data2024 } = await supabase
        .from('sales_records')
        .select('amount, date, business_units(name)')
        .gte('date', '2024-12-29')
        .lte('date', '2024-12-31');

    // 2. Fetch Early 2025 Data (First few days of Year)
    const { data: data2025 } = await supabase
        .from('sales_records')
        .select('amount, date, business_units(name)')
        .gte('date', '2025-01-01')
        .lte('date', '2025-01-05');

    console.log(`\nRecords found for Dec 29-31, 2024: ${data2024.length}`);
    console.log(`Records found for Jan 01-05, 2025: ${data2025.length}`);

    // 3. Aggregate by Business Unit
    const totals = {};

    [...data2024, ...data2025].forEach(r => {
        const unit = r.business_units.name;
        if (!totals[unit]) totals[unit] = 0;
        totals[unit] += Number(r.amount);
    });

    console.log("\n--- Corrected Totals for Comparison Week (Dec 29 - Jan 4) ---");
    console.table(totals);

    const totalGroup = Object.values(totals).reduce((a, b) => a + b, 0);
    console.log(`\nTOTAL GROUP COMPARISON (2024 Adjusted): €${totalGroup.toLocaleString()}`);
}

verifyWeeklyFix();
