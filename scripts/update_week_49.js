
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const records = [
    // --- Juntos house ---
    { date: '2025-12-03', business_unit_name: 'Juntos house', amount: 1363, transaction_count: 22 },
    { date: '2025-12-04', business_unit_name: 'Juntos house', amount: 395, transaction_count: 6 },
    { date: '2025-12-05', business_unit_name: 'Juntos house', amount: 681, transaction_count: 12 },
    { date: '2025-12-06', business_unit_name: 'Juntos house', amount: 2479, transaction_count: 37 },
    { date: '2025-12-07', business_unit_name: 'Juntos house', amount: 1638, transaction_count: 31 },

    // --- Juntos boutique ---
    { date: '2025-12-05', business_unit_name: 'Juntos boutique', amount: 91, transaction_count: 2 },
    { date: '2025-12-06', business_unit_name: 'Juntos boutique', amount: 182, transaction_count: 3 },
    { date: '2025-12-07', business_unit_name: 'Juntos boutique', amount: 356, transaction_count: 5 },

    // --- Picadeli ---
    { date: '2025-12-01', business_unit_name: 'Picadeli', amount: 3064, transaction_count: 179 },
    { date: '2025-12-02', business_unit_name: 'Picadeli', amount: 2630, transaction_count: 170 },
    { date: '2025-12-03', business_unit_name: 'Picadeli', amount: 3269, transaction_count: 181 },
    { date: '2025-12-04', business_unit_name: 'Picadeli', amount: 2975, transaction_count: 167 },
    { date: '2025-12-05', business_unit_name: 'Picadeli', amount: 2593, transaction_count: 143 },
    { date: '2025-12-06', business_unit_name: 'Picadeli', amount: 1376, transaction_count: 79 },

    // --- Juntos farm shop ---
    { date: '2025-12-01', business_unit_name: 'Juntos farm shop', amount: 262, transaction_count: 17 },
    { date: '2025-12-02', business_unit_name: 'Juntos farm shop', amount: 405, transaction_count: 21 },
    { date: '2025-12-03', business_unit_name: 'Juntos farm shop', amount: 399, transaction_count: 21 },
    { date: '2025-12-04', business_unit_name: 'Juntos farm shop', amount: 678, transaction_count: 27 },
    { date: '2025-12-05', business_unit_name: 'Juntos farm shop', amount: 544, transaction_count: 24 },
    { date: '2025-12-06', business_unit_name: 'Juntos farm shop', amount: 807, transaction_count: 34 },

    // --- Tasting place ---
    // (Mon looks empty in img)
    { date: '2025-12-02', business_unit_name: 'Tasting place', amount: 481, transaction_count: 35 },
    { date: '2025-12-03', business_unit_name: 'Tasting place', amount: 326, transaction_count: 23 },
    { date: '2025-12-04', business_unit_name: 'Tasting place', amount: 379, transaction_count: 36 },
    { date: '2025-12-05', business_unit_name: 'Tasting place', amount: 405, transaction_count: 27 },
    { date: '2025-12-06', business_unit_name: 'Tasting place', amount: 4545, transaction_count: 160 }, // High value transcribed from image

    // --- Distribution b2b ---
    { date: '2025-12-01', business_unit_name: 'Distribution b2b', amount: 626, transaction_count: 8 },
    { date: '2025-12-02', business_unit_name: 'Distribution b2b', amount: 363, transaction_count: 5 },
    { date: '2025-12-03', business_unit_name: 'Distribution b2b', amount: 192, transaction_count: 3 },
    { date: '2025-12-04', business_unit_name: 'Distribution b2b', amount: 348, transaction_count: 8 },
    { date: '2025-12-05', business_unit_name: 'Distribution b2b', amount: 840, transaction_count: 10 },

    // --- Essential oils -> Juntos Products ---
    { date: '2025-12-02', business_unit_name: 'Juntos Products', amount: 175, transaction_count: 0 }, // No vol data seen
    { date: '2025-12-05', business_unit_name: 'Juntos Products', amount: 528, transaction_count: 0 }
];

async function updateData() {
    console.log(`Upserting ${records.length} records for Week 49...`);

    // We rely on the DB trigger 'link_business_unit' to find the IDs from the names
    const { data, error } = await supabase
        .from('sales_records')
        .upsert(records, { onConflict: 'date, business_unit_id' }); // Important: conflict resolution

    if (error) {
        console.error('Error inserting data:', error);
    } else {
        console.log('Success! Data updated.');
    }
}

updateData();
