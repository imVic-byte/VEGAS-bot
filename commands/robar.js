const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');
const { sumarAlFisco } = require('../utils/handleFisco');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('robar')
        .setDescription('Intenta robar monedas a otro usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario al que quieres robar')
                .setRequired(true)),

    async execute(interaction) {
        const serverId = interaction.guildId;
        if (!serverId) {
            return interaction.reply({ content: '❌ Este comando solo se puede usar dentro de un servidor.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const atacanteId = interaction.user.id;
        const victima = interaction.options.getUser('usuario');

        if (atacanteId === victima.id) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ No puedes robarte a ti mismo.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        const { data: atacanteData, error: atacanteError } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', atacanteId)
            .eq('server_id', serverId)
            .single();

        if (atacanteError || !atacanteData) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ No tienes una cuenta económica. Usa `/daily` primero.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        if (Number(atacanteData.balance) < 500) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Necesitas al menos 500 monedas en tu balance para poder contratar un ladrón.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        if (atacanteData.ultimo_robo) {
            const ultimoRobo = new Date(atacanteData.ultimo_robo);
            const now = new Date();
            const diffInMs = now - ultimoRobo;
            const msIn30Min = 30 * 60 * 1000;

            if (diffInMs < msIn30Min) {
                const timeLeftMs = msIn30Min - diffInMs;
                const minutesLeft = Math.floor(timeLeftMs / (1000 * 60));
                const secondsLeft = Math.floor((timeLeftMs % (1000 * 60)) / 1000);
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(`❌ Debes esperar **${minutesLeft}m y ${secondsLeft}s** para volver a robar.`);
                return interaction.editReply({ embeds: [errEmbed] });
            }
        }

        const { data: victimaData, error: victimaError } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', victima.id)
            .eq('server_id', serverId)
            .single();

        if (victimaError || !victimaData) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ El usuario al que intentas robar no tiene una cuenta económica.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        if (Number(victimaData.balance) < 1000) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Esta víctima tiene protección por tener menos de 1000 monedas.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        if (victimaData.sido_robado_el) {
            const sidoRobadoEl = new Date(victimaData.sido_robado_el);
            const now = new Date();
            const diffInMs = now - sidoRobadoEl;
            const msIn2Hours = 2 * 60 * 60 * 1000;

            if (diffInMs < msIn2Hours) {
                const timeLeftMs = msIn2Hours - diffInMs;
                const hoursLeft = Math.floor(timeLeftMs / (1000 * 60 * 60));
                const minutesLeft = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(`❌ Este usuario tiene protección temporal contra robos. Intenta en **${hoursLeft}h y ${minutesLeft}m**.`);
                return interaction.editReply({ embeds: [errEmbed] });
            }
        }

        const { data: maletin } = await supabase
            .from('inventario_items')
            .select('*')
            .eq('discord_id', victima.id)
            .eq('item_id', 2)
            .gt('usos_restantes', 0)
            .single();

        const nowIso = new Date().toISOString();

        if (maletin) {
            const usosRestantes = maletin.usos_restantes - 1;

            if (usosRestantes <= 0) {
                await supabase
                    .from('inventario_items')
                    .delete()
                    .eq('id', maletin.id);
            } else {
                await supabase
                    .from('inventario_items')
                    .update({ usos_restantes: usosRestantes })
                    .eq('id', maletin.id);
            }

            const multaFija = 1000;
            let nuevoSaldoAtacante = Number(atacanteData.balance) - multaFija;
            if (nuevoSaldoAtacante < 0) nuevoSaldoAtacante = 0;

            const { error: updateError } = await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoSaldoAtacante, ultimo_robo: nowIso })
                .eq('discord_id', atacanteId)
                .eq('server_id', serverId);

            if (!updateError) {
                await sumarAlFisco(multaFija);
            }

            const embedMaletin = new EmbedBuilder()
                .setTitle('🚨 Robo Frustrado por Defensa')
                .setColor(0xFF0000)
                .setDescription(`**<@${atacanteId}>** intentó robar a **<@${victima.id}>**, pero el robo fracasó porque la víctima portaba un **Maletín de Doble Fondo** de defensa.`)
                .addFields(
                    { name: 'Multa del Fisco a Atacante', value: `-${multaFija} monedas`, inline: true },
                    { name: 'Nuevo Saldo del Atacante', value: `${nuevoSaldoAtacante} monedas`, inline: true }
                );

            await interaction.editReply({ content: '❌ El robo ha fallado y se ha publicado la multa en el canal público.' });
            return interaction.channel.send({ content: `🚨 **¡Robo frustrado!** <@${atacanteId}> intentó robar a <@${victima.id}>.`, embeds: [embedMaletin] });
        }

        const exito = Math.random() < 0.50;

        if (exito) {
            const porcentajeRobo = Math.floor(Math.random() * (25 - 10 + 1)) + 10;
            const montoRobado = Math.floor((porcentajeRobo / 100) * Number(victimaData.balance));

            const nuevoSaldoAtacante = Number(atacanteData.balance) + montoRobado;
            const nuevoSaldoVictima = Number(victimaData.balance) - montoRobado;

            const { error: updateAtacanteError } = await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoSaldoAtacante, ultimo_robo: nowIso })
                .eq('discord_id', atacanteId)
                .eq('server_id', serverId);

            if (updateAtacanteError) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ Ocurrió un error al intentar el robo.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            const { error: updateVictimaError } = await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoSaldoVictima, sido_robado_el: nowIso })
                .eq('discord_id', victima.id)
                .eq('server_id', serverId);

            if (updateVictimaError) {
                await supabase
                    .from('perfiles_economia')
                    .update({ balance: atacanteData.balance })
                    .eq('discord_id', atacanteId)
                    .eq('server_id', serverId);

                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ Ocurrió un error al sustraer el dinero de la víctima. El robo fue cancelado.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            const embedExito = new EmbedBuilder()
                .setTitle('Robo Exitoso')
                .setColor(0x00FF00)
                .setDescription(`Has robado ${montoRobado} monedas (el ${porcentajeRobo}%) a ${victima.username}.`)
                .addFields(
                    { name: 'Tu Nuevo Saldo', value: `${nuevoSaldoAtacante} monedas`, inline: false }
                );

            // Notificar a la víctima por DM sin revelar el ladrón
            try {
                const embedNotificacion = new EmbedBuilder()
                    .setTitle('🚨 ¡TE HAN ROBADO! 🚨')
                    .setColor(0xFF0000)
                    .setDescription('Un ladrón sigiloso se ha llevado parte de tus monedas sin dejar rastro.')
                    .addFields(
                        { name: 'Monedas Perdidas', value: `-${montoRobado} monedas`, inline: true },
                        { name: 'Tu Nuevo Saldo', value: `${nuevoSaldoVictima} monedas`, inline: true }
                    )
                    .setTimestamp();

                await victima.send({ embeds: [embedNotificacion] });
            } catch (error) {
                console.error(`No se pudo enviar la notificación de robo a ${victima.username} (DMs cerrados):`, error);
            }

            return interaction.editReply({ embeds: [embedExito] });

        } else {
            const porcentajePenalizacion = 15;
            const montoPenalizacion = Math.floor((porcentajePenalizacion / 100) * Number(atacanteData.balance));

            const nuevoSaldoAtacante = Number(atacanteData.balance) - montoPenalizacion;
            const nuevoSaldoVictima = Number(victimaData.balance) + montoPenalizacion;

            const { error: updateAtacanteError } = await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoSaldoAtacante, ultimo_robo: nowIso })
                .eq('discord_id', atacanteId)
                .eq('server_id', serverId);

            if (updateAtacanteError) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ Ocurrió un error al intentar el robo.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            const { error: updateVictimaError } = await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoSaldoVictima })
                .eq('discord_id', victima.id)
                .eq('server_id', serverId);

            if (updateVictimaError) {
                await supabase
                    .from('perfiles_economia')
                    .update({ balance: atacanteData.balance })
                    .eq('discord_id', atacanteId)
                    .eq('server_id', serverId);

                return interaction.editReply('Ocurrio un error al transferir la indemnizacion a la victima. El robo fue cancelado.');
            }

            const embedFracaso = new EmbedBuilder()
                .setTitle('🚨 Robo Fallido: Atrapado con las manos en la masa')
                .setColor(0xFF0000)
                .setDescription(`**<@${atacanteId}>** intentó robar a **<@${victima.id}>**, pero fue atrapado.`)
                .addFields(
                    { name: 'Ladrón', value: `<@${atacanteId}>`, inline: true },
                    { name: 'Víctima', value: `<@${victima.id}>`, inline: true },
                    { name: 'Multa Pagada a Víctima', value: `${montoPenalizacion} monedas`, inline: true },
                    { name: 'Nuevo Saldo del Ladrón', value: `${nuevoSaldoAtacante} monedas`, inline: true },
                    { name: 'Nuevo Saldo de la Víctima', value: `${nuevoSaldoVictima} monedas`, inline: true }
                );

            await interaction.editReply({ content: '❌ Fuiste atrapado robando y se ha notificado en el canal público.' });
            return interaction.channel.send({ content: `🚨 **¡Robo fallido!** <@${atacanteId}> intentó robar a <@${victima.id}> y fue atrapado.`, embeds: [embedFracaso] });
        }
    }
};
