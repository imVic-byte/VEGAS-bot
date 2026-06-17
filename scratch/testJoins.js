const supabase = require('../supabase');

async function testQuery() {
    const discordId = 'test';
    
    const { data: m, error: em } = await supabase
        .from('inventario_mascotas')
        .select(`mascotas(title)`)
        .eq('discord_id', discordId);
    console.log('Mascotas error:', em);
        
    const { data: r, error: er } = await supabase
        .from('inventario_roles')
        .select(`roles(title)`)
        .eq('discord_id', discordId);
    console.log('Roles error:', er);
        
    const { data: t, error: et } = await supabase
        .from('inventario_titulos')
        .select(`titles(name)`)
        .eq('discord_id', discordId);
    console.log('Titles error:', et);
}
testQuery();
