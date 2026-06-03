const { SlashCommandBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lucky')
        .setDescription('Apuesta tus monedas lanzando una al aire')
        .addStringOption(option =>
            option.setName('cara_o_sello')
                .setDescription('Elige tu lado de la moneda')
                .setRequired(true)
                .addChoices(
                    { name: 'Cara', value: 'cara' },
                    { name: 'Sello', value: 'sello' }
                ))
        .addIntegerOption(option =>
            option.setName('apuesta')
                .setDescription('Cantidad de monedas a apostar')
                .setRequired(true)
                .setMinValue(1)),
    async execute(interaction) {
        await interaction.deferReply();

        const eleccion = interaction.options.getString('cara_o_sello');
        const apuesta = interaction.options.getInteger('apuesta');
        const discordId = interaction.user.id;

        const { data: user, error: selectError } = await supabase
            .from('perfiles_economia')
            .select('balance')
            .eq('discord_id', discordId)
            .single();

        if (selectError || !user) {
            return interaction.editReply('No tienes una cuenta registrada. Usa /daily primero.');
        }

        if (user.balance < apuesta) {
            return interaction.editReply(`Saldo insuficiente. Actualmente tienes ${user.balance} monedas.`);
        }

        const resultado = Math.random() < 0.5 ? 'cara' : 'sello';
        const gano = eleccion === resultado;

        const nuevoBalance = gano ? Number(user.balance) + apuesta : Number(user.balance) - apuesta;

        const { error: updateError } = await supabase
            .from('perfiles_economia')
            .update({ balance: nuevoBalance })
            .eq('discord_id', discordId);

        if (updateError) {
            console.error(updateError);
            return interaction.editReply('Error al contactar con la base de datos para actualizar tu saldo.');
        }

        if (gano) {
            return interaction.editReply(`¡Salió **${resultado}**! Ganaste **${apuesta}** monedas. Saldo actual: $**${nuevoBalance}**.`);
        } else {
            return interaction.editReply(`¡Salió **${resultado}**! Perdiste **${apuesta}** monedas. Saldo actual: $**${nuevoBalance}**.`);
        }
    }
};