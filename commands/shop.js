const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Comando base de la tienda del servidor')
        .addSubcommand(subcommand =>
            subcommand
                .setName('items')
                .setDescription('Procesa la compra de objetos dinamicos del catalogo')
                .addStringOption(option =>
                    option.setName('articulo')
                        .setDescription('ID del articulo a comprar')
                        .setRequired(true)
                )
        ),
    async execute(interaction) {
        await interaction.deferReply();
        const subcomando = interaction.options.getSubcommand();

        if (subcomando === 'items') {
            const articuloId = interaction.options.getString('articulo');
            const discordId = interaction.user.id;

            const { data: itemData, error: itemError } = await supabase
                .from('tienda_items')
                .select('*')
                .eq('id', articuloId)
                .single();

            if (itemError || !itemData) {
                return interaction.editReply('El articulo ingresado no existe en el catalogo.');
            }

            const precioBase = Number(itemData.precio_base);
            const impuesto = Math.floor(precioBase * 0.10);
            const costoTotal = precioBase + impuesto;

            const { data: user, error: userError } = await supabase
                .from('perfiles_economia')
                .select('balance')
                .eq('discord_id', discordId)
                .single();

            if (userError || !user) {
                return interaction.editReply('No tienes una cuenta de economia activa.');
            }

            const balanceActual = Number(user.balance);

            if (balanceActual < costoTotal) {
                return interaction.editReply('Fondos insuficientes para realizar esta compra.');
            }

            let expiraEl = null;
            if (itemData.duracion_minutos && itemData.duracion_minutos > 0) {
                const milisegundos = itemData.duracion_minutos * 60000;
                expiraEl = new Date(Date.now() + milisegundos).toISOString();
            }

            const usosRestantes = itemData.usos_iniciales;
            const nuevoBalance = balanceActual - costoTotal;

            const { error: updateError } = await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoBalance })
                .eq('discord_id', discordId);

            if (updateError) {
                return interaction.editReply('Error procesando el descuento en tu cuenta.');
            }

            const { error: insertError } = await supabase
                .from('inventario_items')
                .insert({
                    discord_id: discordId,
                    item_id: itemData.id,
                    usos_restantes: usosRestantes,
                    expira_el: expiraEl
                });

            if (insertError) {
                return interaction.editReply('Error registrando el articulo en tu inventario.');
            }

            const embed = new EmbedBuilder()
                .setTitle('Compra Completada Exitosamente')
                .setColor(0x00FF00)
                .setDescription(`Has adquirido: ${itemData.nombre}`)
                .addFields(
                    { name: 'Precio Base', value: `${precioBase} monedas`, inline: true },
                    { name: 'Impuesto IVA 10%', value: `${impuesto} monedas`, inline: true },
                    { name: 'Saldo Restante', value: `${nuevoBalance} monedas`, inline: false }
                );

            return interaction.editReply({ embeds: [embed] });
        }
    }
};