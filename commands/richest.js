const { SlashCommandBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('richest')
        .setDescription('Muestra los usuarios más ricos del casino'),

    async execute(interaction) {
        await interaction.deferReply();

        const { data: usuarios, error } = await supabase
            .from('perfiles_economia')
            .select('discord_id, balance')
            .order('balance', { ascending: false })
            .limit(10);

        if (error) {
            console.error(error);
            return interaction.editReply('Error al obtener el ranking.');
        }

        if (!usuarios || usuarios.length === 0) {
            return interaction.editReply('Todavía no hay jugadores registrados.');
        }

        let mensaje = '🏆 **TOP 10 MÁS RICOS DE VEGAS** 🏆\n\n';

        for (let i = 0; i < usuarios.length; i++) {
            const jugador = usuarios[i];

            try {
                const user = await interaction.client.users.fetch(jugador.discord_id);

                const medalla =
                    i === 0 ? '🥇' :
                    i === 1 ? '🥈' :
                    i === 2 ? '🥉' :
                    '💰';

                mensaje += `${medalla} **${i + 1}. ${user.username}** — ${jugador.balance} monedas\n`;
            } catch {
                mensaje += `💰 **${i + 1}. Usuario desconocido** — ${jugador.balance} monedas\n`;
            }
        }

        return interaction.editReply(mensaje);
    },
};