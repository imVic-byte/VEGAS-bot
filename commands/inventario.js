const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventario')
        .setDescription('Muestra todos los artículos que posees'),

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
            await interaction.deferReply();

            const { data: invMascotas } = await supabase
                .from('inventario_mascotas')
                .select(`
                    mascotas (
                        title,
                        mascotas_buffos (*)
                    )
                `)
                .eq('discord_id', discordId)
                .eq('server_id', serverId);

            const { data: invRoles } = await supabase
                .from('inventario_roles')
                .select('roles(title)')
                .eq('discord_id', discordId)
                .eq('server_id', serverId);

            const { data: invTitulos } = await supabase
                .from('inventario_titulos')
                .select('titles(name)')
                .eq('discord_id', discordId)
                .eq('server_id', serverId);

            const { data: invItems } = await supabase
                .from('inventario_items')
                .select('tienda_items(nombre), usos_restantes, expira_el')
                .eq('discord_id', discordId)
                .eq('server_id', serverId);

            const embed = new EmbedBuilder()
                .setTitle(`📦 Inventario de ${interaction.user.username}`)
                .setColor(0x9B59B6)
                .setThumbnail(interaction.user.displayAvatarURL());

            let hasItems = false;

            if (invRoles && invRoles.length > 0) {
                const rolesText = invRoles.filter(i => i.roles).map(i => `• ${i.roles.title}`).join('\n');
                if (rolesText) {
                    embed.addFields({ name: '━━━━━━━━━━ 🎭 ROLES 🎭 ━━━━━━━━━━', value: rolesText });
                    hasItems = true;
                }
            }

            if (invTitulos && invTitulos.length > 0) {
                const titulosText = invTitulos.filter(i => i.titles).map(i => `• ${i.titles.name}`).join('\n');
                if (titulosText) {
                    embed.addFields({ name: '━━━━━━━━━ 🏷️ TÍTULOS 🏷️ ━━━━━━━━━', value: titulosText });
                    hasItems = true;
                }
            }

            if (invMascotas && invMascotas.length > 0) {
                const mascotasText = invMascotas.filter(i => i.mascotas).map(i => {
                    let text = `• ${i.mascotas.title}`;
                    if (i.mascotas.mascotas_buffos && i.mascotas.mascotas_buffos.length > 0) {
                        const buffs = i.mascotas.mascotas_buffos.map(b => `${b.boost_type}: +${b.boost_percentage}%`).join(', ');
                        text += `\n  └ *${buffs}*`;
                    }
                    return text;
                }).join('\n');
                
                if (mascotasText) {
                    embed.addFields({ name: '━━━━━━━━ 🐾 MASCOTAS 🐾 ━━━━━━━━', value: mascotasText });
                    hasItems = true;
                }
            }

            if (invItems && invItems.length > 0) {
                const itemsText = invItems.filter(i => i.tienda_items).map(i => {
                    let text = `• **${i.tienda_items.nombre}**`;
                    if (i.usos_restantes !== null) text += `\n  └ Usos restantes: ${i.usos_restantes}`;
                    if (i.expira_el !== null) {
                        const unixTime = Math.floor(new Date(i.expira_el).getTime() / 1000);
                        text += `\n  └ Expira: <t:${unixTime}:R>`;
                    }
                    return text;
                }).join('\n');
                
                if (itemsText) {
                    embed.addFields({ name: '━━━━━━━━━ 🎒 OBJETOS 🎒 ━━━━━━━━', value: itemsText });
                    hasItems = true;
                }
            }

            if (!hasItems) {
                embed.setDescription('Tu inventario está vacío. ¡Visita la `/shop` para adquirir artículos!');
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: '❌ Error al cargar tu inventario.' });
        }
    }
};
