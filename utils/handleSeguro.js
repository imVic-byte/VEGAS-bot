const supabase = require('../supabase');

async function procesarSeguro(discordId, montoApostado) {
    let tituloDerrota = '';
    let descripcionDerrota = '';

    const { data: seguro } = await supabase
        .from('inventario_items')
        .select('*')
        .eq('discord_id', discordId)
        .eq('item_id', 4)
        .gt('usos_restantes', 0)
        .single();

    if (seguro) {
        const reembolso = Math.floor(montoApostado * 0.25);
        const usosRestantes = seguro.usos_restantes - 1;

        if (usosRestantes <= 0) {
            await supabase
                .from('inventario_items')
                .delete()
                .eq('id', seguro.id);
        } else {
            await supabase
                .from('inventario_items')
                .update({ usos_restantes: usosRestantes })
                .eq('id', seguro.id);
        }

        const { data: usuarioPerfil } = await supabase
            .from('perfiles_economia')
            .select('balance')
            .eq('discord_id', discordId)
            .single();

        if (usuarioPerfil) {
            const balanceRecuperado = Number(usuarioPerfil.balance) + reembolso;
            await supabase
                .from('perfiles_economia')
                .update({ balance: balanceRecuperado })
                .eq('discord_id', discordId);
        }

        tituloDerrota = 'Derrota Asegurada';
        descripcionDerrota = `Has perdido tu apuesta, pero tu Poliza de Seguro de Casino se ha activado.\nEl sistema te ha devuelto ${reembolso} monedas (25 por ciento del monto apostado) directamente a tu billetera liquida.`;
    } else {
        tituloDerrota = 'Derrota Total';
        descripcionDerrota = `Has perdido la totalidad de tu apuesta.\nSe han descontado ${montoApostado} monedas de tu billetera liquida.`;
    }

    return { tituloDerrota, descripcionDerrota };
}

module.exports = { procesarSeguro };
