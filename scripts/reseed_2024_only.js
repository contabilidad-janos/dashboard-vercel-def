
/**
 * Reseed Script for 2024 Data Only
 * Usage: node scripts/reseed_2024_only.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
    BUSINESS_UNITS_CONFIG,
    RAW_WEEKLY_DATA_2024
} from '../src/data/SEED_DATA.js';

// Load env
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed2024() {
    console.log('Starting 2024 Reseed...');

    // 1. Fetch Units to map names to IDs
    const { data: units, error: unitError } = await supabase.from('business_units').select('*');
    if (unitError) {
        console.error('Error fetching units:', unitError);
        return;
    }
    const unitMap = {};
    units.forEach(u => unitMap[u.name] = u.id);

    // 2. Clear existing 2024 records
    console.log('Clearing old 2024 records...');
    const { error: delete2024Error } = await supabase
        .from('sales_records')
        .delete()
        .gte('date', '2024-01-01')
        .lte('date', '2024-12-31');

    if (delete2024Error) {
        console.error('Error clearing old 2024 records:', delete2024Error);
        return;
    }

    // 3. Populate 2024
    console.log('Seeding 2024...');
    const salesRecords2024 = [];

    // Helper to map simplified keys to unit names
    const rawKeyMap = {
        'jh': 'Juntos house',
        'jb': 'Juntos boutique',
        'pic': 'Picadeli',
        'jfs': 'Juntos farm shop',
        'tp': 'Tasting place',
        'b2b': 'Distribution b2b'
    };

    RAW_WEEKLY_DATA_2024.forEach((row) => {
        // row.r is date range e.g. "01/01-05/01"
        // We assume year 2024
        const dateRange = row.r;
        const startStr = dateRange.split('-')[0]; // "01/01"
        const [day, month] = startStr.split('/');
        const date = `2024-${month}-${day}`;

        Object.keys(rawKeyMap).forEach(key => {
            const unitName = rawKeyMap[key];
            const unitId = unitMap[unitName];

            if (!unitId) return;

            const unitData = row[key];
            const volume = unitData?.v || 0;     // Transaction Count
            const spend = unitData?.s || 0;      // Spend per transaction
            const sales = Math.round(volume * spend); // Monthly sales calculation

            // Important: Seed even if 0 to ensure data points exist for charts
            salesRecords2024.push({
                date: date,
                business_unit_id: unitId,
                amount: sales,
                transaction_count: volume
            });
        });
    });

    if (salesRecords2024.length > 0) {
        const { error: sales2024Error } = await supabase.from('sales_records').upsert(salesRecords2024, { onConflict: 'date,business_unit_id' });
        if (sales2024Error) console.error('Error seeding 2024 sales:', sales2024Error);
        else console.log(`Success! Seeded ${salesRecords2024.length} records for 2024.`);
    } else {
        console.log('No records generated from RAW data.');
    }
}

seed2024();
