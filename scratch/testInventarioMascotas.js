require('dotenv').config();
const supabase = require('../supabase');

async function test() {
    console.log('Testing inventario_mascotas...');
    const { data, error } = await supabase
        .from('inventario_mascotas')
        .select(`
            id,
            discord_id,
            equiped,
            mascotas (
                id,
                title,
                mascotas_buffos (*)
            )
        `)
        .limit(1);
    
    console.log('Data:', JSON.stringify(data, null, 2));
    console.log('Error:', error);
}

test();
