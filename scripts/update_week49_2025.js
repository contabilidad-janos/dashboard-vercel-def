/**
 * Update Week 49 (Dec 1-7, 2025) with correct data and clear future weeks
 * Data from user's screenshot
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// Week 49 2025 data from screenshot (01/12 - 07/12)
const WEEK_49_DATA = {
    'Juntos house': { sales: 6556, pax: 108 },
    'Juntos boutique': { sales: 629, pax: 10 },
    'Picadeli': { sales: 15907, pax: 919 },
    'Juntos farm shop': { sales: 3095, pax: 144 },
    'Tasting place': { sales: 6136, pax: 281 },
    'Distribution b2b': { sales: 2369, pax: 34 }
};

async function update() {
    console.log('=== Updating Week 49 (Dec 1-7, 2025) ===\n');

    // Get business units
    const { data: units } = await supabase.from('business_units').select('*');
    const unitMap = {};
    units.forEach(u => unitMap[u.name] = u.id);

    // 1. Delete ALL December 2025 data (we'll re-add Week 49 only)
    console.log('Clearing December 2025 records...');
    const { error: delError } = await supabase
        .from('sales_records')
        .delete()
        .gte('date', '2025-12-01')
        .lte('date', '2025-12-31');

    if (delError) console.error('Delete error:', delError);

    // 2. Insert Week 49 (Dec 1st as the date)
    const records = [];
    Object.entries(WEEK_49_DATA).forEach(([unitName, data]) => {
        const unitId = unitMap[unitName];
        if (!unitId) {
            console.warn('Unit not found:', unitName);
            return;
        }
        records.push({
            date: '2025-12-01',
            business_unit_id: unitId,
            amount: data.sales,
            transaction_count: data.pax
        });
    });

    console.log('Inserting Week 49 data...');
    const { error: insError } = await supabase
        .from('sales_records')
        .upsert(records, { onConflict: 'date,business_unit_id' });

    if (insError) {
        console.error('Insert error:', insError);
    } else {
        console.log('Week 49 data inserted successfully!');
    }

    // 3. Verify
    console.log('\n=== Verification ===');
    const { data: verify } = await supabase
        .from('sales_records')
        .select('date, amount, transaction_count, business_units(name)')
        .gte('date', '2025-12-01')
        .order('date');

    verify?.forEach(r => {
        console.log(`${r.date} | ${r.business_units?.name} | €${r.amount} | ${r.transaction_count} pax/tickets`);
    });

    // 4. Show what weeks exist now in 2025
    console.log('\n=== All 2025 dates in DB ===');
    const { data: allDates } = await supabase
        .from('sales_records')
        .select('date')
        .gte('date', '2025-01-01')
        .order('date');

    const uniqueDates = [...new Set(allDates.map(d => d.date))];
    console.log('Total weeks:', uniqueDates.length);
    console.log('Last 5 dates:', uniqueDates.slice(-5));
}

update();
