const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { verificarEstadoMorosidad } = require('../utils/handleMorosidad');
const wait = require('node:timers/promises').setTimeout;
const supabase = require('../supabase');
const { noMoney } = require('../utils/responses');
const { getUserWithBuffs, applyBuffs, getTotalBuffValue } = require('../utils/handleUser');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lucky')
        .setDescription('Apuesta tus monedas lanzando una al aire')
        .addStringOption(option =>
            option.setName('cara_o_sello')
                .setDescription('Elige tu lado de la moneda')
                .setRequired(true)
                .addChoices(
                    { name: 'Cara', value: 'cara' },
                    { name: 'Sello', value: 'sello' }
                )
        )
        .addIntegerOption(option =>
            option.setName('apuesta')
                .setDescription('Cantidad de monedas a apostar')
                .setRequired(true)
                .setMinValue(1)
        ),
        
    async execute(interaction) {
        const serverId = interaction.guildId;
        if (!serverId) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Este comando solo se puede usar dentro de un servidor.');
            return interaction.reply({ embeds: [errEmbed], ephemeral: true });
        }

        await interaction.deferReply();

        const estadoMora = await verificarEstadoMorosidad(interaction.user.id, serverId);
        if (estadoMora.bloqueado) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('🚫 Acceso Denegado')
                .setDescription(`No puedes apostar en el casino porque el banco te ha embargado por morosidad.\nTienes una deuda vencida de **${estadoMora.deuda}** monedas. Usa \`/prestamo pagar\` para regularizar tu situación.`);
            return interaction.editReply({ embeds: [errEmbed] });
        }

        const eleccion = interaction.options.getString('cara_o_sello');
        const apuesta = interaction.options.getInteger('apuesta');
        const discordId = interaction.user.id;

        const userData = await getUserWithBuffs(discordId, serverId, interaction.guild);

        if (!userData || !userData.profile) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ No tienes una cuenta registrada. Usa `/daily` primero.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        const user = userData.profile;

        if (Number(user.balance) < apuesta) {
            return interaction.editReply(noMoney(user.balance));
        }

        const embedGiro = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('Lanzando la moneda al aire...')
            .setImage('https://rnhdmonauucuxpovqxun.supabase.co/storage/v1/object/public/vegas-media/coin-flip.gif');

        await interaction.editReply({ embeds: [embedGiro] });

        await wait(2500);

        const suerteBuff = getTotalBuffValue(userData.buffs, 'suerte');
        const coinsBuffPercentage = getTotalBuffValue(userData.buffs, 'coins');

        const rngCanto = Math.random() * 100;
        let resultado;
        let multiplicador = 1;
        let cayoDeCanto = false;

        if (rngCanto < 3) {
            resultado = 'canto';
            multiplicador = 3;
            cayoDeCanto = true;
        } else {
            const winChance = 50 + suerteBuff;
            const rngWin = Math.random() * 100;
            if (rngWin < winChance) {
                resultado = eleccion;
            } else {
                resultado = eleccion === 'cara' ? 'sello' : 'cara';
            }
        }

        const ganoNormal = eleccion === resultado;
        let nuevoBalance;
        let tituloResultado;
        let colorEmbed;
        let gananciaTexto = '';

        if (cayoDeCanto) {
            let gananciaBase = apuesta * multiplicador;
            let gananciaReal = applyBuffs(gananciaBase, userData.buffs, 'coins');
            nuevoBalance = Number(user.balance) + gananciaReal;
            tituloResultado = 'LA MONEDA CAYÓ DE CANTO';
            colorEmbed = 0xFFD700;
            gananciaTexto = `Un evento rarísimo acaba de ocurrir.\nMultiplicas tu apuesta x${multiplicador}.\n\nGanaste ${gananciaReal} monedas${coinsBuffPercentage > 0 ? ' (buffos aplicados)' : ''}.\nSaldo actual: ${nuevoBalance}`;
        } else if (ganoNormal) {
            let gananciaReal = applyBuffs(apuesta, userData.buffs, 'coins');
            nuevoBalance = Number(user.balance) + gananciaReal;
            tituloResultado = `Salió ${resultado.toUpperCase()}`;
            colorEmbed = 0x57F287;
            gananciaTexto = `Ganaste ${gananciaReal} monedas${coinsBuffPercentage > 0 ? ' (buffos aplicados)' : ''}.\nSaldo actual: ${nuevoBalance}`;
        } else {
            let perdidaReal = apuesta;
            if (coinsBuffPercentage > 0) {
                const retencion = Math.min(coinsBuffPercentage, 100);
                perdidaReal = Math.floor(apuesta * (1 - (retencion / 100)));
            }
            nuevoBalance = Number(user.balance) - perdidaReal;
            tituloResultado = `Salió ${resultado.toUpperCase()}`;
            colorEmbed = 0xED4245;
            if (perdidaReal < apuesta) {
                gananciaTexto = `Perdiste ${perdidaReal} monedas (retuviste algunas gracias a tu mascota).\nSaldo actual: ${nuevoBalance}`;
            } else {
                gananciaTexto = `Perdiste ${apuesta} monedas.\nSaldo actual: ${nuevoBalance}`;
            }
        }

        const { error: updateError } = await supabase
            .from('perfiles_economia')
            .update({ balance: nuevoBalance })
            .eq('discord_id', discordId)
            .eq('server_id', serverId);

        if (updateError) {
            return interaction.editReply({ 
                content: 'Error al actualizar tu saldo.', 
                embeds: [] 
            });
        }

        if (!ganoNormal && !cayoDeCanto) {
            const { procesarSeguro } = require('../utils/handleSeguro');
            const resultadoSeguro = await procesarSeguro(discordId, serverId, apuesta);
            
            if (resultadoSeguro.tituloDerrota === 'Derrota Asegurada') {
                tituloResultado = resultadoSeguro.tituloDerrota;
                nuevoBalance += Math.floor(apuesta * 0.25);
                gananciaTexto = `${resultadoSeguro.descripcionDerrota}`;
            }
        }

        const netReward = nuevoBalance - Number(user.balance);
        const netRewardStr = netReward >= 0 ? `+${netReward}` : `${netReward}`;

        const embedFinal = new EmbedBuilder()
            .setColor(colorEmbed)
            .setTitle(tituloResultado)
            .setDescription(gananciaTexto)
            .addFields(
                { name: '👤 Jugador', value: userData.displayName, inline: true },
                { name: '💵 Apuesta', value: `${apuesta} monedas`, inline: true },
                { name: '📈 Resultado Financiero', value: `${netRewardStr} monedas`, inline: true },
                { name: '💰 Saldo Actual', value: `${nuevoBalance.toLocaleString()} monedas`, inline: false }
            );

        if (resultado === 'cara') {
            embedFinal.setImage('https://rnhdmonauucuxpovqxun.supabase.co/storage/v1/object/public/vegas-media/Cara.png');
        } else if (resultado === 'sello') {
            embedFinal.setImage('https://rnhdmonauucuxpovqxun.supabase.co/storage/v1/object/public/vegas-media/Sello.png');
        } else if (resultado === 'canto') {
            embedFinal.setImage('https://rnhdmonauucuxpovqxun.supabase.co/storage/v1/object/public/vegas-media/Canto.png');
        }

        if (userData.activePet) {
            embedFinal.setFooter({ text: `🐾 Acompañado por: ${userData.activePet.title}` });
        }

        return interaction.editReply({ embeds: [embedFinal] });
    }
};