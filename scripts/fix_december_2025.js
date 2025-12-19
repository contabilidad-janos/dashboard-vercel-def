import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// Missing amounts to add (Expected - Actual from daily data 12-02 to 12-07)
const MISSING_DATA = {
    'Picadeli': { sales: 15907 - 12843, trans: 919 - 740 },           // +3064, +179
    'Juntos farm shop': { sales: 3095 - 2833, trans: 144 - 127 },     // +262, +17
    'Distribution b2b': { sales: 2369 - 1743, trans: 34 - 26 }        // +626, +8
};

async function fixDecemberData() {
    console.log('=== Fixing December 2025 Data ===\n');

    // Step 1: Get business unit IDs
    const { data: units, error: unitsError } = await supabase
        .from('business_units')
        .select('id, name');

    if (unitsError) {
        console.error('Error fetching units:', unitsError);
        return;
    }

    const unitIdMap = {};
    units.forEach(u => unitIdMap[u.name] = u.id);
    console.log('Business unit IDs loaded.\n');

    // Step 2: Delete the erroneous 2025-12-01 records
    console.log('Step 1: Deleting erroneous 2025-12-01 records...');

    const { data: deletedData, error: deleteError } = await supabase
        .from('sales_records')
        .delete()
        .eq('date', '2025-12-01')
        .select();

    if (deleteError) {
        console.error('Error deleting 2025-12-01 records:', deleteError);
        return;
    }

    console.log(`  Deleted ${deletedData.length} records from 2025-12-01`);
    deletedData.forEach(r => {
        const unitName = units.find(u => u.id === r.business_unit_id)?.name || 'Unknown';
        console.log(`    - ${unitName}: €${r.amount}, ${r.transaction_count} trans`);
    });

    // Step 3: Insert missing data as 2025-12-01 records (to make week complete)
    console.log('\nStep 2: Inserting corrected data for missing amounts...');

    const insertData = [];
    for (const [unitName, vals] of Object.entries(MISSING_DATA)) {
        const unitId = unitIdMap[unitName];
        if (!unitId) {
            console.error(`  Could not find unit ID for: ${unitName}`);
            continue;
        }

        insertData.push({
            date: '2025-12-01',
            business_unit_id: unitId,
            amount: vals.sales,
            transaction_count: vals.trans
        });
        console.log(`  Adding ${unitName}: €${vals.sales}, ${vals.trans} trans on 2025-12-01`);
    }

    if (insertData.length > 0) {
        const { data: inserted, error: insertError } = await supabase
            .from('sales_records')
            .insert(insertData)
            .select();

        if (insertError) {
            console.error('Error inserting data:', insertError);
            return;
        }

        console.log(`  Successfully inserted ${inserted.length} records.`);
    }

    // Step 4: Verify the fix
    console.log('\n=== Verification ===');

    const { data: weekData, error: verifyError } = await supabase
        .from('sales_records')
        .select('date, amount, transaction_count, business_units(name)')
        .gte('date', '2025-12-01')
        .lte('date', '2025-12-07')
        .order('date', { ascending: true });

    if (verifyError) {
        console.error('Error verifying:', verifyError);
        return;
    }

    // Expected values from spreadsheet
    const expected = {
        'Juntos house': { sales: 6556, trans: 108 },
        'Juntos boutique': { sales: 629, trans: 10 },
        'Picadeli': { sales: 15907, trans: 919 },
        'Juntos farm shop': { sales: 3095, trans: 144 },
        'Tasting place': { sales: 6136, trans: 281 },
        'Distribution b2b': { sales: 2369, trans: 34 }
    };

    // Sum by unit
    const actual = {};
    weekData.forEach(r => {
        const unit = r.business_units?.name;
        if (!unit) return;
        if (!actual[unit]) actual[unit] = { sales: 0, trans: 0 };
        actual[unit].sales += Number(r.amount);
        actual[unit].trans += Number(r.transaction_count);
    });

    console.log('\nWeek 01/12-07/12 (2025) totals after fix:');
    let allGood = true;
    Object.entries(expected).forEach(([unit, exp]) => {
        const act = actual[unit] || { sales: 0, trans: 0 };
        const match = act.sales === exp.sales && act.trans === exp.trans;
        const status = match ? '✓' : '✗';
        if (!match) allGood = false;
        console.log(`  ${status} ${unit}: €${act.sales}/${act.trans} (expected €${exp.sales}/${exp.trans})`);
    });

    if (allGood) {
        console.log('\n✅ All data now matches the spreadsheet!');
    } else {
        console.log('\n⚠️  Some discrepancies remain. May need manual review.');
    }
}

fixDecemberData();
