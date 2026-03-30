import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_ANON_KEY;
// Need a service role key or API key that can write.
const serviceKey = envConfig.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
});

async function runTest() {
    // 1. Insert a mock row with a specific date and volume
    const mockDate = "2026-12-30";
    const mockBu = "TEST_BU";

    console.log("Inserting full row...");
    const { data: insertData, error: insertError } = await supabaseAdmin
        .from('sales_daily_def')
        .upsert({ date: mockDate, business_unit: mockBu, revenue: 100, VOLUME: 50 }, { onConflict: 'date, business_unit' })
        .select();

    if (insertError) {
        // Maybe onConflict is different or id is PK?
        console.log("Error inserting:", insertError);
        console.log("Trying to find existing PK...");
        // Let's just create a completely random date/BU
        const { data: d2, error: e2 } = await supabaseAdmin.from('sales_daily_def').insert({ date: mockDate, business_unit: mockBu, revenue: 100, VOLUME: 50 }).select();
        console.log("Insert result:", e2 || d2);
    } else {
        console.log("Inserted:", insertData);
    }

    // 2. Perform a partial upsert for ONLY revenue
    console.log("Upserting partial row (only revenue)...");
    const { data: partialData, error: partialError } = await supabaseAdmin
        .from('sales_daily_def')
        .upsert({ date: mockDate, business_unit: mockBu, revenue: 200 }, { onConflict: 'date, business_unit' })
        .select();

    console.log("Partial upsert result:");
    console.log("Error:", partialError);
    console.log("Data:", partialData);

    // Clean up
    await supabaseAdmin.from('sales_daily_def').delete().eq('business_unit', mockBu);
}

runTest();
