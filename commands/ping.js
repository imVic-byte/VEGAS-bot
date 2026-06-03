const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Responde con la latencia del bot'),
    async execute(interaction) {
        await interaction.reply('Pong');
    },
};