require('dotenv').config();
const supabase = require('../supabase');

async function test() {
    console.log('Testing inventario_titulos...');
    const { data, error } = await supabase
        .from('inventario_titulos')
        .select(`
            id,
            discord_id,
            equiped,
            titles (
                id,
                name,
                description
            )
        `)
        .limit(1);
    
    console.log('Data:', JSON.stringify(data, null, 2));
    console.log('Error:', error);
}

test();
