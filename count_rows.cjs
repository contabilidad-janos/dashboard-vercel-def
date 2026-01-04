const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://agjvhvjhrmwkvszyjitl.supabase.co';
const supabaseKey = 'sb_secret_3GAd2foZF7fMfuMYv1kyAg_i6nHeOUc'; // Service Role
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { count, error } = await supabase
        .from('ventas can escarrer')
        .select('*', { count: 'exact', head: true });

    if (error) console.log('Error:', error.message);
    else console.log('Row Count:', count);
}
check();
