
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkNames() {
    console.log('Checking for Business Unit Names...');
    const { data, error } = await supabase
        .from('sales_records')
        .select('date, business_unit_name, amount')
        .limit(5);

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Sample Records:');
        console.table(data);
    }
}
checkNames();
