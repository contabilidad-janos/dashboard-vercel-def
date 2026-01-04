import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkCrossover() {
    console.log("Checking sales_records for late 2024...");
    const { data, error } = await supabase
        .from('sales_records')
        .select('*')
        .gte('date', '2024-12-20')
        .order('date', { ascending: true });

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log(`Found ${data.length} records.`);
    // console.log(JSON.stringify(data, null, 2));
    const fs = await import('fs');
    fs.writeFileSync('scripts/crossover_output.json', JSON.stringify(data, null, 2));
    console.log("Wrote data to scripts/crossover_output.json");
}

checkCrossover();
