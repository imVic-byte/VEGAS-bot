const supabase = require('../supabase');
const { getMascotaById } = require('./handleMascotas');
const { getRoleById } = require('./handleRoles');
const { getTitleById } = require('./handleTitulos');

/**
 * Procesa la compra de un artículo tras hacer clic en un botón.
 * @param {Object} interaction - El objeto de interacción del botón.
 * @param {String} itemType - Tipo del artículo ('mascota', 'rol', 'titulo').
 * @param {Number} itemId - ID del artículo.
 */
async function procesarCompra(interaction, itemType, itemId) {
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

        // Lógica especial para bóvedas
        if (itemType === 'boveda') {
            const { data: bovedaData, error: bovedaError } = await supabase
                .from('tienda_bovedas')
                .select('*')
                .eq('id', itemId)
                .single();

            if (bovedaError || !bovedaData) {
                return interaction.reply({ content: '❌ Esa mejora de bóveda no existe en el catálogo.', ephemeral: true });
            }

            const nivelActual = usuario.boveda_nivel_id || 0;
            if (bovedaData.nivel_requerido !== nivelActual) {
                return interaction.reply({ content: `❌ Progresión inválida. Para adquirir esta mejora debes tener activo el Nivel de Bóveda previo: **Nivel ${bovedaData.nivel_requerido}**.`, ephemeral: true });
            }

            const impuesto = Math.floor(bovedaData.precio * 0.10);
            const precioTotal = bovedaData.precio + impuesto;

            if (usuario.balance < precioTotal) {
                return interaction.reply({ content: `❌ Fondos insuficientes. El precio total (incluyendo 10% de IVA) es de **${precioTotal}** monedas.`, ephemeral: true });
            }

            const nuevoBalance = usuario.balance - precioTotal;

            // Actualizar perfiles_economia
            await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoBalance, boveda_nivel_id: bovedaData.id })
                .eq('discord_id', discordId);

            // Insertar inventario_bovedas
            await supabase
                .from('inventario_bovedas')
                .insert({ discord_id: discordId, boveda_id: bovedaData.id });

            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle('🏦 Mejora de Bóveda Adquirida')
                .setColor('Green')
                .setDescription(`Has actualizado exitosamente tu sistema de almacenamiento seguro.`)
                .addFields(
                    { name: 'Mejora Activada', value: bovedaData.nombre, inline: false },
                    { name: 'Precio Base', value: `${bovedaData.precio} monedas`, inline: true },
                    { name: 'IVA (10%)', value: `${impuesto} monedas`, inline: true },
                    { name: 'Total Pagado', value: `${precioTotal} monedas`, inline: true },
                    { name: 'Nueva Capacidad Máxima', value: `${bovedaData.capacidad_maxima} monedas`, inline: false }
                );

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Buscar item dependiendo del tipo
        let item = null;
        let itemName = '';
        
        let inventoryTableName = '';
        let inventoryColumnName = '';
        
        if (itemType === 'mascota') {
            item = await getMascotaById(itemId);
            if (item) itemName = item.title;
            inventoryTableName = 'inventario_mascotas';
            inventoryColumnName = 'mascota_id';
        } else if (itemType === 'rol') {
            item = await getRoleById(itemId);
            if (item) itemName = item.title;
            inventoryTableName = 'inventario_roles';
            inventoryColumnName = 'role_id';
        } else if (itemType === 'titulo') {
            item = await getTitleById(itemId);
            if (item) itemName = item.name;
            inventoryTableName = 'inventario_titulos';
            inventoryColumnName = 'titulo_id';
        }

        if (!item) {
            return interaction.reply({
                content: '❌ Ese artículo no existe.',
                ephemeral: true
            });
        }

        // Verificar si el usuario ya tiene el artículo
        const { data: existingItem } = await supabase
            .from(inventoryTableName)
            .select('*')
            .eq('discord_id', discordId)
            .eq(inventoryColumnName, item.id)
            .limit(1);

        if (existingItem && existingItem.length > 0) {
            return interaction.reply({
                content: `❌ Ya posees el artículo **${itemName}** en tu inventario.`,
                ephemeral: true
            });
        }

        // Verificar saldo e impuestos
        const impuesto = Math.floor(item.price * 0.10);
        const precioTotal = item.price + impuesto;

        if (usuario.balance < precioTotal) {
            return interaction.reply({
                content:
                    `❌ No tienes suficientes monedas.\n\n` +
                    `💰 Saldo: ${usuario.balance}\n` +
                    `🛒 Precio + IVA (10%): ${precioTotal}`,
                ephemeral: true
            });
        }

        // Restar monedas
        const nuevoBalance = usuario.balance - precioTotal;
        const { error: balanceError } = await supabase
            .from('perfiles_economia')
            .update({ balance: nuevoBalance })
            .eq('discord_id', discordId);

        if (balanceError) throw balanceError;

        // Agregar al inventario correspondiente
        let inventoryData = { discord_id: discordId };
        inventoryData[inventoryColumnName] = item.id;

        const { error: inventoryError } = await supabase
            .from(inventoryTableName)
            .insert(inventoryData);

        if (inventoryError) throw inventoryError;

        // Registrar transacción
        await supabase
            .from('transacciones')
            .insert({
                discord_id: discordId,
                cantidad: -precioTotal,
                tipo: 'compra',
                descripcion: `${itemType}: ${itemName} (incl. IVA)`
            });

        // Lógica específica para asignar roles en Discord
        if (itemType === 'rol' && item.discord_role_id) {
            try {
                const member = await interaction.guild.members.fetch(discordId);
                await member.roles.add(item.discord_role_id);
            } catch (roleError) {
                console.error('Error al asignar rol:', roleError);
            }
        }

        await interaction.reply({
            content:
                `✅ Compra realizada con éxito\n\n` +
                `🛒 Artículo: **${itemName}** (${itemType})\n` +
                `💰 Precio Base: **${item.price}**\n` +
                `🏛️ Impuesto IVA (10%): **${impuesto}**\n` +
                `🏦 Nuevo saldo: **${nuevoBalance}**`,
            ephemeral: true
        });

    } catch (err) {
        console.error(err);
        await interaction.reply({
            content: '❌ Ocurrió un error al procesar la compra.',
            ephemeral: true
        });
    }
}

module.exports = {
    procesarCompra
};
