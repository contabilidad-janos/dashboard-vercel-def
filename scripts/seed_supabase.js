/**
 * Seed Script to populate Supabase with local data
 * Usage: node scripts/seed_supabase.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
    BUSINESS_UNITS_CONFIG,
    SALES_2025_WEEKLY,
    TRANS_2025_WEEKLY,
    BUDGET_BY_UNIT_2025,
    WEEKLY_LABELS_2025,
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

async function seed() {
    console.log('Starting Seed...');

    // 1. Seed Business Units
    console.log('Seeding Business Units...');
    const unitMap = {}; // name -> id

    for (const unit of BUSINESS_UNITS_CONFIG) {
        const { data, error } = await supabase
            .from('business_units')
            .upsert({
                name: unit.name
            }, { onConflict: 'name' })
            .select();

        if (error) {
            console.error('Error upserting unit:', unit.name, error);
        } else {
            unitMap[unit.name] = data[0].id;
        }
    }
    console.log('Business Units synced:', Object.keys(unitMap));

    // 2. Seed Weekly Sales/Trans 2025
    console.log('Seeding Weekly Sales Records 2025...');

    // Clear existing 2025 records to avoid duplicates/granularity mix
    const { error: deleteError } = await supabase
        .from('sales_records')
        .delete()
        .gte('date', '2025-01-01')
        .lte('date', '2025-12-31');

    if (deleteError) console.error('Error clearing old 2025 records:', deleteError);
    else console.log('Cleared old 2025 records.');

    const salesRecords = [];

    for (const [unitName, unitId] of Object.entries(unitMap)) {
        const salesData = SALES_2025_WEEKLY[unitName];
        const transData = TRANS_2025_WEEKLY[unitName];

        if (!salesData) continue;

        salesData.forEach((amount, index) => {
            if (index >= WEEKLY_LABELS_2025.length) return;

            // Parse Date "DD/MM-DD/MM" -> Use start "DD/MM" -> "2025-MM-DD"
            const label = WEEKLY_LABELS_2025[index];
            const startStr = label.split('-')[0]; // "01/01"
            const [day, month] = startStr.split('/');
            const date = `2025-${month}-${day}`;

            salesRecords.push({
                date: date,
                business_unit_id: unitId,
                amount: amount,
                transaction_count: transData ? (transData[index] || 0) : 0
            });
        });
    }

    if (salesRecords.length > 0) {
        // Batch insert
        const { error: salesError } = await supabase.from('sales_records').upsert(salesRecords, { onConflict: 'date,business_unit_id' });
        if (salesError) console.error('Error seeding sales:', salesError);
        else console.log(`Seeded ${salesRecords.length} weekly sales records.`);
    }

    // 3. Seed Weekly Sales/Trans 2024
    console.log('Seeding Weekly Sales Records 2024...');

    // Clear existing 2024 records
    const { error: delete2024Error } = await supabase
        .from('sales_records')
        .delete()
        .gte('date', '2024-01-01')
        .lte('date', '2024-12-31');

    if (delete2024Error) console.error('Error clearing old 2024 records:', delete2024Error);
    else console.log('Cleared old 2024 records.');

    const salesRecords2024 = [];

    // Helper to map simplified keys to unit names
    const rawKeyMap = {
        'jh': 'Juntos house',
        'jb': 'Juntos boutique',
        'pic': 'Picadeli',
        'jfs': 'Juntos farm shop',
        'tp': 'Tasting place',
        'b2b': 'Distribution b2b'
        // Activities & Juntos Products seem missing in RAW 2024, assuming 0/null
    };

    // RAW_WEEKLY_DATA_2024 is already imported at top level

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

            if (sales === 0 && volume === 0) return;

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
        else console.log(`Seeded ${salesRecords2024.length} weekly records for 2024.`);
    }

    // 4. Seed Budget (Monthly 2025)
    console.log('Seeding Budget Targets...');
    const budgetRecords = [];

    for (const [unitName, unitId] of Object.entries(unitMap)) {
        const budgetData = BUDGET_BY_UNIT_2025[unitName];
        if (!budgetData) continue;

        budgetData.forEach((amount, index) => {
            if (amount === 0) return;

            const monthStr = String(index + 1).padStart(2, '0');
            const date = `2025-${monthStr}-01`;

            budgetRecords.push({
                month_start: date,
                business_unit_id: unitId,
                target_amount: amount
            });
        });
    }

    if (budgetRecords.length > 0) {
        const { error: budgetError } = await supabase.from('budget_targets').upsert(budgetRecords, { onConflict: 'month_start,business_unit_id' });
        if (budgetError) console.error('Error seeding budget:', budgetError);
        else console.log(`Seeded ${budgetRecords.length} budget records.`);
    }

    console.log('Seeding Complete!');
}

seed();
