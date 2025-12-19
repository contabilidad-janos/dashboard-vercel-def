
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function verify() {
    console.log('Verifying Database Content...');

    // Check 2024
    const { count: count2024, error: err2024 } = await supabase
        .from('sales_records')
        .select('*', { count: 'exact', head: true })
        .gte('date', '2024-01-01')
        .lte('date', '2024-12-31');

    // Check 2025
    const { count: count2025, error: err2025 } = await supabase
        .from('sales_records')
        .select('*', { count: 'exact', head: true })
        .gte('date', '2025-01-01')
        .lte('date', '2025-12-31');

    if (err2024 || err2025) console.error('Error counting:', err2024, err2025);

    console.log(`2024 Records: ${count2024}`);
    console.log(`2025 Records: ${count2025}`);
}
verify();
