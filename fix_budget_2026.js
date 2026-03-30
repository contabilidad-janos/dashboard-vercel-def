import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CSV_FILE = 'downloadbyjanos/REPORTING PARA BASE DE DATOS - BUDGET 2026.csv';

const HEADERS = [
    null, // MES (0)
    'Juntos boutique', // 1
    'Juntos house', // 2
    'Picadeli', // 3
    'Juntos farm shop', // 4
    'Tasting place', // 5
    'Distribution b2b', // 6
    'Activities' // 7
];

async function updateBudget() {
    console.log('Fetching Business Units...');
    const { data: buList, error: buError } = await supabase
        .from('business_units')
        .select('id, name');

    if (buError) throw buError;

    const buIdMap = {};
    for (const bu of buList) {
        buIdMap[bu.name] = bu.id;
    }

    console.log('Reading CSV...');
    const records = parse(fs.readFileSync(CSV_FILE), {
        from_line: 3, // Data starts on line 3 (index 2)
        relax_column_count: true
    });

    const targetsToUpsert = [];

    for (const r of records) {
        const mesStr = r[0]?.trim();
        if (!mesStr) continue;
        const monthNum = parseInt(mesStr, 10);
        if (isNaN(monthNum)) continue;

        const dateString = `2026-${String(monthNum).padStart(2, '0')}-01`;

        for (let i = 1; i <= 7; i++) {
            const valStr = r[i]?.trim() || '0';
            const val = parseFloat(valStr.replace(/["€\s,]/g, '')) || 0;

            const buName = HEADERS[i];
            const buId = buIdMap[buName];

            if (!buId) {
                console.log("No BU ID for", buName);
                continue;
            }

            targetsToUpsert.push({
                business_unit_id: buId,
                month_start: dateString,
                target_amount: val // Exactly as appears in CSV without VAT subtractions
            });
        }
    }

    console.log(`Prepared ${targetsToUpsert.length} budget targets. Upserting...`);

    const { data, error } = await supabase
        .from('budget_targets')
        .upsert(targetsToUpsert, { onConflict: 'business_unit_id, month_start' })
        .select();

    if (error) {
        console.error("Error upserting:", error);
    } else {
        console.log("Successfully updated 2026 targets!");
    }
}

updateBudget();
