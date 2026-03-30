import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: countData, error } = await supabase
        .from('sales_daily_def')
        .select('*', { count: 'exact', head: true })
        .gte('date', '2025-01-01')
        .lte('date', '2025-12-31');
        
    if (error) {
        console.error(error);
        return;
    }
    
    console.log(`Found ${countData} records for 2025 in sales_daily_def`);
    
    // Check specific week: March 23 - March 29, 2025 (actually dates around March 24-30, 2025)
    const { data } = await supabase
        .from('sales_daily_def')
        .select('*')
        .gte('date', '2025-03-24')
        .lte('date', '2025-03-30');
    console.log(`Found ${data.length} records in Mar 24-30, 2025`);
}

check();
