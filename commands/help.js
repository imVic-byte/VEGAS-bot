const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ComponentType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Muestra el manual interactivo de comandos del bot'),

    async execute(interaction) {
        await interaction.deferReply();

        const embedInicio = new EmbedBuilder()
            .setTitle('📚 Manual de Ayuda VEGAS')
            .setColor('DarkVividPink')
            .setDescription('Bienvenido al centro de información del casino.\n\nPor favor, utiliza el menú desplegable en la parte inferior para explorar las diferentes categorías de comandos y aprender cómo funciona cada sistema.');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('Elige una categoría de comandos')
            .addOptions([
                {
                    label: 'Casino y Apuestas',
                    description: 'Minijuegos, azar y multiplicadores',
                    value: 'casino',
                    emoji: '🎰',
                },
                {
                    label: 'Economía y Banco',
                    description: 'Dinero, transferencias, préstamos y robos',
                    value: 'economia',
                    emoji: '💰',
                },
                {
                    label: 'RPG e Inventario',
                    description: 'Tienda, niveles, equipamiento y duelos',
                    value: 'rpg',
                    emoji: '🎒',
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const respuesta = await interaction.editReply({
            embeds: [embedInicio],
            components: [row]
        });

        const collector = respuesta.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 300000 // 5 minutos antes de expirar
        });

        collector.on('collect', async i => {
            // Prevenir que otras personas usen el menú del usuario
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ Solo el usuario que ejecutó el comando puede usar este menú.', ephemeral: true });
            }

            const seleccion = i.values[0];
            let embedCategoria = new EmbedBuilder();

            if (seleccion === 'casino') {
                embedCategoria.setTitle('🎰 Comandos de Casino')
                    .setColor('Red')
                    .setDescription('Juegos de azar donde puedes multiplicar tu dinero... o perderlo todo.')
                    .addFields(
                        { name: '/slots [apuesta]', value: 'Juega a las tragamonedas clásicas buscando líneas ganadoras.' },
                        { name: '/ruleta [apuesta] [tipo] [valor]', value: 'Apuesta a colores, paridad o números específicos en una ruleta multijugador.' },
                        { name: '/blackjack [apuesta]', value: 'Enfréntate al dealer y acércate al 21 sin pasarte.' },
                        { name: '/crash [apuesta]', value: 'Retírate antes de que la nave explote para asegurar tu multiplicador.' },
                        { name: '/lucky [cara/sello] [apuesta]', value: 'Un lanzamiento de moneda. Doble o nada.' }
                    );
            } else if (seleccion === 'economia') {
                embedCategoria.setTitle('💰 Economía y Banco')
                    .setColor('Green')
                    .setDescription('Administra tu dinero líquido, solicita créditos o asalta a tus compañeros.')
                    .addFields(
                        { name: '/daily', value: 'Reclama tu recompensa diaria de monedas.' },
                        { name: '/wallet', value: 'Consulta tus fondos líquidos disponibles.' },
                        { name: '/boveda [status|depositar|retirar]', value: 'Guarda tus monedas en un lugar seguro e inmune a robos.' },
                        { name: '/pay [usuario] [cantidad]', value: 'Transfiere dinero a otro usuario (Sujeto a 12% de impuestos de Fisco).' },
                        { name: '/beg', value: 'Mendiga dinero en la calle.' },
                        { name: '/prestamo [pedir|pagar|consultar]', value: 'Solicita un crédito al banco con 20% de interés y un plazo de 48 horas para pagar.' },
                        { name: '/robar [usuario]', value: 'Intenta asaltar a otro jugador. Si fallas, pagarás grandes indemnizaciones.' },
                        { name: '/richest', value: 'Muestra la tabla de clasificación de los usuarios más ricos.' }
                    );
            } else if (seleccion === 'rpg') {
                embedCategoria.setTitle('🎒 RPG, Inventario y Perfil')
                .setColor('Purple')
                .setDescription('Progresa en tu nivel, equipa ítems únicos y desafía a otros.')
                .addFields(
                    { name: '/perfil', value: 'Visualiza tu tarjeta de jugador, nivel actual y experiencia.' },
                    { name: '/shop [items|...]', value: 'Accede a la tienda global para adquirir bienes (Aplica 10% de impuestos IVA).' },
                    { name: '/inventario', value: 'Revisa tu mochila, la caducidad de tus consumibles y tus usos restantes.' },
                    { name: '/duelo [usuario] [apuesta]', value: 'Desafía a otro jugador a un combate de vida o muerte por el dinero apostado.' },
                    { name: '/mismascotas', value: 'Equipa a una de tus mascotas adquiridas.' },
                    { name: '/misroles', value: 'Selecciona y equipa roles estéticos o buffos.' },
                    { name: '/mistitulos', value: 'Equipa un título que se muestre en tu perfil.' }
                );
            }

            // Actualizamos la respuesta con el nuevo embed
            await i.update({ embeds: [embedCategoria], components: [row] });
        });

        collector.on('end', () => {
            // Deshabilitar el select menu cuando caduque
            selectMenu.setDisabled(true);
            const disabledRow = new ActionRowBuilder().addComponents(selectMenu);
            interaction.editReply({ components: [disabledRow] }).catch(console.error);
        });
    }
};
