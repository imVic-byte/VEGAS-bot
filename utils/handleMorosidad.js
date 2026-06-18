const supabase = require('../supabase');

/**
 * Verifica si un usuario se encuentra en estado de morosidad activa.
 * 
 * @param {string} discord_id El ID de Discord del usuario.
 * @returns {Promise<{bloqueado: boolean, deuda?: number}>}
 */
async function verificarEstadoMorosidad(discord_id) {
    const { data: user, error } = await supabase
        .from('perfiles_economia')
        .select('deuda_prestamo, vencimiento_prestamo')
        .eq('discord_id', discord_id)
        .single();

    if (error || !user) {
        // Si el usuario no existe en la BD o hay un error, asumimos que no tiene deudas
        return { bloqueado: false };
    }

    const deudaTotal = Number(user.deuda_prestamo) || 0;

    // Solo se considera morosidad activa si hay deuda y la fecha límite ya expiró
    if (deudaTotal > 0 && user.vencimiento_prestamo) {
        const vencimiento = new Date(user.vencimiento_prestamo);
        const ahora = new Date();

        if (vencimiento <= ahora) {
            return { bloqueado: true, deuda: deudaTotal };
        }
    }

    // Si no debe nada o si debe pero aún está dentro de sus 48 horas de gracia
    return { bloqueado: false };
}

module.exports = {
    verificarEstadoMorosidad
};
