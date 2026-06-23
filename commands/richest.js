const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('richest')
        .setDescription('Muestra los usuarios más ricos del casino')
        .addStringOption(option =>
            option.setName('clasificacion')
                .setDescription('Elige el tipo de clasificación de riqueza')
                .setRequired(false)
                .addChoices(
                    { name: 'Total (Billetera + Bóveda)', value: 'total' },
                    { name: 'Billetera Líquida', value: 'billetera' },
                    { name: 'Bóveda Protegida', value: 'boveda' }
                )
        ),

    async execute(interaction) {
        const serverId = interaction.guildId;
        if (!serverId) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Este comando solo se puede usar dentro de un servidor.');
            return interaction.reply({ embeds: [errEmbed], ephemeral: true });
        }

        await interaction.deferReply();

        const clasificacion = interaction.options.getString('clasificacion') || 'total';

        const { data: todosUsuarios, error } = await supabase
            .from('perfiles_economia')
            .select('discord_id, balance, balance_boveda')
            .eq('server_id', serverId);

        if (error) {
            console.error(error);
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Error al obtener el ranking.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        if (!todosUsuarios || todosUsuarios.length === 0) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Todavía no hay jugadores registrados.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        const usuariosMapeados = todosUsuarios.map(u => {
            const balanceVal = Number(u.balance) || 0;
            const bovedaVal = Number(u.balance_boveda) || 0;
            return {
                discord_id: u.discord_id,
                balance: balanceVal,
                balance_boveda: bovedaVal,
                total: balanceVal + bovedaVal
            };
        });

        if (clasificacion === 'total') {
            usuariosMapeados.sort((a, b) => b.total - a.total);
        } else if (clasificacion === 'billetera') {
            usuariosMapeados.sort((a, b) => b.balance - a.balance);
        } else if (clasificacion === 'boveda') {
            usuariosMapeados.sort((a, b) => b.balance_boveda - a.balance_boveda);
        }

        const top10 = usuariosMapeados.slice(0, 10);

        const promesas = top10.map(async (jugador, index) => {
            try {
                const member = await interaction.guild.members.fetch(jugador.discord_id);
                return {
                    posicion: index + 1,
                    username: member.displayName,
                    balance: jugador.balance,
                    balance_boveda: jugador.balance_boveda,
                    total: jugador.total
                };
            } catch {
                try {
                    const user = await interaction.client.users.fetch(jugador.discord_id);
                    return {
                        posicion: index + 1,
                        username: user.username,
                        balance: jugador.balance,
                        balance_boveda: jugador.balance_boveda,
                        total: jugador.total
                    };
                } catch {
                    return {
                        posicion: index + 1,
                        username: 'Usuario desconocido',
                        balance: jugador.balance,
                        balance_boveda: jugador.balance_boveda,
                        total: jugador.total
                    };
                }
            }
        });

        const ranking = await Promise.all(promesas);

        let tituloClasificacion = '';
        if (clasificacion === 'total') {
            tituloClasificacion = 'Total (Billetera + Bóveda)';
        } else if (clasificacion === 'billetera') {
            tituloClasificacion = 'Billetera Líquida';
        } else if (clasificacion === 'boveda') {
            tituloClasificacion = 'Bóveda Protegida';
        }

        const embed = new EmbedBuilder()
            .setTitle(`🏆 Top 10 Más Ricos`)
            .setColor(0xF1C40F)
            .setThumbnail(interaction.guild?.iconURL({ dynamic: true }) || null)
            .setTimestamp();

        let desc = `Clasificación actual basada en: **${tituloClasificacion}**\n\n`;
        ranking.forEach(r => {
            const medalla =
                r.posicion === 1 ? '🥇' :
                    r.posicion === 2 ? '🥈' :
                        r.posicion === 3 ? '🥉' :
                            '💰';

            if (clasificacion === 'total') {
                desc += `${medalla} **#${r.posicion} ${r.username}** — **${r.total.toLocaleString()}** monedas\n` +
                    `  *(💵 ${r.balance.toLocaleString()} | 🔐 ${r.balance_boveda.toLocaleString()})*\n\n`;
            } else if (clasificacion === 'billetera') {
                desc += `${medalla} **#${r.posicion} ${r.username}** — **${r.balance.toLocaleString()}** monedas líquidas\n` +
                    `  *(🔐 ${r.balance_boveda.toLocaleString()} en bóveda)*\n\n`;
            } else if (clasificacion === 'boveda') {
                desc += `${medalla} **#${r.posicion} ${r.username}** — **${r.balance_boveda.toLocaleString()}** monedas en bóveda\n` +
                    `  *(💵 ${r.balance.toLocaleString()} líquidas)*\n\n`;
            }
        });

        embed.setDescription(desc);

        return interaction.editReply({ embeds: [embed] });
    },
};