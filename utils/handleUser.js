const supabase = require('../supabase');

/**
 * Obtiene la información del usuario junto con los buffos de su mascota activa (si la tiene).
 * @param {string} discordId El ID de Discord del usuario.
 * @returns {Promise<Object|null>} Un objeto con la info del usuario y sus buffos, o null en caso de error.
 */
async function getUserWithBuffs(discordId, serverId, guild = null) {
    try {
        // 1. Obtener información base del usuario
        const { data: userProfile, error: userError } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', discordId)
            .eq('server_id', serverId)
            .maybeSingle();

        if (userError || !userProfile) {
            console.error('Error fetching user profile:', userError);
            return null;
        }

        let displayName = discordId;
        if (guild) {
            try {
                const member = await guild.members.fetch(discordId);
                displayName = member.displayName;
            } catch {
                if (guild.client) {
                    try {
                        const user = await guild.client.users.fetch(discordId);
                        displayName = user.username;
                    } catch {}
                }
            }
        }

        // 2. Obtener mascota activa y sus buffos
        // Usamos maybeSingle() para no lanzar error si el usuario no tiene mascota equipada
        const { data: activePetData, error: petError } = await supabase
            .from('inventario_mascotas')
            .select(`
                mascotas (
                    id,
                    title,
                    mascotas_buffos (*)
                )
            `)
            .eq('discord_id', discordId)
            .eq('equiped', true)
            .maybeSingle();

        let buffs = [];
        let activePet = null;

        if (activePetData && activePetData.mascotas) {
            activePet = {
                id: activePetData.mascotas.id,
                title: activePetData.mascotas.title
            };

            if (activePetData.mascotas.mascotas_buffos) {
                buffs = activePetData.mascotas.mascotas_buffos;
            }
        }

        return {
            profile: userProfile,
            activePet: activePet,
            buffs: buffs,
            displayName: displayName
        };

    } catch (err) {
        console.error('Unexpected error in getUserWithBuffs:', err);
        return null;
    }
}

/**
 * Función auxiliar para aplicar los buffos a una cantidad base.
 * @param {number} baseAmount Cantidad base (ej. exp, coins ganadas).
 * @param {Array} buffs Array de buffos obtenidos de getUserWithBuffs.
 * @param {string} buffType Tipo de buffo a buscar ('coins', 'exp', etc.).
 * @returns {number} La cantidad final con el buffo porcentual aplicado (redondeada hacia abajo).
 */
function applyBuffs(baseAmount, buffs, buffType) {
    if (!buffs || buffs.length === 0) return baseAmount;

    let totalPercentageIncrease = 0;
    buffs.forEach(buff => {
        if (buff.boost_type === buffType) {
            totalPercentageIncrease += buff.boost_percentage;
        }
    });

    if (totalPercentageIncrease === 0) return baseAmount;

    const multiplier = 1 + (totalPercentageIncrease / 100);
    return Math.floor(baseAmount * multiplier);
}

/**
 * Función auxiliar para obtener el valor total bruto de un tipo de buffo.
 * Ideal para buffos aditivos (como "suerte") donde necesitas sumar directamente
 * la probabilidad en lugar de multiplicar.
 * @param {Array} buffs Array de buffos obtenidos de getUserWithBuffs.
 * @param {string} buffType Tipo de buffo a buscar ('suerte', 'aura', etc.).
 * @returns {number} La suma total del porcentaje de ese buffo.
 */
function getTotalBuffValue(buffs, buffType) {
    if (!buffs || buffs.length === 0) return 0;

    let totalPercentage = 0;
    buffs.forEach(buff => {
        if (buff.boost_type === buffType) {
            totalPercentage += buff.boost_percentage;
        }
    });

    return totalPercentage;
}

module.exports = {
    getUserWithBuffs,
    applyBuffs,
    getTotalBuffValue
};
