/**
 * Correct December 2024 + Week 49 2025 data
 * node scripts/correct_data.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// From CSV: December 2024 weekly data
const DEC_2024 = [
    {
        date: '2024-12-02', jh: 14328, jb: 1962, pic: 18705, jfs: 3998, tp: 4700, b2b: 10728,
        jh_p: 195, jb_p: 18, pic_p: 1019, jfs_p: 182, tp_p: 160, b2b_p: 47
    },
    {
        date: '2024-12-09', jh: 8420, jb: 620, pic: 16922, jfs: 5397, tp: 7064, b2b: 2655,
        jh_p: 112, jb_p: 13, pic_p: 981, jfs_p: 169, tp_p: 369, b2b_p: 32
    },
    {
        date: '2024-12-16', jh: 6556, jb: 629, pic: 15907, jfs: 3095, tp: 6136, b2b: 2369,
        jh_p: 108, jb_p: 10, pic_p: 919, jfs_p: 144, tp_p: 281, b2b_p: 34
    }
];

// From CSV: Week 49 2025 (01/12 - 07/12)
const WEEK49_2025 = {
    date: '2025-12-01',
    jh: 14328, jb: 1962, pic: 18705, jfs: 3998, tp: 4700, b2b: 10728,
    jh_p: 195, jb_p: 18, pic_p: 1019, jfs_p: 182, tp_p: 160, b2b_p: 47
};

const KEY_MAP = {
    'jh': 'Juntos house', 'jb': 'Juntos boutique', 'pic': 'Picadeli',
    'jfs': 'Juntos farm shop', 'tp': 'Tasting place', 'b2b': 'Distribution b2b'
};

async function run() {
    const { data: units } = await supabase.from('business_units').select('*');
    const unitMap = {};
    units.forEach(u => unitMap[u.name] = u.id);

    // Clear Dec 2024
    await supabase.from('sales_records').delete().gte('date', '2024-12-01').lte('date', '2024-12-31');

    // Insert Dec 2024
    const dec24 = [];
    DEC_2024.forEach(w => {
        Object.keys(KEY_MAP).forEach(k => {
            dec24.push({
                date: w.date,
                business_unit_id: unitMap[KEY_MAP[k]],
                amount: w[k],
                transaction_count: w[k + '_p']
            });
        });
    });
    await supabase.from('sales_records').upsert(dec24, { onConflict: 'date,business_unit_id' });
    console.log(`Dec 2024: Inserted ${dec24.length} records`);

    // Update Week 49 2025
    await supabase.from('sales_records').delete().eq('date', '2025-12-01');
    const w49 = [];
    Object.keys(KEY_MAP).forEach(k => {
        w49.push({
            date: WEEK49_2025.date,
            business_unit_id: unitMap[KEY_MAP[k]],
            amount: WEEK49_2025[k],
            transaction_count: WEEK49_2025[k + '_p']
        });
    });
    await supabase.from('sales_records').upsert(w49, { onConflict: 'date,business_unit_id' });
    console.log(`Week 49 2025: Inserted ${w49.length} records`);

    // Verify
    const { data: verify } = await supabase.from('sales_records')
        .select('date, amount, business_units(name)')
        .gte('date', '2024-12-01').lte('date', '2024-12-31');
    console.log('Dec 2024 verification:', verify?.length, 'records');
}

run();
