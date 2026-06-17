const supabase = require('../supabase');

async function checkSchema() {
    const { data, error } = await supabase.from('inventario_usuario').select('*').limit(1);
    console.log('inventario_usuario error:', error);
    if (data) {
        if (data.length > 0) {
            console.log('Columns in inventario_usuario:', Object.keys(data[0]));
        } else {
            console.log('No data in inventario_usuario to infer columns. Trying an insert to get error details.');
            const { error: e2 } = await supabase.from('inventario_usuario').insert({}).select();
            console.log('Insert error:', e2);
        }
    }
}
checkSchema();
