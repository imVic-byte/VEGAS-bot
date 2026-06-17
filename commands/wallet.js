const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wallet')
        .setDescription('Revisa el estado general de tus finanzas y monedas'),
    async execute(interaction) {
        await interaction.deferReply();
        
        const discordId = interaction.user.id;

        const { data: user, error } = await supabase
            .from('perfiles_economia')
            .select('balance, balance_boveda, deuda_prestamo')
            .eq('discord_id', discordId)
            .single();

        if (error || !user) {
            return interaction.editReply('❌ Aún no tienes una cuenta registrada. Usa `/daily` para recibir tus primeras monedas.');
        }

        const balanceLiquido = Number(user.balance) || 0;
        const balanceBoveda = Number(user.balance_boveda) || 0;
        const deudaPrestamo = Number(user.deuda_prestamo) || 0;

        const embedWallet = new EmbedBuilder()
            .setTitle('💳 Resumen Financiero')
            .setColor('Green')
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setDescription(`Estado de cuenta de <@${discordId}>`)
            .addFields(
                { name: '💵 Billetera Líquida', value: `**${balanceLiquido}** monedas\n*(Listas para apostar)*`, inline: true },
                { name: '🔐 Bóveda Protegida', value: `**${balanceBoveda}** monedas\n*(A salvo de robos)*`, inline: true }
            );

        if (deudaPrestamo > 0) {
            embedWallet.addFields({ name: '🧾 Deuda Activa (Préstamo)', value: `**-${deudaPrestamo}** monedas\n*(Recuerda pagar a tiempo)*`, inline: false });
            embedWallet.setColor('Orange'); // Cambiar color a alerta si tiene deuda
        }

        return interaction.editReply({ embeds: [embedWallet] });
    },
};