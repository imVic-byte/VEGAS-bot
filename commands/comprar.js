const { SlashCommandBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('comprar')
        .setDescription('Compra un artículo de la tienda')
        .addIntegerOption(option =>
            option
                .setName('id')
                .setDescription('ID del artículo')
                .setRequired(true)
        ),

    async execute(interaction) {

        const itemId = interaction.options.getInteger('id');
        const discordId = interaction.user.id;

        try {

            // Buscar usuario

            const { data: usuario, error: userError } = await supabase
                .from('perfiles_economia')
                .select('*')
                .eq('discord_id', discordId)
                .single();

            if (userError || !usuario) {

                return interaction.reply({
                    content: '❌ No tienes perfil económico.',
                    ephemeral: true
                });

            }

            // Buscar item

            const { data: item, error: itemError } = await supabase
                .from('tienda')
                .select('*')
                .eq('id', itemId)
                .single();

            if (itemError || !item) {

                return interaction.reply({
                    content: '❌ Ese artículo no existe.',
                    ephemeral: true
                });

            }

            // Verificar saldo

            if (usuario.balance < item.precio) {

                return interaction.reply({
                    content:
                        `❌ No tienes suficientes monedas.\n\n` +
                        `💰 Saldo: ${usuario.balance}\n` +
                        `🛒 Precio: ${item.precio}`,
                    ephemeral: true
                });

            }

            // Restar monedas

            const nuevoBalance = usuario.balance - item.precio;

            const { error: balanceError } = await supabase
                .from('perfiles_economia')
                .update({
                    balance: nuevoBalance
                })
                .eq('discord_id', discordId);

            if (balanceError) {
                throw balanceError;
            }

            // Agregar inventario

            const { error: inventoryError } = await supabase
                .from('inventario_usuario')
                .insert({
                    discord_id: discordId,
                    item_id: item.id
                });

            if (inventoryError) {
                throw inventoryError;
            }

            // Registrar transacción

            await supabase
                .from('transacciones')
                .insert({
                    discord_id: discordId,
                    cantidad: -item.precio,
                    tipo: 'compra',
                    descripcion: item.nombre
                });

            // Si es rol y tiene role_id

            if (item.tipo === 'role' && item.role_id) {

                try {

                    const member = await interaction.guild.members.fetch(discordId);

                    await member.roles.add(item.role_id);

                } catch (roleError) {

                    console.error('Error al asignar rol:', roleError);

                }

            }

            await interaction.reply({
                content:
                    `✅ Compra realizada\n\n` +
                    `🛒 Artículo: **${item.nombre}**\n` +
                    `💰 Precio: **${item.precio}**\n` +
                    `🏦 Nuevo saldo: **${nuevoBalance}**`
            });

        } catch (err) {

            console.error(err);

            await interaction.reply({
                content: '❌ Ocurrió un error al procesar la compra.',
                ephemeral: true
            });

        }

    }
};