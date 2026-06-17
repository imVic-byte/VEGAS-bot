const supabase = require('../supabase');

/**
 * Agrega puntos de experiencia (XP) a un usuario, validando potenciadores y subidas de nivel.
 * @param {string} discordId El ID de Discord del usuario.
 * @param {number} cantidadBaseXp Cantidad de XP base obtenida.
 * @returns {object|null} Objeto detallando el resultado de la operación.
 */
async function agregarXp(discordId, cantidadBaseXp) {
    try {
        const { data: usuario, error } = await supabase
            .from('perfiles_economia')
            .select('xp, nivel')
            .eq('discord_id', discordId)
            .single();

        if (error || !usuario) return null;

        let multiplicadorActivo = false;
        let xpFinal = cantidadBaseXp;

        const nowIso = new Date().toISOString();
        const { data: estimulante } = await supabase
            .from('inventario_items')
            .select('*')
            .eq('discord_id', discordId)
            .eq('item_id', 'estimulante_xp')
            .gt('expira_el', nowIso)
            .single();

        if (estimulante) {
            multiplicadorActivo = true;
            xpFinal = cantidadBaseXp * 2;
        }

        let xpActual = Number(usuario.xp) || 0;
        let nivelActual = Number(usuario.nivel) || 1;

        xpActual += xpFinal;
        let subioDeNivel = false;

        let limiteXp = 100 * (nivelActual * nivelActual);

        while (xpActual >= limiteXp) {
            nivelActual++;
            subioDeNivel = true;
            limiteXp = 100 * (nivelActual * nivelActual);
        }

        await supabase
            .from('perfiles_economia')
            .update({ xp: Math.floor(xpActual), nivel: Math.floor(nivelActual) })
            .eq('discord_id', discordId);

        return {
            subioDeNivel,
            nuevoNivel: nivelActual,
            multiplicadorActivo
        };

    } catch (err) {
        console.error('Error procesando el XP:', err);
        return null;
    }
}

module.exports = { agregarXp };
