const supabase = require('../supabase');

async function test() {
    console.log("Fetching id 1 from mascotas...");
    const { data, error } = await supabase.from('mascotas').select('*').eq('id', 1).single();
    console.log("Result:", data, "Error:", error);
}
test();
