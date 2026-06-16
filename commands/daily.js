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

        const { data: user, error: selectError } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', discordId)
            .single();

        if (selectError && selectError.code !== 'PGRST116') {
            return interaction.editReply('Error al contactar con la base de datos.');
        }

        if (!user) {
            const { error: insertError } = await supabase
                .from('perfiles_economia')
                .insert([{
                    discord_id: discordId,
                    balance: reward,
                    ultima_recompensa: new Date().toISOString()
                }]);

            if (insertError) {
                return interaction.editReply('Error al crear tu perfil.');
            }
            
            return interaction.editReply(`Bienvenido a VEGAS. Recibiste ${reward} monedas para empezar. Es momento de apostar !!.`);
        }

        const lastReward = new Date(user.ultima_recompensa);
        const now = new Date();
        const diffInMs = now - lastReward;
        const msIn24Hours = 24 * 60 * 60 * 1000;

        if (diffInMs < msIn24Hours) {
            const timeLeftMs = msIn24Hours - diffInMs;
            const hoursLeft = Math.floor(timeLeftMs / (1000 * 60 * 60));
            const minutesLeft = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));
            
            return interaction.editReply(`Vuelve en ${hoursLeft} horas y ${minutesLeft} minutos para tu siguiente recompensa.`);
        }

        const newBalance = Number(user.balance) + reward;

        const { error: updateError } = await supabase
            .from('perfiles_economia')
            .update({ 
                balance: newBalance, 
                ultima_recompensa: new Date().toISOString() 
            })
            .eq('discord_id', discordId);

        if (updateError) {
            return interaction.editReply('Error al actualizar tu saldo.');
        }

        return interaction.editReply(`Reclamaste tu paga diaria de ${reward} monedas. Saldo actual: ${newBalance}.`);
    }
};