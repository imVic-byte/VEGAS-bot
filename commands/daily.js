const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Reclama tus monedas diarias en VEGAS'),
    
    async execute(interaction) {
        await interaction.deferReply();

        const discordId = interaction.user.id;
        const serverId = interaction.guildId;
        const reward = 1000;

        if (!serverId) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Este comando solo se puede usar dentro de un servidor.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        const { data: user, error: selectError } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', discordId)
            .eq('server_id', serverId)
            .single();

        if (selectError && selectError.code !== 'PGRST116') {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Error al contactar con la base de datos.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        if (!user) {
            const { error: insertError } = await supabase
                .from('perfiles_economia')
                .insert([{
                    discord_id: discordId,
                    server_id: serverId,
                    balance: reward,
                    ultima_recompensa: new Date().toISOString()
                }]);

            if (insertError) {
                console.error(insertError);
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ Error al crear tu perfil.');
                return interaction.editReply({ embeds: [errEmbed] });
            }
            
            const welcomeEmbed = new EmbedBuilder()
                .setColor('Green')
                .setTitle('🎉 ¡Bienvenido a VEGAS!')
                .setDescription(`Recibiste **${reward}** monedas para empezar. ¡Es momento de apostar!`);
            return interaction.editReply({ embeds: [welcomeEmbed] });
        }

        const lastReward = new Date(user.ultima_recompensa);
        const now = new Date();
        const diffInMs = now - lastReward;
        const msIn24Hours = 24 * 60 * 60 * 1000;

        if (diffInMs < msIn24Hours) {
            const timeLeftMs = msIn24Hours - diffInMs;
            const hoursLeft = Math.floor(timeLeftMs / (1000 * 60 * 60));
            const minutesLeft = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));
            
            const cooldownEmbed = new EmbedBuilder()
                .setColor('Gold')
                .setTitle('⏳ Recompensa Diaria no Disponible')
                .setDescription(`Vuelve en **${hoursLeft} horas** y **${minutesLeft} minutos** para tu siguiente recompensa.`);
            return interaction.editReply({ embeds: [cooldownEmbed] });
        }

        const deudaTotal = Number(user.deuda_prestamo) || 0;
        let nuevaDeuda = deudaTotal;
        let nuevoBalance = Number(user.balance);
        let montoEmbargo = 0;
        let recompensaNeta = reward;
        let fueEmbargado = false;
        let nuevoVencimiento = user.vencimiento_prestamo;

        const isVencido = user.vencimiento_prestamo ? new Date(user.vencimiento_prestamo) <= now : false;

        if (deudaTotal > 0 && isVencido) {
            fueEmbargado = true;
            // Cálculo del embargo del 90%
            montoEmbargo = Math.floor(reward * 0.90);

            // Ajuste si el embargo supera lo que debe
            if (montoEmbargo >= deudaTotal) {
                montoEmbargo = deudaTotal;
            }

            nuevaDeuda = deudaTotal - montoEmbargo;
            recompensaNeta = reward - montoEmbargo;
            
            if (nuevaDeuda === 0) {
                nuevoVencimiento = null;
            }
        }

        nuevoBalance += recompensaNeta;

        const { error: updateError } = await supabase
            .from('perfiles_economia')
            .update({ 
                balance: nuevoBalance, 
                deuda_prestamo: nuevaDeuda,
                vencimiento_prestamo: nuevoVencimiento,
                ultima_recompensa: now.toISOString() 
            })
            .eq('discord_id', discordId)
            .eq('server_id', serverId);

        if (updateError) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Error al actualizar tu saldo en la base de datos.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        const embed = new EmbedBuilder()
            .setTitle('🎁 Recompensa Diaria')
            .setColor(fueEmbargado ? 'Orange' : 'Green')
            .addFields(
                { name: 'Recompensa Base', value: `${reward} monedas`, inline: true }
            );

        if (fueEmbargado) {
            embed.setDescription(`**Mensaje de El Fisco:**\n\nagradecemos tu contribución forzosa del 90% para el fondo de estabilización de deudas. El 10% restante ha sido liberado en tu billetera con el único propósito de guardarlo y no hacer nada. Míralo bien, porque es lo único que verás hasta que saldes tu morosidad.`);
            embed.addFields(
                { name: 'Monto Embargado', value: `-${montoEmbargo} monedas`, inline: true },
                { name: 'Deuda Restante', value: `${nuevaDeuda} monedas`, inline: true }
            );
        } else {
            embed.setDescription(`¡Has reclamado tu recompensa diaria exitosamente!`);
        }

        embed.addFields(
            { name: 'Ingreso Neto', value: `+${recompensaNeta} monedas`, inline: false },
            { name: 'Billetera Actual', value: `${nuevoBalance} monedas`, inline: false }
        );

        return interaction.editReply({ embeds: [embed] });
    }
};