const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('boveda')
        .setDescription('Almacena tus monedas de forma segura generando intereses y a salvo de robos')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Revisa el estado, saldo y capacidad de tu Bóveda Protegida'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('depositar')
                .setDescription('Guarda monedas en tu Bóveda')
                .addIntegerOption(option =>
                    option.setName('cantidad')
                        .setDescription('Cantidad a depositar')
                        .setRequired(true)
                        .setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('retirar')
                .setDescription('Retira monedas de tu Bóveda hacia tu billetera')
                .addIntegerOption(option =>
                    option.setName('cantidad')
                        .setDescription('Cantidad a retirar')
                        .setRequired(true)
                        .setMinValue(1))),

    async execute(interaction) {
        await interaction.deferReply();
        const subcomando = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        // Extraer datos del usuario y relacionarlo de forma anidada con tienda_bovedas
        // Esto permite leer la capacidad máxima dinámicamente desde el catálogo
        const { data: user, error: userError } = await supabase
            .from('perfiles_economia')
            .select(`
                *,
                tienda_bovedas:boveda_nivel_id (capacidad_maxima)
            `)
            .eq('discord_id', userId)
            .single();

        if (userError || !user) {
            return interaction.editReply('❌ No tienes una cuenta económica. Usa `/daily` primero para abrir una.');
        }

        const balanceBilletera = Number(user.balance) || 0;
        const balanceBoveda = Number(user.balance_boveda) || 0;
        
        // Extraer la capacidad máxima desde el objeto relacional de Supabase
        // Si no tiene bóveda, asume 10000 como capacidad de nivel base.
        let capacidadMaxima = 10000;
        if (user.tienda_bovedas) {
            if (user.tienda_bovedas.capacidad_maxima !== undefined) {
                capacidadMaxima = user.tienda_bovedas.capacidad_maxima;
            } else if (Array.isArray(user.tienda_bovedas) && user.tienda_bovedas[0]) {
                capacidadMaxima = user.tienda_bovedas[0].capacidad_maxima;
            }
        }

        if (subcomando === 'status') {
            const porcentajeLlenado = ((balanceBoveda / capacidadMaxima) * 100).toFixed(1);

            const embedStatus = new EmbedBuilder()
                .setTitle('🏦 Estado de tu Bóveda')
                .setColor('Gold')
                .setDescription('Tus fondos almacenados aquí están protegidos contra robos.')
                .addFields(
                    { name: '💵 Billetera Líquida', value: `${balanceBilletera} monedas`, inline: true },
                    { name: '🔐 Saldo en Bóveda', value: `${balanceBoveda} monedas`, inline: true },
                    { name: '📦 Almacenamiento Utilizado', value: `${balanceBoveda} de ${capacidadMaxima} monedas (${porcentajeLlenado}%)`, inline: false }
                );

            return interaction.editReply({ embeds: [embedStatus] });

        } else if (subcomando === 'depositar') {
            const cantidadADepositar = interaction.options.getInteger('cantidad');

            if (balanceBilletera < cantidadADepositar) {
                return interaction.editReply(`❌ No tienes fondos suficientes en tu billetera. Solo tienes **${balanceBilletera}** monedas disponibles.`);
            }

            const espacioDisponible = capacidadMaxima - balanceBoveda;

            if (cantidadADepositar > espacioDisponible) {
                return interaction.editReply(`❌ No hay suficiente espacio en la Bóveda. Intentas guardar **${cantidadADepositar}** monedas, pero solo queda espacio para **${espacioDisponible}** monedas (Capacidad Máxima: ${capacidadMaxima}).`);
            }

            const nuevoBalanceBilletera = balanceBilletera - cantidadADepositar;
            const nuevoBalanceBoveda = balanceBoveda + cantidadADepositar;

            // Actualización atómica en la misma fila de base de datos
            const { error: updateError } = await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoBalanceBilletera, balance_boveda: nuevoBalanceBoveda })
                .eq('discord_id', userId);

            if (updateError) {
                console.error(updateError);
                return interaction.editReply('❌ Ocurrió un error al procesar el depósito en la base de datos.');
            }

            const embedDepositar = new EmbedBuilder()
                .setTitle('📥 Depósito Exitoso')
                .setColor('Green')
                .setDescription(`Has depositado de forma segura **${cantidadADepositar}** monedas en tu bóveda.`)
                .addFields(
                    { name: 'Billetera Actual', value: `${nuevoBalanceBilletera} monedas`, inline: true },
                    { name: 'Bóveda Actual', value: `${nuevoBalanceBoveda} / ${capacidadMaxima} monedas`, inline: true }
                );

            return interaction.editReply({ embeds: [embedDepositar] });

        } else if (subcomando === 'retirar') {
            const cantidadARetirar = interaction.options.getInteger('cantidad');

            if (balanceBoveda < cantidadARetirar) {
                return interaction.editReply(`❌ No tienes suficientes fondos guardados en la bóveda. Saldo actual protegido: **${balanceBoveda}** monedas.`);
            }

            const nuevoBalanceBilletera = balanceBilletera + cantidadARetirar;
            const nuevoBalanceBoveda = balanceBoveda - cantidadARetirar;

            // Actualización atómica en la misma fila
            const { error: updateError } = await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoBalanceBilletera, balance_boveda: nuevoBalanceBoveda })
                .eq('discord_id', userId);

            if (updateError) {
                console.error(updateError);
                return interaction.editReply('❌ Ocurrió un error al procesar el retiro en la base de datos.');
            }

            const embedRetirar = new EmbedBuilder()
                .setTitle('📤 Retiro Exitoso')
                .setColor('Blue')
                .setDescription(`Has retirado **${cantidadARetirar}** monedas hacia tu billetera desprotegida.`)
                .addFields(
                    { name: 'Billetera Actual', value: `${nuevoBalanceBilletera} monedas`, inline: true },
                    { name: 'Bóveda Actual', value: `${nuevoBalanceBoveda} / ${capacidadMaxima} monedas`, inline: true }
                );

            return interaction.editReply({ embeds: [embedRetirar] });
        }
    }
};
