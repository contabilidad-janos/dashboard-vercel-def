
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    console.log('Checking Business Units...');
    // Try to select group_name
    const { data, error } = await supabase.from('business_units').select('name, group_name').limit(5);

    if (error) {
        console.error('Error selecting group_name:', error.message);
        console.log('DIAGNOSIS: The "group_name" column likely does not exist.');
    } else {
        console.log('Business Units found:', data);
        if (data.length === 0) console.log('DIAGNOSIS: Table is empty.');
    }
}
check();
