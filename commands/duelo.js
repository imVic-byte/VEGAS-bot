const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');
const crypto = require('crypto');

const ROL_STAFF_ID = '890441897158512711';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('duelo')
        .setDescription('Sistema de duelos de apuestas y arbitraje')
        .addSubcommand(subcommand =>
            subcommand
                .setName('retar')
                .setDescription('Reta a otro usuario a un duelo por monedas')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('Usuario al que quieres retar')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('apuesta')
                        .setDescription('Cantidad de monedas a apostar')
                        .setRequired(true)
                        .setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('dictaminar')
                .setDescription('[STAFF] Resuelve un duelo en conflicto')
                .addStringOption(option =>
                    option.setName('id_duelo')
                        .setDescription('UUID del duelo en conflicto')
                        .setRequired(true))
                .addUserOption(option =>
                    option.setName('ganador')
                        .setDescription('Usuario declarado ganador')
                        .setRequired(true))),

    async execute(interaction) {
        const serverId = interaction.guildId;
        if (!serverId) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Este comando solo se puede usar dentro de un servidor.');
            return interaction.reply({ embeds: [errEmbed], ephemeral: true });
        }

        await interaction.deferReply();
        const subcomando = interaction.options.getSubcommand();
        const retadorId = interaction.user.id;

        if (subcomando === 'retar') {
            const oponente = interaction.options.getUser('usuario');
            const apuesta = interaction.options.getInteger('apuesta');

            if (retadorId === oponente.id) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ No puedes retarte a ti mismo.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            // Validar existencia y fondos del retador
            const { data: retadorData, error: retError } = await supabase
                .from('perfiles_economia')
                .select('balance')
                .eq('discord_id', retadorId)
                .eq('server_id', serverId)
                .maybeSingle();

            if (!retadorData) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ No tienes un perfil económico registrado en este servidor. Usa `/daily` para crearlo.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            if (Number(retadorData.balance) < apuesta) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(`❌ Fondos insuficientes. Tienes **${retadorData.balance}** monedas, pero necesitas **${apuesta}** para este duelo.`);
                return interaction.editReply({ embeds: [errEmbed] });
            }

            // Validar existencia y fondos del oponente
            const { data: oponenteData, error: opError } = await supabase
                .from('perfiles_economia')
                .select('balance')
                .eq('discord_id', oponente.id)
                .eq('server_id', serverId)
                .maybeSingle();

            if (!oponenteData) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(`❌ <@${oponente.id}> no tiene un perfil económico registrado en este servidor.`);
                return interaction.editReply({ embeds: [errEmbed] });
            }

            if (Number(oponenteData.balance) < apuesta) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(`❌ <@${oponente.id}> no tiene suficientes monedas para aceptar esta apuesta.`);
                return interaction.editReply({ embeds: [errEmbed] });
            }

            // Descontar fondos del retador (congelar)
            const nuevoBalanceRetador = Number(retadorData.balance) - apuesta;
            await supabase.from('perfiles_economia').update({ balance: nuevoBalanceRetador }).eq('discord_id', retadorId).eq('server_id', serverId);

            // Generar UUID
            const dueloId = crypto.randomUUID();

            // Insertar fila en estado esperando
            await supabase.from('duelos_versus').insert([{
                id: dueloId,
                retador_id: retadorId,
                oponente_id: oponente.id,
                apuesta: apuesta,
                estado: 'esperando',
                server_id: serverId
            }]);

            const embedEsperando = new EmbedBuilder()
                .setTitle('⚔️ Reto de Duelo')
                .setColor('Blue')
                .setDescription(`<@${oponente.id}>, has sido retado a un duelo por **${apuesta}** monedas por <@${retadorId}>.\nTienes 60 segundos para aceptar o rechazar el reto.`);

            const btnAceptar = new ButtonBuilder()
                .setCustomId(`duelo_aceptar_${dueloId}`)
                .setLabel('Aceptar Reto')
                .setStyle(ButtonStyle.Success);

            const btnRechazar = new ButtonBuilder()
                .setCustomId(`duelo_rechazar_${dueloId}`)
                .setLabel('Rechazar Reto')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(btnAceptar, btnRechazar);

            const mensajeDuelo = await interaction.editReply({ content: `<@${oponente.id}>`, embeds: [embedEsperando], components: [row] });

            // Colector para la aceptación
            const filter = i => i.user.id === oponente.id;
            const collector = mensajeDuelo.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                const accion = i.customId.split('_')[1]; // aceptar o rechazar
                
                if (accion === 'rechazar') {
                    await i.deferUpdate();
                    // Reembolsar retador
                    const { data: retData } = await supabase.from('perfiles_economia').select('balance').eq('discord_id', retadorId).eq('server_id', serverId).single();
                    await supabase.from('perfiles_economia').update({ balance: Number(retData.balance) + apuesta }).eq('discord_id', retadorId).eq('server_id', serverId);
                    // Actualizar fila
                    await supabase.from('duelos_versus').update({ estado: 'finalizado' }).eq('id', dueloId);

                    const embedRechazado = new EmbedBuilder().setTitle('⚔️ Duelo Rechazado').setColor('Red').setDescription('El oponente ha rechazado el reto. Los fondos han sido devueltos al retador.');
                    await interaction.editReply({ content: '', embeds: [embedRechazado], components: [] });
                    collector.stop('rechazado');
                } else if (accion === 'aceptar') {
                    await i.deferUpdate();
                    // Verificar balance oponente de nuevo
                    const { data: opData } = await supabase.from('perfiles_economia').select('balance').eq('discord_id', oponente.id).eq('server_id', serverId).single();
                    if (!opData || Number(opData.balance) < apuesta) {
                        // Reembolsar y cancelar
                        const { data: retData } = await supabase.from('perfiles_economia').select('balance').eq('discord_id', retadorId).eq('server_id', serverId).single();
                        await supabase.from('perfiles_economia').update({ balance: Number(retData.balance) + apuesta }).eq('discord_id', retadorId).eq('server_id', serverId);
                        await supabase.from('duelos_versus').update({ estado: 'finalizado' }).eq('id', dueloId);
                        
                        const errEmbed = new EmbedBuilder()
                            .setColor('Red')
                            .setDescription('❌ El oponente ya no tiene fondos suficientes. Duelo cancelado y fondos devueltos.');
                        return interaction.editReply({ content: '', embeds: [errEmbed], components: [] });
                    }

                    // Descontar oponente
                    const nuevoBalanceOp = Number(opData.balance) - apuesta;
                    await supabase.from('perfiles_economia').update({ balance: nuevoBalanceOp }).eq('discord_id', oponente.id).eq('server_id', serverId);

                    // Actualizar duelo
                    await supabase.from('duelos_versus').update({ estado: 'en_progreso' }).eq('id', dueloId);

                    const embedProgreso = new EmbedBuilder()
                        .setTitle('⚔️ Duelo en Progreso')
                        .setColor('Yellow')
                        .setDescription(`El duelo entre <@${retadorId}> y <@${oponente.id}> ha comenzado oficialmente.\nPozo en juego: **${apuesta * 2}** monedas.\n\nCuando finalice su partida externa, usen los botones de abajo para reportar su resultado individual de forma sincera.`);

                    const btnVictoria = new ButtonBuilder()
                        .setCustomId(`duelo_victoria_${dueloId}`)
                        .setLabel('Reportar Victoria')
                        .setStyle(ButtonStyle.Success);

                    const btnDerrota = new ButtonBuilder()
                        .setCustomId(`duelo_derrota_${dueloId}`)
                        .setLabel('Reportar Derrota')
                        .setStyle(ButtonStyle.Danger);

                    const rowProgreso = new ActionRowBuilder().addComponents(btnVictoria, btnDerrota);

                    await interaction.editReply({ content: '', embeds: [embedProgreso], components: [rowProgreso] });
                    collector.stop('aceptado');
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    // Reembolsar retador
                    const { data: retData } = await supabase.from('perfiles_economia').select('balance').eq('discord_id', retadorId).eq('server_id', serverId).single();
                    if (retData) {
                        await supabase.from('perfiles_economia').update({ balance: Number(retData.balance) + apuesta }).eq('discord_id', retadorId).eq('server_id', serverId);
                    }
                    await supabase.from('duelos_versus').update({ estado: 'finalizado' }).eq('id', dueloId);

                    const embedExpirado = new EmbedBuilder().setTitle('⚔️ Duelo Expirado').setColor('Grey').setDescription('El tiempo de espera ha expirado y el reto fue cancelado. Los fondos han sido devueltos al retador.');
                    interaction.editReply({ content: '', embeds: [embedExpirado], components: [] }).catch(console.error);
                }
            });
        
        } else if (subcomando === 'dictaminar') {
            const idDuelo = interaction.options.getString('id_duelo');
            const ganador = interaction.options.getUser('ganador');

            // Validación de rol staff
            const memberRoles = interaction.member.roles.cache;
            const tienePermisos = memberRoles.has(ROL_STAFF_ID);

            if (!tienePermisos) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ No tienes permiso para usar este comando. Requiere el rol Tier S.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            const { data: duelo, error } = await supabase
                .from('duelos_versus')
                .select('*')
                .eq('id', idDuelo)
                .eq('server_id', serverId)
                .single();

            if (error || !duelo) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ Duelo no encontrado. Verifica el UUID.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            if (duelo.estado !== 'conflicto') {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(`❌ Este duelo no se encuentra en estado de conflicto. Estado actual: ${duelo.estado}`);
                return interaction.editReply({ embeds: [errEmbed] });
            }

            // Validar que el staff no sea parte del duelo
            if (retadorId === duelo.retador_id || retadorId === duelo.oponente_id) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ No puedes dictaminar el resultado de un duelo en el que participaste, incluso si eres Staff.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            // Distribuir fondos
            const pozoBruto = Number(duelo.apuesta) * 2;
            const premioNeto = pozoBruto;

            const { data: userData } = await supabase
                .from('perfiles_economia')
                .select('balance')
                .eq('discord_id', ganador.id)
                .eq('server_id', serverId)
                .single();

            if (!userData) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ El usuario ganador no tiene una cuenta de economía registrada.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            const nuevoBalance = Number(userData.balance) + premioNeto;
            await supabase.from('perfiles_economia').update({ balance: nuevoBalance }).eq('discord_id', ganador.id).eq('server_id', serverId);
            await supabase.from('duelos_versus').update({ estado: 'finalizado' }).eq('id', idDuelo);

            const embedResolucion = new EmbedBuilder()
                .setTitle('⚖️ Resolución de Duelo (Staff)')
                .setColor('Green')
                .setDescription(`El caso del duelo \`${idDuelo}\` ha sido revisado y dictaminado a favor de <@${ganador.id}>.`)
                .addFields(
                    { name: 'Premio Entregado', value: `${premioNeto} monedas`, inline: true }
                );

            return interaction.editReply({ embeds: [embedResolucion] });
        }
    }
};
