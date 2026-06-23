const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('prestamo')
        .setDescription('Sistema de préstamos bancarios de VEGAS')
        .addSubcommand(subcommand =>
            subcommand
                .setName('pedir')
                .setDescription('Pide un préstamo al banco'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pagar')
                .setDescription('Paga una parte o la totalidad de tu préstamo')
                .addIntegerOption(option =>
                    option.setName('cantidad')
                        .setDescription('Cantidad de monedas a pagar')
                        .setRequired(true)
                        .setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('consultar')
                .setDescription('Consulta el estado de tu préstamo actual')),

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
        const userId = interaction.user.id;

        // Obtener datos del usuario
        let { data: user, error: userError } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', userId)
            .eq('server_id', serverId)
            .single();

        if (userError || !user) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ No tienes una cuenta económica en el sistema. Usa `/daily` primero.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        if (subcomando === 'pedir') {
            if (Number(user.deuda_prestamo) > 0) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ Ya tienes una deuda activa. Debes pagarla en su totalidad antes de poder solicitar otro préstamo.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            const { data: tarjeta } = await supabase
                .from('inventario_items')
                .select('*')
                .eq('discord_id', userId)
                .eq('item_id', 5)
                .single();

            const esPlatinum = !!tarjeta;
            const plazoHoras = esPlatinum ? 72 : 48;

            const embed = new EmbedBuilder()
                .setTitle('🏦 Solicitud de Préstamo')
                .setDescription(`Selecciona la cantidad de monedas que deseas solicitar al banco.\nRecuerda que se aplicará un **20% de interés** y tendrás **${plazoHoras} horas** para pagar.` + 
                                (esPlatinum ? '\n\n✨ *Beneficios Tarjeta Platinum Activos (Plazo Extendido y Límite de 7500)*' : ''))
                .setColor(esPlatinum ? 'Aqua' : 'Blue');

            const btn1000 = new ButtonBuilder()
                .setCustomId('prestamo_1000')
                .setLabel('1000')
                .setStyle(ButtonStyle.Primary);

            const btn2500 = new ButtonBuilder()
                .setCustomId('prestamo_2500')
                .setLabel('2500')
                .setStyle(ButtonStyle.Primary);

            const btn5000 = new ButtonBuilder()
                .setCustomId('prestamo_5000')
                .setLabel('5000')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(btn1000, btn2500, btn5000);

            if (esPlatinum) {
                const btn7500 = new ButtonBuilder()
                    .setCustomId('prestamo_7500')
                    .setLabel('7500 (VIP)')
                    .setStyle(ButtonStyle.Success);
                row.addComponents(btn7500);
            }

            const mensajeRespuesta = await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

            const collector = mensajeRespuesta.createMessageComponentCollector({
                filter: i => i.user.id === userId,
                time: 30000
            });

            collector.on('collect', async i => {
                const cantidad = parseInt(i.customId.split('_')[1], 10);
                
                // Confirmar nuevamente base de datos por si adquirió deuda en estos segundos
                const { data: userUpdate } = await supabase
                    .from('perfiles_economia')
                    .select('deuda_prestamo, balance')
                    .eq('discord_id', userId)
                    .eq('server_id', serverId)
                    .single();

                if (Number(userUpdate.deuda_prestamo) > 0) {
                    await i.update({
                        content: 'Ya tienes una deuda activa. Transacción cancelada.',
                        embeds: [],
                        components: []
                    });
                    collector.stop('already_debt');
                    return;
                }

                const deudaFinal = Math.floor(cantidad * 1.20);
                const vencimiento = new Date(Date.now() + plazoHoras * 60 * 60 * 1000).toISOString();
                const nuevoBalance = Number(userUpdate.balance) + cantidad;

                const { error: updateError } = await supabase
                    .from('perfiles_economia')
                    .update({
                        balance: nuevoBalance,
                        deuda_prestamo: deudaFinal,
                        vencimiento_prestamo: vencimiento
                    })
                    .eq('discord_id', userId)
                    .eq('server_id', serverId);

                if (updateError) {
                    console.error(updateError);
                    await i.update({
                        content: 'Ocurrió un error al procesar tu préstamo en la base de datos.',
                        embeds: [],
                        components: []
                    });
                    return;
                }

                const discordTimestamp = Math.floor(new Date(vencimiento).getTime() / 1000);
                const embedExito = new EmbedBuilder()
                    .setTitle('🏦 ¡Préstamo Aprobado!')
                    .setColor('Green')
                    .setDescription(`Se han depositado **${cantidad}** monedas en tu billetera.\n\n` +
                                    `💰 **Total a pagar:** ${deudaFinal} monedas (incluye 20% de interés).\n` +
                                    `⏳ **Vencimiento:** <t:${discordTimestamp}:F> (<t:${discordTimestamp}:R>).`);

                await i.update({ content: '', embeds: [embedExito], components: [] });
                collector.stop('success');
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    btn1000.setDisabled(true);
                    btn2500.setDisabled(true);
                    btn5000.setDisabled(true);
                    
                    const disabledRow = new ActionRowBuilder().addComponents(btn1000, btn2500, btn5000);
                    if (esPlatinum) {
                        const btn7500 = new ButtonBuilder()
                            .setCustomId('prestamo_7500')
                            .setLabel('7500 (VIP)')
                            .setStyle(ButtonStyle.Success)
                            .setDisabled(true);
                        disabledRow.addComponents(btn7500);
                    }
                    
                    const timeoutEmbed = new EmbedBuilder()
                        .setColor('Grey')
                        .setDescription('⏱️ El tiempo para solicitar el préstamo ha expirado.');
                    interaction.editReply({
                        embeds: [timeoutEmbed],
                        components: [disabledRow]
                    }).catch(console.error);
                }
            });

        } else if (subcomando === 'pagar') {
            let cantidadPagar = interaction.options.getInteger('cantidad');
            const deudaActual = Number(user.deuda_prestamo) || 0;

            if (deudaActual <= 0) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ No tienes ninguna deuda activa que pagar.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            const balanceActual = Number(user.balance);
            if (balanceActual < cantidadPagar) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(`❌ No tienes fondos suficientes en tu billetera. Intentas pagar **${cantidadPagar}** pero tu balance actual es de **${balanceActual}** monedas.`);
                return interaction.editReply({ embeds: [errEmbed] });
            }

            // Ajustar si la cantidad a pagar supera la deuda pendiente
            if (cantidadPagar > deudaActual) {
                cantidadPagar = deudaActual;
            }

            const nuevoBalance = balanceActual - cantidadPagar;
            const nuevaDeuda = deudaActual - cantidadPagar;
            // Si la deuda llega a 0, establecemos el vencimiento como nulo
            const nuevoVencimiento = nuevaDeuda === 0 ? null : user.vencimiento_prestamo;

            const { error: updateError } = await supabase
                .from('perfiles_economia')
                .update({
                    balance: nuevoBalance,
                    deuda_prestamo: nuevaDeuda,
                    vencimiento_prestamo: nuevoVencimiento
                })
                .eq('discord_id', userId)
                .eq('server_id', serverId);

            if (updateError) {
                console.error(updateError);
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ Ocurrió un error al procesar tu pago.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            if (nuevaDeuda === 0) {
                const okEmbed = new EmbedBuilder()
                    .setColor('Green')
                    .setDescription(`✅ Has pagado **${cantidadPagar}** monedas de tu billetera y **has liquidado completamente tu deuda** con el banco.`);
                return interaction.editReply({ embeds: [okEmbed] });
            } else {
                const okEmbed = new EmbedBuilder()
                    .setColor('Green')
                    .setDescription(`💸 Se descontaron **${cantidadPagar}** monedas de tu billetera para el pago.\nEl saldo restante de tu deuda es de **${nuevaDeuda}** monedas.`);
                return interaction.editReply({ embeds: [okEmbed] });
            }

        } else if (subcomando === 'consultar') {
            const deudaActual = Number(user.deuda_prestamo) || 0;

            if (deudaActual <= 0) {
                const okEmbed = new EmbedBuilder()
                    .setColor('Green')
                    .setDescription('✅ Tu cuenta está completamente limpia y libre de obligaciones con el banco.');
                return interaction.editReply({ embeds: [okEmbed] });
            }

            const vencimientoDate = new Date(user.vencimiento_prestamo);
            const discordTimestamp = Math.floor(vencimientoDate.getTime() / 1000);

            const statusEmbed = new EmbedBuilder()
                .setTitle('📊 Estado Crediticio')
                .setColor('Gold')
                .setDescription(`Tienes una deuda activa por un monto total de **${deudaActual}** monedas.\nEl plazo para liquidar la deuda vence el: <t:${discordTimestamp}:F> (<t:${discordTimestamp}:R>).`);
            return interaction.editReply({ embeds: [statusEmbed] });
        }
    }
};
