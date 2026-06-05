const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

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

        const boton = new ButtonBuilder()
            .setCustomId(`beg_${interaction.user.id}_${cantidad}`)
            .setLabel(`💸 Donar ${cantidad}`)
            .setStyle(ButtonStyle.Success);

        const fila = new ActionRowBuilder()
            .addComponents(boton);

        const respuesta = await interaction.reply({
            content: `${mensaje}\n\n⏰ Expira en 60 segundos.`,
            components: [fila],
            fetchReply: true
        });

        setTimeout(async () => {

            try {

                // Si el botón sigue existiendo, nadie donó
                if (respuesta.components.length > 0) {

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

                    await respuesta.edit({
                        content: frase,
                        components: []
                    });

                }

            } catch (error) {
                console.error(error);
            }

        }, 60000);
    }
};