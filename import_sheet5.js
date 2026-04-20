import fs from 'fs';
import { parse } from 'csv-parse';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
// Use the write-capable key
const supabaseKey = envConfig.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || envConfig.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CSV_FILE = 'downloadbyjanos/REPORTING PARA BASE DE DATOS - Sheet5 (11).csv';
const TABLE_NAME = 'sales_daily_def';

async function importCsv() {
    console.log('Starting CSV processing...');
    const records = [];

    const parser = fs.createReadStream(CSV_FILE)
        .pipe(parse({
            delimiter: ',',
            from_line: 3, // Skip the two header lines
            relax_quotes: true,
            relax_column_count: true
        }));

    let batchCount = 0;

    for await (const record of parser) {
        if (record.length < 14) continue; // Not enough columns

        // We only care about the aggregation columns on the right
        const dateStr = record[11]?.trim();
        const bgStr = record[12]?.trim();
        let revStr = record[13]?.trim();

        if (!dateStr || !bgStr || dateStr === '' || bgStr === '') continue;

        // Skip if bgStr is "Total" or similar
        if (bgStr.toUpperCase() === 'TOTAL' || bgStr.toUpperCase() === 'BU') continue;

        // Parse Date: it's in M/D/YYYY format usually from Google Sheets Spanish/US mix
        // e.g., 1/1/2024 -> 2024-01-01
        let formattedDate = null;
        try {
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                // Sheet5 CSV screenshot shows "1/2/2024" which is Jan 2 or Feb 1. 
                // The record: ,2024,01 Enero,1/2/2024
                // So it's M/D/YYYY because "01 Enero" matches "1/" at start.
                let month = parts[0];
                let day = parts[1];
                let year = parts[2];

                if (month.length === 1) month = '0' + month;
                if (day.length === 1) day = '0' + day;
                formattedDate = `${year}-${month}-${day}`;
            }
        } catch (e) {
            console.error("Error parsing date:", dateStr);
            continue;
        }

        // Parse Revenue
        let revenue = 0;
        if (revStr && revStr !== '-') {
            // Remove quotes and commas
            revStr = revStr.replace(/["€\s,]/g, '');
            revenue = parseFloat(revStr) || 0;
        }

        records.push({
            date: formattedDate,
            business_unit: bgStr,
            revenue: revenue
            // We DO NOT send VOLUME or other data, only revenue, to perform a partial upsert!
        });
    }

    console.log(`Parsed ${records.length} valid aggregated rows.`);

    // Dedup if there are duplicates for the same day/bu in the sheet logic mapping
    const dedupedRecords = [];
    const seenMap = new Map();
    for (const r of records) {
        const key = `${r.date}_${r.business_unit}`;
        // In Sheet5, there supposedly is only ONE aggregated total per Day/BU, but just in case,
        // we sum or overwrite? If it's Total Día, we just overwrite (there should only be one).
        if (!seenMap.has(key)) {
            seenMap.set(key, true);
            dedupedRecords.push(r);
        }
    }

    console.log(`Deduped to ${dedupedRecords.length} unique Daily-BU rows.`);
    // print first 5 rows to debug
    console.log("Sample records:", dedupedRecords.slice(0, 5));

    // Batch insert
    const BATCH_SIZE = 500;
    for (let i = 0; i < dedupedRecords.length; i += BATCH_SIZE) {
        const batch = dedupedRecords.slice(i, i + BATCH_SIZE);
        console.log(`Upserting batch ${i / BATCH_SIZE + 1} (${batch.length} records)...`);

        const { data, error } = await supabase
            .from(TABLE_NAME)
            .upsert(batch, { onConflict: 'date, business_unit' });

        if (error) {
            console.error(`Error in batch ${i / BATCH_SIZE + 1}:`, error.message);
        }
    }
    console.log('Finished uploading CSV.');
}

importCsv();
