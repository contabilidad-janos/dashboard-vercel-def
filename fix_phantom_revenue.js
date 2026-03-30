import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CSV_FILE = 'downloadbyjanos/REPORTING PARA BASE DE DATOS - Sheet5 (3).csv';
const TABLE_NAME = 'sales_daily_def';

async function fixPhantomRevenue() {
    console.log('Loading CSV records to build allowed set...');

    const csvContent = fs.readFileSync(CSV_FILE);
    const records = parse(csvContent, {
        delimiter: ',',
        from_line: 3,
        relax_quotes: true,
        relax_column_count: true
    });

    // We build a Set of `YYYY-MM-DD_BU` that ARE in the CSV.
    // We ONLY consider dates that have a parsed date.
    const validKeys = new Set();
    let minDate = "2099-01-01";
    let maxDate = "2000-01-01";

    for (const record of records) {
        if (record.length < 14) continue;
        const dateStr = record[11]?.trim();
        const bgStr = record[12]?.trim();

        if (!dateStr || !bgStr || dateStr === '' || bgStr === '') continue;
        if (bgStr.toUpperCase() === 'TOTAL' || bgStr.toUpperCase() === 'BU') continue;

        let formattedDate = null;
        try {
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                let month = parts[0];
                let day = parts[1];
                let year = parts[2];
                if (month.length === 1) month = '0' + month;
                if (day.length === 1) day = '0' + day;
                formattedDate = `${year}-${month}-${day}`;
            }
        } catch (e) {
            continue;
        }

        if (formattedDate) {
            validKeys.add(`${formattedDate}_${bgStr}`);
            if (formattedDate < minDate) minDate = formattedDate;
            if (formattedDate > maxDate) maxDate = formattedDate;
        }
    }

    console.log(`Loaded ${validKeys.size} valid CSV keys.`);
    console.log(`Date range in CSV: ${minDate} to ${maxDate}`);

    // Now fetch all records in Supabase within this date range.
    console.log("Fetching Supabase records in this range...");
    let allDbRecords = [];
    let page = 0;
    const PAGE_SIZE = 1000;

    while (true) {
        const { data, error } = await supabase
            .from(TABLE_NAME)
            .select('date, business_unit, revenue')
            .gte('date', minDate)
            .lte('date', maxDate)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) {
            console.error("Error fetching from supabase:", error);
            break;
        }

        if (!data || data.length === 0) break;
        allDbRecords = allDbRecords.concat(data);
        page++;
    }

    console.log(`Fetched ${allDbRecords.length} records from Supabase.`);

    const toZero = [];
    for (const dbRec of allDbRecords) {
        const key = `${dbRec.date}_${dbRec.business_unit}`;
        // If the row exists in Supabase, has revenue > 0, but is NOT in the new CSV (accounting system)...
        if (!validKeys.has(key) && dbRec.revenue > 0) {
            toZero.push({
                date: dbRec.date,
                business_unit: dbRec.business_unit,
                revenue: 0 // Set it to 0
            });
        }
    }

    console.log(`Found ${toZero.length} "phantom" rows with revenue > 0 not present in Sheet5.`);

    if (toZero.length > 0) {
        console.log(`Preview of to-zero rows (first 5):`, toZero.slice(0, 5));

        const BATCH_SIZE = 500;
        for (let i = 0; i < toZero.length; i += BATCH_SIZE) {
            const batch = toZero.slice(i, i + BATCH_SIZE);
            console.log(`Zeroing batch ${i / BATCH_SIZE + 1} (${batch.length} records)...`);
            const { error } = await supabase
                .from(TABLE_NAME)
                .upsert(batch, { onConflict: 'date, business_unit' });
            if (error) console.error("Error:", error);
        }
        console.log('Finished fixing phantom revenues.');
    } else {
        console.log('No phantom rows to fix.');
    }
}

fixPhantomRevenue();
