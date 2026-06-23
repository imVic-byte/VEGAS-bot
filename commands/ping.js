const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Responde con la latencia del bot'),
    async execute(interaction) {
        const pingEmbed = new EmbedBuilder()
            .setColor('Blue')
            .setTitle('🏓 Pong!')
            .setDescription(`Latencia del bot: **${Date.now() - interaction.createdTimestamp}ms**`);
        await interaction.reply({ embeds: [pingEmbed] });
    },
};