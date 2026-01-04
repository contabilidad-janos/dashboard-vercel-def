const supabaseUrl = 'https://agjvhvjhrmwkvszyjitl.supabase.co';
const supabaseKey = 'sb_secret_3GAd2foZF7fMfuMYv1kyAg_i6nHeOUc';

async function listTables() {
    const url = `${supabaseUrl}/rest/v1/?apikey=${supabaseKey}`;
    try {
        console.log(`Fetching definitions from ${url}...`);
        const res = await fetch(url);
        if (!res.ok) {
            console.error('Failed to fetch definitions:', res.status, res.statusText);
            const text = await res.text();
            console.error(text);
            return;
        }
        const json = await res.json();

        // Supabase OpenAPI usually has "definitions"
        if (json.definitions) {
            const tables = Object.keys(json.definitions);
            console.log('--- TABLES FOUND ---');
            tables.forEach(t => console.log(t));

            const match = tables.find(t => t.toLowerCase().includes('ventas') || t.toLowerCase().includes('escarrer') || t.toLowerCase().includes('can'));
            if (match) {
                console.log(`\n*** MATCH DETAIL: "${match}" ***`);
                const props = json.definitions[match].properties;
                if (props) {
                    console.log('Columns:', Object.keys(props));
                }
            }
        } else {
            console.log('No definitions found. Keys:', Object.keys(json));
        }
    } catch (e) {
        console.error('Error:', e);
    }
}
listTables();
