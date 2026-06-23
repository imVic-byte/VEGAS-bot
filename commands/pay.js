const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');
const { sumarAlFisco, obtenerTasaImpuesto } = require('../utils/handleFisco');

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
        const serverId = interaction.guildId;
        if (!serverId) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Este comando solo se puede usar dentro de un servidor.');
            return interaction.reply({ embeds: [errEmbed], ephemeral: true });
        }

        await interaction.deferReply();

        const emisorId = interaction.user.id;
        const receptor = interaction.options.getUser('usuario');
        const cantidad = interaction.options.getInteger('cantidad');

        if (receptor.id === emisorId) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ No puedes enviarte monedas a ti mismo.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        // Buscar emisor
        const { data: emisor, error: emisorError } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', emisorId)
            .eq('server_id', serverId)
            .single();

        if (emisorError || !emisor) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ No tienes una cuenta económica. Usa `/daily` primero.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        if (Number(emisor.balance) < cantidad) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription(`❌ No tienes suficientes monedas. Saldo actual: **${emisor.balance}**`);
            return interaction.editReply({ embeds: [errEmbed] });
        }

        // Buscar receptor
        let { data: receptorData } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', receptor.id)
            .eq('server_id', serverId)
            .single();

        // Si no existe, crear cuenta automáticamente
        if (!receptorData) {
            const { error: insertError } = await supabase
                .from('perfiles_economia')
                .insert([{
                    discord_id: receptor.id,
                    server_id: serverId,
                    balance: 0,
                    ultima_recompensa: new Date().toISOString()
                }]);

            if (insertError) {
                console.error(insertError);
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ Error al crear la cuenta del destinatario.');
                return interaction.editReply({ embeds: [errEmbed] });
            }

            const { data: nuevoReceptor } = await supabase
                .from('perfiles_economia')
                .select('*')
                .eq('discord_id', receptor.id)
                .eq('server_id', serverId)
                .single();

            receptorData = nuevoReceptor;
        }

        const { data: paseFiscal } = await supabase
            .from('inventario_items')
            .select('*')
            .eq('discord_id', emisorId)
            .eq('server_id', serverId)
            .eq('item_id', 3)
            .gt('usos_restantes', 0)
            .single();

        let impuesto = 0;
        let porcentajeFiscal = 0;
        const tasa = await obtenerTasaImpuesto(0.12);

        if (paseFiscal) {
            porcentajeFiscal = 0;
            const usos = paseFiscal.usos_restantes - 1;
            if (usos <= 0) {
                await supabase.from('inventario_items').delete().eq('id', paseFiscal.id);
            } else {
                await supabase.from('inventario_items').update({ usos_restantes: usos }).eq('id', paseFiscal.id);
            }
        } else {
            porcentajeFiscal = Math.round(tasa * 100);
            impuesto = Math.floor(cantidad * tasa);
        }

        const neto = cantidad - impuesto;

        const nuevoSaldoEmisor = Number(emisor.balance) - cantidad;
        const nuevoSaldoReceptor = Number(receptorData.balance) + neto;

        const { error: updateEmisorError } = await supabase
            .from('perfiles_economia')
            .update({ balance: nuevoSaldoEmisor })
            .eq('discord_id', emisorId)
            .eq('server_id', serverId);

        if (updateEmisorError) {
            console.error(updateEmisorError);
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Error al descontar monedas.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        const { error: updateReceptorError } = await supabase
            .from('perfiles_economia')
            .update({ balance: nuevoSaldoReceptor })
            .eq('discord_id', receptor.id)
            .eq('server_id', serverId);

        if (updateReceptorError) {
            console.error(updateReceptorError);
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Error al entregar las monedas.');
            return interaction.editReply({ embeds: [errEmbed] });
        } else {
            if (impuesto > 0) {
                await sumarAlFisco(impuesto);
            }
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