const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mismascotas')
        .setDescription('Equipa o desequipa tu mascota activa'),

    async execute(interaction) {
        const serverId = interaction.guildId;
        if (!serverId) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Este comando solo se puede usar dentro de un servidor.');
            return interaction.reply({ embeds: [errEmbed], ephemeral: true });
        }

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
                .eq('discord_id', discordId)
                .eq('server_id', serverId);

            if (error) {
                console.error(error);
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ Hubo un error al cargar tus mascotas.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            if (!invMascotas || invMascotas.length === 0) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('🐾 No posees ninguna mascota en tu inventario. ¡Visita la `/shop` para comprar algunas!');
                return interaction.editReply({ embeds: [errEmbed] });
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
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Ocurrió un error inesperado al cargar tus mascotas.');
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errEmbed] });
            } else {
                await interaction.reply({ embeds: [errEmbed], ephemeral: true });
            }
        }
    }
};
