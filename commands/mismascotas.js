const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mismascotas')
        .setDescription('Equipa o desequipa tu mascota activa'),

    async execute(interaction) {
        const discordId = interaction.user.id;

        try {
            await interaction.deferReply({ ephemeral: true });

            const { data: invMascotas, error } = await supabase
                .from('inventario_mascotas')
                .select(`
                    id,
                    equiped,
                    mascotas (
                        id,
                        title,
                        mascotas_buffos (*)
                    )
                `)
                .eq('discord_id', discordId);

            if (error) {
                console.error(error);
                return interaction.editReply('❌ Hubo un error al cargar tus mascotas.');
            }

            if (!invMascotas || invMascotas.length === 0) {
                return interaction.editReply('🐾 No posees ninguna mascota en tu inventario. ¡Visita la `/shop` para comprar algunas!');
            }

            const options = [];
            const validMascotas = invMascotas.filter(item => item.mascotas).slice(0, 25);

            validMascotas.forEach(item => {
                let buffosText = 'Sin buffos especiales';
                if (item.mascotas.mascotas_buffos && item.mascotas.mascotas_buffos.length > 0) {
                    buffosText = item.mascotas.mascotas_buffos
                        .map(b => `${b.boost_type}: +${b.boost_percentage}%`)
                        .join(', ');
                }

                if (buffosText.length > 100) buffosText = buffosText.substring(0, 97) + '...';

                options.push(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(item.mascotas.title.substring(0, 100))
                        .setDescription(buffosText)
                        .setValue(item.id.toString())
                        .setDefault(item.equiped)
                );
            });

            const select = new StringSelectMenuBuilder()
                .setCustomId('gestionar_mascotas')
                .setPlaceholder('Selecciona tu mascota activa')
                .addOptions(options)
                .setMinValues(0)
                .setMaxValues(1);

            const row = new ActionRowBuilder().addComponents(select);

            const embed = new EmbedBuilder()
                .setTitle('🐾 Gestor de Mascotas')
                .setDescription('Abre el menú desplegable para seleccionar la mascota que quieres que te acompañe.\n\nSolo puedes llevar **una mascota** equipada a la vez. Si quieres desequiparla, simplemente desmárcala.')
                .setColor(0x00AEFF);

            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

        } catch (err) {
            console.error(err);
            if (interaction.deferred) {
                await interaction.editReply('❌ Ocurrió un error inesperado al cargar tus mascotas.');
            } else {
                await interaction.reply({ content: '❌ Ocurrió un error inesperado al cargar tus mascotas.', ephemeral: true });
            }
        }
    }
};
