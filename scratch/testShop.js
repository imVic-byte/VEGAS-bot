const supabase = require('../supabase');

async function test() {
    const { data: m, error: em } = await supabase.from('mascotas').select('*');
    console.log('Mascotas sin filtro:', m, em);
    
    const { data: r, error: er } = await supabase.from('roles').select('*');
    console.log('Roles sin filtro:', r, er);
    
    const { data: t, error: et } = await supabase.from('titles').select('*');
    console.log('Titles sin filtro:', t, et);
    
    const { data: tienda, error: eti } = await supabase.from('tienda').select('*');
    console.log('Tienda (vieja tabla):', tienda, eti);
}
test();
