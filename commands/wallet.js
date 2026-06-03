const { SlashCommandBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wallet')
        .setDescription('Revisa cuántas monedas tienes en el casino'),
    async execute(interaction) {
        await interaction.deferReply();
        
        const discordId = interaction.user.id;

        const { data: user, error } = await supabase
            .from('perfiles_economia')
            .select('balance')
            .eq('discord_id', discordId)
            .single();

        if (error || !user) {
            return interaction.editReply('Aún no tienes una cuenta registrada. Usa /daily para recibir tus primeras monedas.');
        }

        return interaction.editReply(`Actualmente tienes **${user.balance}** monedas listas para apostar.`);
    },
};