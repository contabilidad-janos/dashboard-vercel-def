const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://agjvhvjhrmwkvszyjitl.supabase.co';
// Using SERVICE ROLE KEY to bypass RLS and see if table exists
const supabaseKey = 'sb_secret_3GAd2foZF7fMfuMYv1kyAg_i6nHeOUc';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    const trials = [
        'ventas CAN ESCARRER',
        'ventas_can_escarrer',
        'Ventas Can Escarrer',
        'ventas-can-escarrer',
        'VENTAS CAN ESCARRER',
        'ventascanescarrer'
    ];

    for (const table of trials) {
        console.log(`Trying table: "${table}"...`);
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (!error) {
            console.log(`SUCCESS! Found table as "${table}"`);
            if (data.length > 0) {
                console.log('Sample Row Keys:', Object.keys(data[0]));
                console.log('Sample Row Data:', JSON.stringify(data[0], null, 2));
            } else {
                console.log('Table found but empty.');
            }
            return;
        } else {
            console.log(`Failed: ${error.message}`);
        }
    }
    console.error('ALL ATTEMPTS FAILED.');
}
inspect();
