const supabase = require('../supabase');

async function testCols(tableName, cols) {
    const { error } = await supabase.from(tableName).insert([cols]).select();
    console.log(`Insert into ${tableName} with ${Object.keys(cols)} ->`, error ? error.message : 'Success');
}

async function test() {
    await testCols('inventario_mascotas', { discord_id: '1', mascota_id: 1 });
    await testCols('inventario_mascotas', { discord_id: '1', item_id: 1 });
    await testCols('inventario_mascotas', { discord_id: '1', id_mascota: 1 });

    await testCols('inventario_titulos', { discord_id: '1', titulo_id: 1 });
    await testCols('inventario_titulos', { discord_id: '1', item_id: 1 });
    await testCols('inventario_titulos', { discord_id: '1', title_id: 1 });
    await testCols('inventario_titulos', { discord_id: '1', id_titulo: 1 });

    await testCols('inventario_roles', { discord_id: '1', rol_id: 1 });
    await testCols('inventario_roles', { discord_id: '1', role_id: 1 });
    await testCols('inventario_roles', { discord_id: '1', item_id: 1 });
    await testCols('inventario_roles', { discord_id: '1', id_rol: 1 });
}
test();
