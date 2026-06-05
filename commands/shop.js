const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Muestra los artículos disponibles en la tienda'),

    async execute(interaction) {

        console.log("SUPABASE_URL:", process.env.SUPABASE_URL);

        try {

            const { data: items, error } = await supabase
                .from('tienda')
                .select('*');

                console.log("ITEMS:", items);
                console.log("ERROR:", error);
                
            if (error) {
                console.error(error);

                return interaction.reply({
                    content: '❌ Error al cargar la tienda.',
                    ephemeral: true
                });
            }

            if (!items || items.length === 0) {
                return interaction.reply({
                    content: '🏪 La tienda está vacía.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('🏪 Tienda del Servidor')
                .setColor(0xFFD700)
                .setDescription('Utiliza `/comprar id:<numero>` para comprar.');

            items.forEach(item => {

                embed.addFields({
                    name: `🛒 ID ${item.id} - ${item.nombre}`,
                    value:
                        `💰 Precio: **${item.precio}** monedas\n` +
                        `📦 Tipo: **${item.tipo}**\n` +
                        `📝 ${item.descripcion || 'Sin descripción'}`
                });

            });

            await interaction.reply({
                embeds: [embed]
            });

        } catch (err) {

            console.error(err);

            await interaction.reply({
                content: '❌ Ocurrió un error al mostrar la tienda.',
                ephemeral: true
            });

        }

    }
};