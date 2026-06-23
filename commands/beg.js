const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder
} = require('discord.js');
const supabase = require('../supabase');
const { noMoney, yourself, together } = require('../utils/responses');
const { sumarAlFisco, obtenerTasaImpuesto } = require('../utils/handleFisco');

const cooldowns = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Pide monedas a otros jugadores')
        .addIntegerOption(option =>
            option.setName('cantidad')
                .setDescription('Cantidad que deseas pedir')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(200)
        ),

    async execute(interaction) {
        const serverId = interaction.guildId;
        if (!serverId) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Este comando solo se puede usar dentro de un servidor.');
            return interaction.reply({ embeds: [errEmbed], ephemeral: true });
        }

        const tiempoCooldown = 120000;

        if (cooldowns.has(interaction.user.id)) {
            const tiempoExpiracion = cooldowns.get(interaction.user.id) + tiempoCooldown;

            if (Date.now() < tiempoExpiracion) {
                const tiempoRestante = (tiempoExpiracion - Date.now()) / 1000;
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(`❌ Debes esperar **${tiempoRestante.toFixed(1)}** segundos antes de volver a pedir monedas.`);
                return interaction.reply({
                    embeds: [errEmbed],
                    ephemeral: true
                });
            }
        }

        cooldowns.set(interaction.user.id, Date.now());

        const cantidad = interaction.options.getInteger('cantidad');

        const frases = [
            `🥺 ${interaction.user.username} está mendigando **${cantidad}** monedas para seguir apostando.`,
            `🎰 ${interaction.user.username} perdió todo en el casino y necesita **${cantidad}** monedas.`,
            `💀 ${interaction.user.username} apostó hasta los calcetines y pide **${cantidad}** monedas.`,
            `🍀 ${interaction.user.username} jura que la próxima apuesta será la ganadora. Necesita **${cantidad}** monedas.`,
            `📉 ${interaction.user.username} sufrió una tragedia financiera y busca **${cantidad}** monedas.`,
            `🪙 ${interaction.user.username} está revisando debajo de los cojines buscando **${cantidad}** monedas.`,
            `🏦 El banco VEGAS rechazó el préstamo de ${interaction.user.username}. Necesita **${cantidad}** monedas.`,
            `🤡 ${interaction.user.username} asegura que esta vez sí recuperará todo. Solo necesita **${cantidad}** monedas.`,
            `🚨 Alerta económica: ${interaction.user.username} necesita **${cantidad}** monedas urgentemente.`,
            `🎲 ${interaction.user.username} quiere una última oportunidad y solicita **${cantidad}** monedas.`
        ];

        const mensaje = frases[Math.floor(Math.random() * frases.length)];

        const embedPeticion = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setDescription(`${mensaje}\n\n⏰ Expira en 60 segundos.`)
            .setImage('https://rnhdmonauucuxpovqxun.supabase.co/storage/v1/object/public/vegas-media/beg.jpg');

        const boton = new ButtonBuilder()
            .setCustomId(`beg_${interaction.user.id}_${cantidad}`)
            .setLabel(`💸 Donar ${cantidad}`)
            .setStyle(ButtonStyle.Success);

        const fila = new ActionRowBuilder()
            .addComponents(boton);

        const respuesta = await interaction.reply({
            embeds: [embedPeticion],
            components: [fila],
            fetchReply: true
        });

        const collector = respuesta.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000
        });

        collector.on('collect', async i => {
            if (i.customId === `beg_${interaction.user.id}_${cantidad}`) {
                if (i.user.id === interaction.user.id) {
                    await i.reply(yourself());
                    return;
                }
                
                const { data: donor, error: donorError } = await supabase
                    .from('perfiles_economia')
                    .select('balance')
                    .eq('discord_id', i.user.id)
                    .eq('server_id', serverId)
                    .single();

                if (donorError || !donor) {
                    const errEmbed = new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('❌ No tienes una cuenta registrada o ha ocurrido un error en este servidor.');
                    return i.reply({ embeds: [errEmbed], ephemeral: true });
                }

                if (Number(donor.balance) < cantidad) {
                    return i.reply(noMoney(donor.balance));
                }

                const { data: beggar, error: beggarError } = await supabase
                    .from('perfiles_economia')
                    .select('balance')
                    .eq('discord_id', interaction.user.id)
                    .eq('server_id', serverId)
                    .single();

                if (beggarError || !beggar) {
                    const errEmbed = new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('❌ El usuario que pide monedas no tiene una cuenta válida en este servidor.');
                    return i.reply({ embeds: [errEmbed], ephemeral: true });
                }

                const tasa = await obtenerTasaImpuesto(0.12);
                const impuesto = Math.floor(cantidad * tasa);
                const neto = cantidad - impuesto;

                const { error: deductError } = await supabase
                    .from('perfiles_economia')
                    .update({ balance: Number(donor.balance) - cantidad })
                    .eq('discord_id', i.user.id)
                    .eq('server_id', serverId);

                if (deductError) {
                    const errEmbed = new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('❌ Hubo un error al procesar la donación.');
                    return i.reply({ embeds: [errEmbed], ephemeral: true });
                }

                const { error: addError } = await supabase
                    .from('perfiles_economia')
                    .update({ balance: Number(beggar.balance) + neto })
                    .eq('discord_id', interaction.user.id)
                    .eq('server_id', serverId);

                if (addError) {
                    console.error('Error adding balance to beggar:', addError);
                } else {
                    await sumarAlFisco(impuesto);
                }

                const porcentaje = (tasa * 100).toFixed(0);
                const embedDonacion = new EmbedBuilder()
                    .setColor(0x57F287)
                    .setDescription(`💖 <@${i.user.id}> se compadeció y donó **${cantidad}** monedas a <@${interaction.user.id}>.\n\n` + 
                    `🏛️ El Fisco retuvo **${impuesto}** monedas (${porcentaje}% IVA).\n` +
                    `📦 <@${interaction.user.id}> recibió un neto de **${neto}** monedas.`);

                await i.update({
                    content: '',
                    embeds: [embedDonacion],
                    components: []
                });
                
                collector.stop('donado');
            }
        });
        collector.on('end', async (collected, reason) => {
            if (reason !== 'donado') {

                    const rechazos = [
                        `💀 Nadie quiso ayudar a este ludópata.\n\n<@${interaction.user.id}> tendrá que esperar otra oportunidad.`,

                        `🎰 El casino se quedó con todo.\n\nNadie ayudó a <@${interaction.user.id}>.`,

                        `🥲 <@${interaction.user.id}> extendió la mano...\n\npero nadie respondió.`,

                        `🚫 Solicitud expirada.\n\nNi una sola moneda para <@${interaction.user.id}>.`,

                        `🪙 <@${interaction.user.id}> buscó monedas hasta debajo de los cojines...\n\nsin éxito.`,

                        `📉 Los inversionistas rechazaron financiar a <@${interaction.user.id}>.`,

                        `🏦 El banco VEGAS informó que <@${interaction.user.id}> no califica para un préstamo.`,

                        `🤡 <@${interaction.user.id}> prometió que esta vez sí ganaría...\n\nnadie le creyó.`,

                        `🍀 La suerte abandonó a <@${interaction.user.id}> hace bastante rato.`,

                        `🫠 <@${interaction.user.id}> quedó viendo cómo los demás seguían apostando.`,

                        `🐀 Hasta las ratas del casino tienen más monedas que <@${interaction.user.id}>.`,

                        `💸 Todos vieron la solicitud de <@${interaction.user.id}>.\nTodos decidieron ignorarla.`,

                        `🎲 El destino fue cruel con <@${interaction.user.id}>.\nY los jugadores también.`,

                        `📭 La solicitud de ayuda de <@${interaction.user.id}> fue enviada al buzón de spam.`,

                        `🙈 Nadie vio a <@${interaction.user.id}>.\nO eso dicen para no prestar dinero.`,

                        `⚰️ Se celebró el funeral financiero de <@${interaction.user.id}>.`,

                        `🍞 <@${interaction.user.id}> ahora deberá sobrevivir con migajas.`,

                        `🪦 Aquí yacen las esperanzas económicas de <@${interaction.user.id}>.`,

                        `🚑 Se reporta una emergencia financiera.\nNadie acudió a ayudar a <@${interaction.user.id}>.`,

                        `🐟 <@${interaction.user.id}> lanzó el anzuelo buscando monedas.\nNo picó nadie.`,

                        `📢 "¡Necesito monedas!" gritó <@${interaction.user.id}>.\nEl silencio fue ensordecedor.`,

                        `🎭 La actuación de mendigo de <@${interaction.user.id}> no convenció a nadie.`,

                        `💳 Crédito rechazado.\nPréstamo rechazado.\nAyuda rechazada.\nQué día para <@${interaction.user.id}>.`,

                        `👻 La solicitud de <@${interaction.user.id}> desapareció sin dejar rastro.`,

                        `🗿 El servidor observó la petición de <@${interaction.user.id}> con absoluta indiferencia.`
                    ];

                    const frase =
                        rechazos[Math.floor(Math.random() * rechazos.length)];

                    const embedRechazo = new EmbedBuilder()
                        .setColor(0xED4245)
                        .setDescription(frase)
                        .setImage('https://rnhdmonauucuxpovqxun.supabase.co/storage/v1/object/public/vegas-media/nohelp.jpg');

                    try {
                        await respuesta.edit({
                            content: '',
                            embeds: [embedRechazo],
                            components: []
                        });
                    } catch (error) {
                        console.error(error);
                    }
            }
        });
    }
};