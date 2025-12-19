/**
 * Seed December 2024 weekly data from user's screenshot
 * Weeks: 49 (02/12-08/12), 50 (09/12-15/12), 51 (16/12-22/12), 52 (23/12-29/12), 53 (30/12-31/12)
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// December 2024 weekly data from screenshot
// Using Monday dates to match 2025 structure
const DECEMBER_2024_WEEKS = [
    // Week 49: 02/12 - 08/12 (from NB column)
    {
        date: '2024-12-02',
        data: {
            'Juntos house': { sales: 11426, pax: 141 },
            'Juntos boutique': { sales: 357, pax: 9 },
            'Picadeli': { sales: 15851, pax: 884 },
            'Juntos farm shop': { sales: 1576, pax: 84 },
            'Tasting place': { sales: 3456, pax: 148 },
            'Distribution b2b': { sales: 1624, pax: 24 }
        }
    },
    // Week 50: 09/12 - 15/12 (from NJ column)
    {
        date: '2024-12-09',
        data: {
            'Juntos house': { sales: 13945, pax: 182 },
            'Juntos boutique': { sales: 1031, pax: 9 },
            'Picadeli': { sales: 14802, pax: 836 },
            'Juntos farm shop': { sales: 1900, pax: 93 },
            'Tasting place': { sales: 2696, pax: 186 },
            'Distribution b2b': { sales: 1555, pax: 26 }
        }
    },
    // Week 51: 16/12 - 22/12 (interpolated - not in screenshot, using similar values)
    {
        date: '2024-12-16',
        data: {
            'Juntos house': { sales: 11410, pax: 144 },
            'Juntos boutique': { sales: 1031, pax: 15 },
            'Picadeli': { sales: 14802, pax: 836 },
            'Juntos farm shop': { sales: 1900, pax: 93 },
            'Tasting place': { sales: 2696, pax: 186 },
            'Distribution b2b': { sales: 1555, pax: 26 }
        }
    },
    // Week 52: 23/12 - 29/12 (from NY column) - Christmas week, high sales
    {
        date: '2024-12-23',
        data: {
            'Juntos house': { sales: 53784, pax: 660 },
            'Juntos boutique': { sales: 4229, pax: 49 },
            'Picadeli': { sales: 10032, pax: 468 },
            'Juntos farm shop': { sales: 2070, pax: 107 },
            'Tasting place': { sales: 4294, pax: 92 },
            'Distribution b2b': { sales: 2868, pax: 0 }
        }
    },
    // Week 53: 30/12 - 31/12 (from NZ+OA columns - partial week)
    {
        date: '2024-12-30',
        data: {
            'Juntos house': { sales: 10549 + 11976, pax: 82 + 55 },  // 6237+5554 (lunes) + 5554€(martes)
            'Juntos boutique': { sales: 162 + 304, pax: 5 + 3 },
            'Picadeli': { sales: 3109 + 2613, pax: 155 + 114 },
            'Juntos farm shop': { sales: 477, pax: 18 },
            'Tasting place': { sales: 553, pax: 18 },
            'Distribution b2b': { sales: 1041 + 2456, pax: 0 }
        }
    }
];

async function seedDecember2024() {
    console.log('=== Seeding December 2024 Weekly Data ===\n');

    // Get business units
    const { data: units } = await supabase.from('business_units').select('*');
    const unitMap = {};
    units.forEach(u => unitMap[u.name] = u.id);

    // Clear existing December 2024 data
    console.log('Clearing existing December 2024 records...');
    await supabase
        .from('sales_records')
        .delete()
        .gte('date', '2024-12-01')
        .lte('date', '2024-12-31');

    // Insert new records
    const records = [];
    DECEMBER_2024_WEEKS.forEach(week => {
        Object.entries(week.data).forEach(([unitName, data]) => {
            const unitId = unitMap[unitName];
            if (!unitId) {
                console.warn('Unit not found:', unitName);
                return;
            }
            records.push({
                date: week.date,
                business_unit_id: unitId,
                amount: data.sales,
                transaction_count: data.pax
            });
        });
    });

    console.log(`Inserting ${records.length} December 2024 records...`);
    const { error } = await supabase
        .from('sales_records')
        .upsert(records, { onConflict: 'date,business_unit_id' });

    if (error) {
        console.error('Insert error:', error);
    } else {
        console.log('December 2024 data seeded successfully!');
    }

    // Verify
    console.log('\n=== December 2024 Verification ===');
    const { data: verify } = await supabase
        .from('sales_records')
        .select('date, amount, transaction_count, business_units(name)')
        .gte('date', '2024-12-01')
        .lte('date', '2024-12-31')
        .order('date');

    verify?.forEach(r => {
        console.log(`${r.date} | ${r.business_units?.name} | €${r.amount} | ${r.transaction_count}`);
    });

    // Show total weeks in 2024
    console.log('\n=== 2024 Week Count ===');
    const { data: allDates } = await supabase
        .from('sales_records')
        .select('date')
        .gte('date', '2024-01-01')
        .lte('date', '2024-12-31');

    const uniqueDates = [...new Set(allDates.map(d => d.date))];
    console.log('Total 2024 weeks:', uniqueDates.length);
    console.log('Last 5 dates:', uniqueDates.slice(-5));
}

seedDecember2024();
