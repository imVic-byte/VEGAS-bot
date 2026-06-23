const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mistitulos')
        .setDescription('Equipa o desequipa tu título activo'),

    async execute(interaction) {
        const discordId = interaction.user.id;

        try {
            await interaction.deferReply({ ephemeral: true });

            const { data: invTitulos, error } = await supabase
                .from('inventario_titulos')
                .select(`
                    id,
                    equiped,
                    titles (
                        id,
                        name,
                        description
                    )
                `)
                .eq('discord_id', discordId);

            if (error) {
                console.error(error);
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ Hubo un error al cargar tus títulos.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            if (!invTitulos || invTitulos.length === 0) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('🏷️ No posees ningún título en tu inventario. ¡Visita la `/shop` para comprar algunos!');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            const options = [];
            const validTitulos = invTitulos.filter(item => item.titles).slice(0, 25);

            validTitulos.forEach(item => {
                let descriptionText = item.titles.description || 'Sin descripción adicional';

                if (descriptionText.length > 100) descriptionText = descriptionText.substring(0, 97) + '...';

                options.push(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(item.titles.name.substring(0, 100))
                        .setDescription(descriptionText)
                        .setValue(item.id.toString())
                        .setDefault(item.equiped)
                );
            });

            const select = new StringSelectMenuBuilder()
                .setCustomId('gestionar_titulos')
                .setPlaceholder('Selecciona tu título activo')
                .addOptions(options)
                .setMinValues(0)
                .setMaxValues(1);

            const row = new ActionRowBuilder().addComponents(select);

            const embed = new EmbedBuilder()
                .setTitle('🏷️ Gestor de Títulos')
                .setDescription('Abre el menú desplegable para seleccionar el título que deseas lucir.\n\nSolo puedes llevar **un título** equipado a la vez. Si deseas no mostrar ninguno, simplemente desmárcalo.')
                .setColor(0x00AEFF);

            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

        } catch (err) {
            console.error(err);
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Ocurrió un error inesperado al cargar tus títulos.');
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errEmbed] });
            } else {
                await interaction.reply({ embeds: [errEmbed], ephemeral: true });
            }
        }
    }
};
