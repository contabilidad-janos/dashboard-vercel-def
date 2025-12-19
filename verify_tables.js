import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable(tableName) {
    console.log(`Checking table: ${tableName}...`);
    const { data, error } = await supabase.from(tableName).select('*').limit(1);
    if (error) {
        console.error(`Error accessing ${tableName}:`, error.message);
    } else {
        console.log(`Success! ${tableName} found. Row count: ${data.length}`);
        if (data.length > 0) console.log('Sample:', data[0]);
    }
}

async function verify() {
    await checkTable('sales_daily_def');
    await checkTable('def_daily_sales');
    await checkTable('sales_records');
}

verify();
