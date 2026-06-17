const supabase = require('../supabase');

/**
 * Obtiene todos los títulos de la base de datos.
 * @returns {Promise<Array|null>} Array de títulos o null en caso de error.
 */
async function getTitles() {
  const { data, error } = await supabase
    .from('titles')
    .select('*');

  if (error) {
    console.error('Error fetching titles:', error);
    return null;
  }
  return data;
}

/**
 * Obtiene un título por su ID.
 * @param {number} id 
 * @returns {Promise<Object|null>} El título encontrado o null.
 */
async function getTitleById(id) {
  const { data, error } = await supabase
    .from('titles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Error fetching title with id ${id}:`, error);
    return null;
  }
  return data;
}

module.exports = {
  getTitles,
  getTitleById
};
