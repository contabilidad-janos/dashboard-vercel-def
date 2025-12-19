
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function listUnits() {
    const { data, error } = await supabase.from('business_units').select('name, id').order('name');

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('--- UNIT MAPPING (Use these IDs in your CSV) ---');
        data.forEach(u => {
            console.log(`"${u.name}": ${u.id}`);
        });
        console.log('------------------------------------------------');
    }
}
listUnits();
