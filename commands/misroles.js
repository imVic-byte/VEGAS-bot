const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('misroles')
        .setDescription('Gestiona (equipa o desequipa) los roles que has comprado'),

    async execute(interaction) {
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
                .eq('discord_id', discordId);

            if (error) {
                console.error(error);
                return interaction.editReply('❌ Hubo un error al cargar tus roles.');
            }

            if (!invRoles || invRoles.length === 0) {
                return interaction.editReply('🎭 No posees ningún rol en tu inventario. ¡Visita la `/shop` para comprar algunos!');
            }

            // Obtener el member de Discord para ver qué roles tiene equipados
            const member = await interaction.guild.members.fetch(discordId);

            const options = [];
            
            // Filtramos roles válidos y tomamos máximo 25 por el límite de Discord en menús
            const validRoles = invRoles
                .filter(item => item.roles && item.roles.discord_role_id)
                .slice(0, 25);

            if (validRoles.length === 0) {
                 return interaction.editReply('❌ Ocurrió un problema con los roles registrados (falta ID de Discord).');
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
            if (interaction.deferred) {
                await interaction.editReply('❌ Ocurrió un error inesperado al cargar tus roles.');
            } else {
                await interaction.reply({ content: '❌ Ocurrió un error inesperado al cargar tus roles.', ephemeral: true });
            }
        }
    }
};
