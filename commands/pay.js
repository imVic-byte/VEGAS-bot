const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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

        const { data: paseFiscal } = await supabase
            .from('inventario_items')
            .select('*')
            .eq('discord_id', emisorId)
            .eq('item_id', 'pase_fiscal')
            .gt('usos_restantes', 0)
            .single();

        let impuesto = 0;
        let porcentajeFiscal = 0;

        if (paseFiscal) {
            porcentajeFiscal = 0;
            const usos = paseFiscal.usos_restantes - 1;
            if (usos <= 0) {
                await supabase.from('inventario_items').delete().eq('id', paseFiscal.id);
            } else {
                await supabase.from('inventario_items').update({ usos_restantes: usos }).eq('id', paseFiscal.id);
            }
        } else {
            porcentajeFiscal = 12;
            impuesto = Math.floor(cantidad * 0.12);
        }

        const neto = cantidad - impuesto;

        const nuevoSaldoEmisor = Number(emisor.balance) - cantidad;
        const nuevoSaldoReceptor = Number(receptorData.balance) + neto;

        const { error: updateEmisorError } = await supabase
            .from('perfiles_economia')
            .update({ balance: nuevoSaldoEmisor })
            .eq('discord_id', emisorId);

        if (updateEmisorError) {
            console.error(updateEmisorError);
            return interaction.editReply('Error al descontar monedas.');
        }

        const { error: updateReceptorError } = await supabase
            .from('perfiles_economia')
            .update({ balance: nuevoSaldoReceptor })
            .eq('discord_id', receptor.id);

        if (updateReceptorError) {
            console.error(updateReceptorError);
            return interaction.editReply('Error al entregar las monedas.');
        }

        const embedTransferencia = new EmbedBuilder()
            .setTitle('Transferencia Bancaria')
            .setColor(paseFiscal ? 0x00FFFF : 0x00FF00)
            .setDescription(`Has transferido exitosamente **${cantidad}** monedas a **${receptor.username}**.`)
            .addFields(
                { name: 'Dinero Enviado', value: `${cantidad} monedas`, inline: true },
                { name: `Impuesto Fisco (${porcentajeFiscal}%)`, value: `-${impuesto} monedas`, inline: true },
                { name: 'Destinatario Recibió (Neto)', value: `${neto} monedas`, inline: false },
                { name: 'Tu Nuevo Saldo', value: `${nuevoSaldoEmisor} monedas`, inline: false }
            );

        if (paseFiscal) {
            embedTransferencia.setFooter({ text: 'Exención de impuestos aplicada por Pase Fiscal' });
        }

        return interaction.editReply({ embeds: [embedTransferencia] });
    },
};