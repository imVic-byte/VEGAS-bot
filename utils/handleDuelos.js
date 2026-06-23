const { EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

const CANAL_CONFLICTOS_ID = '1516683707740717086';

async function procesarReporteDuelo(interaction, type, dueloId) {
    // deferReply no se puede usar fácilmente si queremos editar el mensaje original de forma fiable en algunos contextos
    // usaremos deferUpdate para editar el componente silenciosamente y luego reaccionar
    await interaction.deferUpdate();

    const userId = interaction.user.id;
    const serverId = interaction.guildId;

    // Obtener información del duelo
    const { data: duelo, error } = await supabase
        .from('duelos_versus')
        .select('*')
        .eq('id', dueloId)
        .eq('server_id', serverId)
        .single();

    if (error || !duelo) {
        return interaction.followUp({ content: 'Este duelo ya no existe o no fue encontrado.', ephemeral: true });
    }

    if (duelo.estado !== 'en_progreso') {
        return interaction.followUp({ content: 'Este duelo ya no está en progreso.', ephemeral: true });
    }

    // Verificar si el usuario participa en el duelo
    const esRetador = userId === duelo.retador_id;
    const esOponente = userId === duelo.oponente_id;

    if (!esRetador && !esOponente) {
        return interaction.followUp({ content: 'No eres partícipe de este duelo.', ephemeral: true });
    }

    const valorReporte = type === 'victoria' ? 'gano' : 'perdio';

    // Determinar qué columna actualizar y leer los estados
    let reporteRetadorActual = duelo.reporte_retador;
    let reporteOponenteActual = duelo.reporte_oponente;

    if (esRetador) {
        if (reporteRetadorActual) return interaction.followUp({ content: 'Ya has emitido tu reporte.', ephemeral: true });
        reporteRetadorActual = valorReporte;
        await supabase.from('duelos_versus').update({ reporte_retador: valorReporte }).eq('id', dueloId);
    } else {
        if (reporteOponenteActual) return interaction.followUp({ content: 'Ya has emitido tu reporte.', ephemeral: true });
        reporteOponenteActual = valorReporte;
        await supabase.from('duelos_versus').update({ reporte_oponente: valorReporte }).eq('id', dueloId);
    }

    // Si todavía falta un reporte, solo avisar efímeramente y detener
    if (!reporteRetadorActual || !reporteOponenteActual) {
        return interaction.followUp({ content: `Has reportado que tu resultado fue: **${valorReporte.toUpperCase()}**. Esperando a tu oponente...`, ephemeral: true });
    }

    // Ya tenemos ambos reportes. Evaluar consenso o conflicto.
    const consensoLimpio = 
        (reporteRetadorActual === 'gano' && reporteOponenteActual === 'perdio') ||
        (reporteRetadorActual === 'perdio' && reporteOponenteActual === 'gano');

    const pozoBruto = Number(duelo.apuesta) * 2;
    const premioNeto = pozoBruto;

    if (consensoLimpio) {
        const idGanador = reporteRetadorActual === 'gano' ? duelo.retador_id : duelo.oponente_id;
        const idPerdedor = reporteRetadorActual === 'gano' ? duelo.oponente_id : duelo.retador_id;

        // Sumar al balance del ganador
        const { data: userData } = await supabase
            .from('perfiles_economia')
            .select('balance')
            .eq('discord_id', idGanador)
            .eq('server_id', serverId)
            .single();

        const nuevoBalance = Number(userData.balance) + premioNeto;
        await supabase.from('perfiles_economia').update({ balance: nuevoBalance }).eq('discord_id', idGanador).eq('server_id', serverId);
        await supabase.from('duelos_versus').update({ estado: 'finalizado' }).eq('id', dueloId);

        const embedExito = new EmbedBuilder()
            .setTitle('⚔️ Duelo Finalizado: ¡Tenemos un Ganador!')
            .setColor('Green')
            .setDescription(`Se llegó a un consenso en el reporte de la partida.`)
            .addFields(
                { name: 'Ganador', value: `<@${idGanador}>`, inline: true },
                { name: 'Perdedor', value: `<@${idPerdedor}>`, inline: true },
                { name: 'Premio Entregado', value: `${premioNeto} monedas`, inline: false }
            );

        return interaction.message.edit({ embeds: [embedExito], components: [] }).catch(console.error);

    } else {
        // Conflicto abierto
        await supabase.from('duelos_versus').update({ estado: 'conflicto' }).eq('id', dueloId);

        const embedConflicto = new EmbedBuilder()
            .setTitle('🚨 Duelo en Conflicto')
            .setColor('Red')
            .setDescription('Ambos jugadores han enviado reportes contradictorios. Los fondos han sido asegurados y el caso ha sido enviado a la administración para mediación y revisión.');

        await interaction.message.edit({ embeds: [embedConflicto], components: [] }).catch(console.error);

        // Enviar alerta al canal de Staff
        const canalSoporte = interaction.client.channels.cache.get(CANAL_CONFLICTOS_ID);
        if (canalSoporte) {
            const embedAlerta = new EmbedBuilder()
                .setTitle('⚖️ Alerta de Conflicto en Duelo')
                .setColor('Orange')
                .setDescription(`Se ha detectado un conflicto en una apuesta.\nAmbos jugadores reportaron: **${reporteRetadorActual.toUpperCase()}**.`)
                .addFields(
                    { name: 'ID del Duelo (UUID)', value: `\`${dueloId}\``, inline: false },
                    { name: 'Retador', value: `<@${duelo.retador_id}>`, inline: true },
                    { name: 'Oponente', value: `<@${duelo.oponente_id}>`, inline: true },
                    { name: 'Pozo en Juego', value: `${pozoBruto} monedas`, inline: false },
                    { name: 'Instrucciones', value: `Para resolver el caso, usa \`/duelo dictaminar id_duelo: ${dueloId} ganador: @usuario\``, inline: false }
                )
                .setFooter({ text: 'Mediación requerida por el equipo de Staff' });

            canalSoporte.send({ embeds: [embedAlerta] }).catch(console.error);
        }
    }
}

module.exports = { procesarReporteDuelo };
