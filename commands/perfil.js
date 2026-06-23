const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');
const { getUserWithBuffs, getTotalBuffValue } = require('../utils/handleUser');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('perfil')
        .setDescription('Muestra tu balance, título y mascota equipada'),

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

            const userData = await getUserWithBuffs(discordId, serverId, interaction.guild);

            if (!userData || !userData.profile) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ No tienes un perfil económico registrado. Usa `/daily` primero.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            const perfil = userData.profile;

            const { data: invTitulos } = await supabase
                .from('inventario_titulos')
                .select('titles(name)')
                .eq('discord_id', discordId)
                .eq('server_id', serverId)
                .eq('equiped', true)
                .maybeSingle();

            const tituloActivo = invTitulos && invTitulos.titles ? invTitulos.titles.name : 'Ninguno';

            const suerteBuff = getTotalBuffValue(userData.buffs, 'suerte');
            const suerteTotal = 50 + suerteBuff;

            const xpActual = Number(perfil.xp) || 0;
            const nivelActual = Number(perfil.nivel) || 1;
            const xpRequerido = 100 * (nivelActual * nivelActual);
            const porcentajeLlenado = Math.min(((xpActual / xpRequerido) * 100), 100).toFixed(1);
            const barraLlena = Math.min(Math.floor(porcentajeLlenado / 10), 10);
            const barraVacia = 10 - barraLlena;
            const representacionVisual = '🟩'.repeat(barraLlena) + '⬛'.repeat(barraVacia);

            const embed = new EmbedBuilder()
                .setTitle(`👤 Perfil de ${userData.displayName}`)
                .setColor(0x00AEFF)
                .addFields(
                    {
                        name: '🎖️ Nivel y Experiencia',
                        value: `**Nivel ${nivelActual}**\n${representacionVisual} **${porcentajeLlenado}%**\n(${xpActual.toLocaleString()} / ${xpRequerido.toLocaleString()} XP)`,
                        inline: false
                    },
                    {
                        name: '💰 Saldo',
                        value: perfil.balance.toLocaleString(),
                        inline: true
                    },
                    {
                        name: '🏆 Título Equipado',
                        value: tituloActivo,
                        inline: true
                    },
                    {
                        name: '🍀 Suerte',
                        value: `${suerteTotal}%`,
                        inline: true
                    }
                )
                .setThumbnail(interaction.user.displayAvatarURL());

            if (userData.activePet) {
                let buffosText = 'Sin buffos';
                if (userData.buffs && userData.buffs.length > 0) {
                    buffosText = userData.buffs
                        .map(b => `• **${b.boost_type.toUpperCase()}**: +${b.boost_percentage}%`)
                        .join('\n');
                }

                embed.addFields({
                    name: '━━━━━━━━ 🐾 MASCOTA ACTIVA ━━━━━━━━',
                    value: `**${userData.activePet.title}**\n${buffosText}`
                });
            } else {
                embed.addFields({
                    name: '━━━━━━━━ 🐾 MASCOTA ACTIVA ━━━━━━━━',
                    value: 'No tienes ninguna mascota equipada.'
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Error al cargar tu perfil.');
            await interaction.editReply({ embeds: [errEmbed], content: '' });
        }
    }
};