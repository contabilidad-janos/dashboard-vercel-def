
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function verify() {
    console.log('Verifying connection...');
    const { data, error } = await supabase.from('sales_records').select('count', { count: 'exact', head: true });

    if (error) {
        console.error('Connection Check Failed:', error.message);
        if (error.code === '42P01') {
            console.log('Result: Database connected, but tables do not exist (Schema missing).');
        } else if (error.code === 'PGRST301') {
            console.log('Result: JWT/Key invalid or RLS issue.');
        } else {
            console.log('Result: detailed error', error);
        }
    } else {
        console.log('Result: Connection Successful! Tables exist.');
    }
}
verify();
