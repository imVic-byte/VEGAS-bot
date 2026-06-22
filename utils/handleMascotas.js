const supabase = require('../supabase');

/**
 * Obtiene todas las mascotas (activas por defecto) junto con sus buffos.
 * @returns {Promise<Array|null>} Array de mascotas o null en caso de error.
 */
async function getMascotas() {
  const { data, error } = await supabase
    .from('mascotas')
    .select(`
      *,
      mascotas_buffos (*)
    `)
    .eq('is_active', true)
    .order('price', { ascending: true });

  if (error) {
    console.error('Error fetching mascotas:', error);
    return null;
  }
  return data;
}

/**
 * Obtiene una mascota por su ID junto con sus buffos.
 * @param {number} id 
 * @returns {Promise<Object|null>} La mascota encontrada o null.
 */
async function getMascotaById(id) {
  const { data, error } = await supabase
    .from('mascotas')
    .select(`
      *,
      mascotas_buffos (*)
    `)
    .eq('id', id)
    .order('id', { ascending: true })
    .single();

  if (error) {
    console.error(`Error fetching mascota with id ${id}:`, error);
    return null;
  }
  return data;
}

module.exports = {
  getMascotas,
  getMascotaById
};
