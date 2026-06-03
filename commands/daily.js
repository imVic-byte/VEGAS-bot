const { SlashCommandBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Reclama tus monedas diarias en VEGAS'),
    async execute(interaction) {
        await interaction.deferReply();

        const discordId = interaction.user.id;
        const reward = 500;

        let { data: user, error: selectError } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', discordId)
            .single();

        if (!user) {
            const { error: insertError } = await supabase
                .from('perfiles_economia')
                .insert([{
                    discord_id: discordId,
                    balance: reward,
                    ultima_recompensa: new Date().toISOString()
                }]);

            if (insertError) {
                return interaction.editReply('Error al contactar con la base de datos.');
            }
            return interaction.editReply(`Bienvenido/a al juego. Recibiste ${reward} monedas para empezar.`);
        }

        const lastReward = new Date(user.ultima_recompensa);
        const now = new Date();
        const diffInHours = Math.abs(now - lastReward) / 36e5;

        if (diffInHours < 24) {
            const hoursLeft = (24 - diffInHours).toFixed(1);
            return interaction.editReply(`Vuelve en ${hoursLeft} horas para tu siguiente recompensa.`);
        }

        const newBalance = Number(user.balance) + reward;

        const { error: updateError } = await supabase
            .from('perfiles_economia')
            .update({ balance: newBalance, ultima_recompensa: new Date().toISOString() })
            .eq('discord_id', discordId);

        if (updateError) {
            return interaction.editReply('Error al actualizar tu saldo.');
        }

        return interaction.editReply(`Reclamaste tu paga diaria de ${reward} monedas. Saldo actual: ${newBalance}.`);
    },
};