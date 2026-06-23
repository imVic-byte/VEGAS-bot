const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('misroles')
        .setDescription('Gestiona (equipa o desequipa) los roles que has comprado'),

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
            // El menú debe ser ephemeral para que cada usuario gestione sus propios roles en privado
            await interaction.deferReply({ ephemeral: true });

            // Obtener roles que posee el usuario
            const { data: invRoles, error } = await supabase
                .from('inventario_roles')
                .select(`
                    roles (
                        id,
                        title,
                        discord_role_id
                    )
                `)
                .eq('discord_id', discordId)
                .eq('server_id', serverId);

            if (error) {
                console.error(error);
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ Hubo un error al cargar tus roles.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            if (!invRoles || invRoles.length === 0) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('🎭 No posees ningún rol en tu inventario. ¡Visita la `/shop` para comprar algunos!');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            // Obtener el member de Discord para ver qué roles tiene equipados
            const member = await interaction.guild.members.fetch(discordId);

            const options = [];
            
            // Filtramos roles válidos y tomamos máximo 25 por el límite de Discord en menús
            const validRoles = invRoles
                .filter(item => item.roles && item.roles.discord_role_id)
                .slice(0, 25);

            if (validRoles.length === 0) {
                 const errEmbed = new EmbedBuilder()
                     .setColor('Red')
                     .setDescription('❌ Ocurrió un problema con los roles registrados (falta ID de Discord).');
                 return interaction.editReply({ embeds: [errEmbed] });
            }

            validRoles.forEach(item => {
                const roleId = item.roles.discord_role_id;
                const isEquipped = member.roles.cache.has(roleId);
                
                options.push(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(item.roles.title.substring(0, 100))
                        .setValue(roleId)
                        .setDefault(isEquipped)
                );
            });

            const select = new StringSelectMenuBuilder()
                .setCustomId('gestionar_roles')
                .setPlaceholder('Selecciona los roles que quieres equipar')
                .addOptions(options)
                .setMinValues(0)
                .setMaxValues(options.length);

            const row = new ActionRowBuilder().addComponents(select);

            const embed = new EmbedBuilder()
                .setTitle('🎭 Gestor de Roles')
                .setDescription('Abre el menú desplegable de abajo para marcar los roles que quieres equiparte y desmarcar los que quieres quitarte.\n\nLos roles marcados se aplicarán a tu perfil en este servidor.')
                .setColor(0x00AEFF);

            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

        } catch (err) {
            console.error(err);
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Ocurrió un error inesperado al cargar tus roles.');
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errEmbed] });
            } else {
                await interaction.reply({ embeds: [errEmbed], ephemeral: true });
            }
        }
    }
};
