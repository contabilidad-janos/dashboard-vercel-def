const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://agjvhvjhrmwkvszyjitl.supabase.co';
const supabaseKey = 'sb_secret_3GAd2foZF7fMfuMYv1kyAg_i6nHeOUc';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDate() {
    // Fetch 5 rows to see variations
    const { data, error } = await supabase
        .from('ventas can escarrer')
        .select('Fecha')
        .limit(5);

    if (error) {
        console.log('Error:', error.message);
    } else {
        console.log('Sample Fechas:', JSON.stringify(data, null, 2));
        if (data.length > 0) {
            console.log('Type of Fecha:', typeof data[0].Fecha);
        }
    }
}
checkDate();
