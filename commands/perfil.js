const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Muestra tu perfil económico'),

    async execute(interaction) {

        const discordId = interaction.user.id;

        try {

            // Obtener perfil económico

            const { data: perfil, error: perfilError } = await supabase
                .from('perfiles_economia')
                .select('*')
                .eq('discord_id', discordId)
                .single();

            if (perfilError || !perfil) {
                return interaction.reply({
                    content: '❌ No tienes perfil económico.',
                    ephemeral: true
                });
            }

            // Obtener inventario con nombres

            const { data: inventario, error: inventarioError } = await supabase
                .from('inventario_usuario')
                .select(`
                    item_id,
                    tienda (
                        nombre,
                        tipo
                    )
                `)
                .eq('discord_id', discordId);

            if (inventarioError) {
                console.error(inventarioError);
            }

            let itemsTexto = 'Sin artículos';

            if (inventario && inventario.length > 0) {

                itemsTexto = inventario
                    .map(item => `• ${item.tienda.nombre}`)
                    .join('\n');

            }

            // Buscar títulos

            const titulos = inventario
                ?.filter(item => item.tienda.tipo === 'title')
                .map(item => item.tienda.nombre);

            const tituloActivo = titulos?.length
                ? titulos[0]
                : 'Sin título';

            const embed = new EmbedBuilder()
                .setTitle(`👤 Perfil de ${interaction.user.username}`)
                .setColor(0x00AEFF)
                .addFields(
                    {
                        name: '💰 Saldo',
                        value: perfil.balance.toLocaleString(),
                        inline: true
                    },
                    {
                        name: '🏆 Título',
                        value: tituloActivo,
                        inline: true
                    },
                    {
                        name: '📦 Artículos',
                        value: itemsTexto
                    }
                )
                .setThumbnail(interaction.user.displayAvatarURL());

            await interaction.reply({
                embeds: [embed]
            });

        } catch (error) {

            console.error(error);

            await interaction.reply({
                content: '❌ Error al cargar el perfil.',
                ephemeral: true
            });

        }

    }
};