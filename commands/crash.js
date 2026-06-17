const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const wait = require('node:timers/promises').setTimeout;
const supabase = require('../supabase');
const { noMoney } = require('../utils/responses');
const { getUserWithBuffs, applyBuffs, getTotalBuffValue } = require('../utils/handleUser');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crash')
        .setDescription('Apuesta en el juego de Crash. ¡Retírate antes de que explote!')
        .addIntegerOption(option =>
            option.setName('apuesta')
                .setDescription('Cantidad de monedas a apostar')
                .setRequired(true)
                .setMinValue(1)
        ),

    async execute(interaction) {
        const discordId = interaction.user.id;
        const apuesta = interaction.options.getInteger('apuesta');

        await interaction.deferReply();

        const userData = await getUserWithBuffs(discordId);

        if (!userData || !userData.profile) {
            return interaction.editReply('❌ No tienes una cuenta registrada. Usa `/daily` primero.');
        }

        const user = userData.profile;

        if (Number(user.balance) < apuesta) {
            return interaction.editReply(noMoney(user.balance));
        }

        // 1. Cobro inmediato
        const balanceDespuésDeApuesta = Number(user.balance) - apuesta;
        const { error: deductError } = await supabase
            .from('perfiles_economia')
            .update({ balance: balanceDespuésDeApuesta })
            .eq('discord_id', discordId);

        if (deductError) {
            console.error('Error deduct crash bet:', deductError);
            return interaction.editReply('❌ Hubo un error procesando tu apuesta.');
        }

        // 2. Cálculos de Buffos y Crash Point
        const suerteBuff = getTotalBuffValue(userData.buffs, 'suerte');
        const coinsBuff = getTotalBuffValue(userData.buffs, 'coins');

        // House edge por defecto 5% (0.05). La suerte reduce este margen.
        // Ej: suerteBuff = 3 -> houseEdge = 0.05 - 0.03 = 0.02
        let houseEdge = 0.05 - (suerteBuff / 100);
        if (houseEdge < 0.01) houseEdge = 0.01; // Mínimo 1% para la casa

        const e = 1 - houseEdge;
        // Fórmula típica de crash crypto
        let crashPoint = Math.max(1.00, e / Math.random());
        // Cap opcional de 1000x para no extender el loop al infinito
        if (crashPoint > 1000) crashPoint = 1000;

        let currentMultiplier = 1.00;
        let busted = false;
        let cashedOut = false;
        let cashedOutMultiplier = 0;

        // Si explota instantáneamente en 1.00
        if (crashPoint <= 1.00) {
            busted = true;
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('crash_cashout')
                .setLabel('¡Retirarse!')
                .setStyle(ButtonStyle.Success)
        );

        let embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('🚀 CRASH')
            .setDescription(`Multiplicador actual: **1.00x**\n\n¡Haz clic en Retirarse antes de que la nave explote!`);

        if (userData.activePet) {
            embed.setFooter({ text: `🐾 Acompañado por: ${userData.activePet.title}` });
        }

        let reply;
        if (busted) {
            // Explota instantáneamente sin empezar el loop
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('crash_cashout')
                    .setLabel('¡Explotó!')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            );
            
            let retenido = 0;
            if (coinsBuff > 0) {
                const retencion = Math.min(coinsBuff, 100);
                const perdidaReal = Math.floor(apuesta * (1 - (retencion / 100)));
                retenido = apuesta - perdidaReal;
            }

            const finalBalance = balanceDespuésDeApuesta + retenido;
            if (retenido > 0) {
                await supabase.from('perfiles_economia').update({ balance: finalBalance }).eq('discord_id', discordId);
            }

            const { procesarSeguro } = require('../utils/handleSeguro');
            const resultadoSeguro = await procesarSeguro(discordId, apuesta);

            if (resultadoSeguro.tituloDerrota === 'Derrota Asegurada') {
                embed.setColor(0xED4245)
                     .setTitle(resultadoSeguro.tituloDerrota)
                     .setDescription(`💥 **¡CRASH!** La nave explotó en **1.00x**\n\n${resultadoSeguro.descripcionDerrota}\nSaldo actual: ${(finalBalance + Math.floor(apuesta * 0.25)).toLocaleString()}`);
            } else {
                embed.setColor(0xED4245)
                     .setDescription(`💥 **¡CRASH!** La nave explotó en **1.00x**\n\nPerdiste ${apuesta - retenido} monedas${retenido > 0 ? ` (Retuviste ${retenido} por tus buffos)` : ''}.\nSaldo actual: ${finalBalance.toLocaleString()}`);
            }

            return interaction.editReply({ embeds: [embed], components: [disabledRow] });
        }

        reply = await interaction.editReply({ embeds: [embed], components: [row] });

        const collector = reply.createMessageComponentCollector({
            filter: i => i.user.id === discordId,
            time: 90000 // timeout de seguridad
        });

        collector.on('collect', async i => {
            if (i.customId === 'crash_cashout') {
                if (busted || cashedOut) return;
                cashedOut = true;
                cashedOutMultiplier = currentMultiplier;
                collector.stop('cashedOut');
                await i.deferUpdate().catch(() => {});
            }
        });

        // 3. Ciclo Asíncrono del Juego
        while (!busted && !cashedOut) {
            await wait(2000); // Pausa de 2 segundos por rate limit
            
            if (cashedOut) break;

            // Incremento notorio: +20%
            currentMultiplier = currentMultiplier * 1.20;

            if (currentMultiplier >= crashPoint) {
                currentMultiplier = crashPoint;
                busted = true;
                collector.stop('busted');
                break;
            }

            embed.setDescription(`Multiplicador actual: **${currentMultiplier.toFixed(2)}x**\n\n¡Haz clic en Retirarse antes de que la nave explote!`);
            
            // Intentar actualizar, ignorar error si el mensaje no existe (ej. borrado)
            await interaction.editReply({ embeds: [embed], components: [row] }).catch(() => {});
        }

        // 4. Resolución del Juego
        const endRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('crash_ended')
                .setLabel(cashedOut ? 'Retirado' : '¡Explotó!')
                .setStyle(cashedOut ? ButtonStyle.Success : ButtonStyle.Danger)
                .setDisabled(true)
        );

        if (cashedOut) {
            const gananciaBruta = Math.floor(apuesta * cashedOutMultiplier);
            const gananciaReal = applyBuffs(gananciaBruta, userData.buffs, 'coins');
            const nuevoBalance = balanceDespuésDeApuesta + gananciaReal;

            await supabase.from('perfiles_economia').update({ balance: nuevoBalance }).eq('discord_id', discordId);

            embed.setColor(0x57F287)
                 .setDescription(`✅ **¡Te retiraste a tiempo!**\nMultiplicador final: **${cashedOutMultiplier.toFixed(2)}x**\n\nGanaste **${gananciaReal} monedas**${coinsBuff > 0 ? ' (buffos aplicados)' : ''}.\nSaldo actual: ${nuevoBalance.toLocaleString()}`);

            await interaction.editReply({ embeds: [embed], components: [endRow] }).catch(() => {});
        } else if (busted) {
            let retenido = 0;
            if (coinsBuff > 0) {
                const retencion = Math.min(coinsBuff, 100);
                const perdidaReal = Math.floor(apuesta * (1 - (retencion / 100)));
                retenido = apuesta - perdidaReal;
            }

            const nuevoBalance = balanceDespuésDeApuesta + retenido;
            if (retenido > 0) {
                await supabase.from('perfiles_economia').update({ balance: nuevoBalance }).eq('discord_id', discordId);
            }

            const { procesarSeguro } = require('../utils/handleSeguro');
            const resultadoSeguro = await procesarSeguro(discordId, apuesta);

            if (resultadoSeguro.tituloDerrota === 'Derrota Asegurada') {
                embed.setColor(0xED4245)
                     .setTitle(resultadoSeguro.tituloDerrota)
                     .setDescription(`💥 **¡CRASH!** La nave explotó en **${crashPoint.toFixed(2)}x**\n\n${resultadoSeguro.descripcionDerrota}\nSaldo actual: ${(nuevoBalance + Math.floor(apuesta * 0.25)).toLocaleString()}`);
            } else {
                embed.setColor(0xED4245)
                     .setDescription(`💥 **¡CRASH!** La nave explotó en **${crashPoint.toFixed(2)}x**\n\nPerdiste **${apuesta - retenido} monedas**${retenido > 0 ? ` (Retuviste ${retenido} gracias a tu mascota)` : ''}.\nSaldo actual: ${nuevoBalance.toLocaleString()}`);
            }

            await interaction.editReply({ embeds: [embed], components: [endRow] }).catch(() => {});
        }
    }
};
