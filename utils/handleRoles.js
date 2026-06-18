const supabase = require('../supabase');

/**
 * Obtiene todos los roles activos de la base de datos.
 * @returns {Promise<Array|null>} Array de roles o null en caso de error.
 */
async function getRoles() {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching roles:', error);
    return null;
  }
  return data;
}

/**
 * Obtiene un rol por su ID de tabla.
 * @param {number} id 
 * @returns {Promise<Object|null>} El rol encontrado o null.
 */
async function getRoleById(id) {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Error fetching role with id ${id}:`, error);
    return null;
  }
  return data;
}

/**
 * Obtiene un rol por su ID de discord.
 * @param {string} discordRoleId 
 * @returns {Promise<Object|null>} El rol encontrado o null.
 */
async function getRoleByDiscordId(discordRoleId) {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .eq('discord_role_id', discordRoleId)
    .single();

  if (error) {
    console.error(`Error fetching role with discord id ${discordRoleId}:`, error);
    return null;
  }
  return data;
}

module.exports = {
  getRoles,
  getRoleById,
  getRoleByDiscordId
};
