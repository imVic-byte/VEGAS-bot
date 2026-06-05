const { SlashCommandBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Envía monedas a otro usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario que recibirá las monedas')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('cantidad')
                .setDescription('Cantidad de monedas a enviar')
                .setRequired(true)
                .setMinValue(1)),

    async execute(interaction) {
        await interaction.deferReply();

        const emisorId = interaction.user.id;
        const receptor = interaction.options.getUser('usuario');
        const cantidad = interaction.options.getInteger('cantidad');

        if (receptor.id === emisorId) {
            return interaction.editReply('No puedes enviarte monedas a ti mismo.');
        }

        // Buscar emisor
        const { data: emisor, error: emisorError } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', emisorId)
            .single();

        if (emisorError || !emisor) {
            return interaction.editReply('No tienes una cuenta económica. Usa /daily primero.');
        }

        if (Number(emisor.balance) < cantidad) {
            return interaction.editReply(
                `No tienes suficientes monedas. Saldo actual: ${emisor.balance}`
            );
        }

        // Buscar receptor
        let { data: receptorData } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', receptor.id)
            .single();

        // Si no existe, crear cuenta automáticamente
        if (!receptorData) {
            const { error: insertError } = await supabase
                .from('perfiles_economia')
                .insert([{
                    discord_id: receptor.id,
                    balance: 0,
                    ultima_recompensa: new Date().toISOString()
                }]);

            if (insertError) {
                console.error(insertError);
                return interaction.editReply('Error al crear la cuenta del destinatario.');
            }

            const { data: nuevoReceptor } = await supabase
                .from('perfiles_economia')
                .select('*')
                .eq('discord_id', receptor.id)
                .single();

            receptorData = nuevoReceptor;
        }

        const nuevoSaldoEmisor = Number(emisor.balance) - cantidad;
        const nuevoSaldoReceptor = Number(receptorData.balance) + cantidad;

        // Actualizar emisor
        const { error: updateEmisorError } = await supabase
            .from('perfiles_economia')
            .update({ balance: nuevoSaldoEmisor })
            .eq('discord_id', emisorId);

        if (updateEmisorError) {
            console.error(updateEmisorError);
            return interaction.editReply('Error al descontar monedas.');
        }

        // Actualizar receptor
        const { error: updateReceptorError } = await supabase
            .from('perfiles_economia')
            .update({ balance: nuevoSaldoReceptor })
            .eq('discord_id', receptor.id);

        if (updateReceptorError) {
            console.error(updateReceptorError);
            return interaction.editReply('Error al entregar las monedas.');
        }

        return interaction.editReply(
            `💸 Has lavado **${cantidad}** monedas a **${receptor.username}**.\n\n` +
            `Tu nuevo saldo es: **${nuevoSaldoEmisor}** monedas.`
        );
    },
};