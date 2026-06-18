require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot online');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('Servidor de enlace listo');
});

const { Client, Collection, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

client.once('ready', () => {
    console.log('VEGAS listo');
});

const xpCooldowns = new Map();

client.on('messageCreate', async message => {
    // Ignorar si el mensaje es de un bot o si es por mensajes directos
    if (message.author.bot || message.channel.type === 1) return;

    const discordId = message.author.id;

    // Evaluar cooldown
    if (xpCooldowns.has(discordId)) return;

    // Activar cooldown de 60 segundos
    xpCooldowns.set(discordId, true);
    setTimeout(() => {
        xpCooldowns.delete(discordId);
    }, 60000);

    // Calcular XP aleatorio (15 a 25)
    const xpRandom = Math.floor(Math.random() * (25 - 15 + 1)) + 15;

    // Procesar XP
    const { agregarXp } = require('./utils/xpManager');
    const resultado = await agregarXp(discordId, xpRandom);

    if (resultado && resultado.subioDeNivel) {
        message.channel.send(`🎉 ¡Felicidades <@${discordId}>! Tu actividad en el chat te ha otorgado la experiencia necesaria para alcanzar el **Nivel ${resultado.nuevoNivel}**.`);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        try {
            if (interaction.customId.startsWith('buy_')) {
                const parts = interaction.customId.split('_');
                const type = parts[1];
                const id = parseInt(parts[2]);
                const { procesarCompra } = require('./utils/handleCompras');
                await procesarCompra(interaction, type, id);
                return;
            }
            if (interaction.customId.startsWith('duelo_victoria_') || interaction.customId.startsWith('duelo_derrota_')) {
                const parts = interaction.customId.split('_');
                const type = parts[1];
                const uuid = parts.slice(2).join('_');
                const { procesarReporteDuelo } = require('./utils/handleDuelos');
                await procesarReporteDuelo(interaction, type, uuid);
                return;
            }
            if (interaction.customId.startsWith('shop_page_')) {
                const parts = interaction.customId.split('_');
                const category = parts[2];
                const page = parseInt(parts[3]);
                const shopCommand = interaction.client.commands.get('shop');
                if (shopCommand && shopCommand.handlePagination) {
                    await shopCommand.handlePagination(interaction, category, page);
                }
                return;
            }
        } catch (error) {
            console.error(error);
            const errorPayload = { content: 'Hubo un error al procesar el botón.', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorPayload);
            } else {
                await interaction.reply(errorPayload);
            }
        }
    }

    if (interaction.isStringSelectMenu()) {
        try {
            if (interaction.customId === 'gestionar_roles') {
                await interaction.deferUpdate();
                
                const selectedRoleIds = interaction.values;
                const discordId = interaction.user.id;
                
                const supabase = require('./supabase');
                const { data: invRoles, error } = await supabase
                    .from('inventario_roles')
                    .select('roles(discord_role_id)')
                    .eq('discord_id', discordId);
                    
                if (error || !invRoles) {
                    return interaction.followUp({ content: '❌ Hubo un error verificando tu inventario.', ephemeral: true });
                }
                
                const ownedDiscordRoleIds = invRoles
                    .map(item => item.roles?.discord_role_id)
                    .filter(id => id);
                
                const member = await interaction.guild.members.fetch(discordId);
                
                for (const roleId of ownedDiscordRoleIds) {
                    const shouldHave = selectedRoleIds.includes(roleId);
                    const currentlyHas = member.roles.cache.has(roleId);
                    
                    if (shouldHave && !currentlyHas) {
                        await member.roles.add(roleId).catch(console.error);
                    } else if (!shouldHave && currentlyHas) {
                        await member.roles.remove(roleId).catch(console.error);
                    }
                }
                
                await interaction.editReply({
                    content: '✅ ¡Tus roles han sido actualizados correctamente!',
                    embeds: [],
                    components: []
                });
                return;
            }

            if (interaction.customId === 'gestionar_mascotas') {
                await interaction.deferUpdate();
                
                const selectedIds = interaction.values;
                const discordId = interaction.user.id;
                const supabase = require('./supabase');
                
                const { error: unequipError } = await supabase
                    .from('inventario_mascotas')
                    .update({ equiped: false })
                    .eq('discord_id', discordId);
                    
                if (unequipError) {
                    console.error('Error desequipando mascotas:', unequipError);
                    return interaction.followUp({ content: '❌ Hubo un error al actualizar tus mascotas.', ephemeral: true });
                }
                
                if (selectedIds.length > 0) {
                    const { error: equipError } = await supabase
                        .from('inventario_mascotas')
                        .update({ equiped: true })
                        .eq('discord_id', discordId)
                        .eq('id', selectedIds[0]);
                        
                    if (equipError) {
                        console.error('Error equipando mascota:', equipError);
                        return interaction.followUp({ content: '❌ Hubo un error al equipar la mascota.', ephemeral: true });
                    }
                }
                
                await interaction.editReply({
                    content: '✅ ¡Tu mascota activa ha sido actualizada correctamente!',
                    embeds: [],
                    components: []
                });
                return;
            }

            if (interaction.customId === 'gestionar_titulos') {
                await interaction.deferUpdate();
                
                const selectedIds = interaction.values;
                const discordId = interaction.user.id;
                const supabase = require('./supabase');
                
                const { error: unequipError } = await supabase
                    .from('inventario_titulos')
                    .update({ equiped: false })
                    .eq('discord_id', discordId);
                    
                if (unequipError) {
                    console.error('Error desequipando títulos:', unequipError);
                    return interaction.followUp({ content: '❌ Hubo un error al actualizar tus títulos.', ephemeral: true });
                }
                
                if (selectedIds.length > 0) {
                    const { error: equipError } = await supabase
                        .from('inventario_titulos')
                        .update({ equiped: true })
                        .eq('discord_id', discordId)
                        .eq('id', selectedIds[0]);
                        
                    if (equipError) {
                        console.error('Error equipando título:', equipError);
                        return interaction.followUp({ content: '❌ Hubo un error al equipar el título.', ephemeral: true });
                    }
                }
                
                await interaction.editReply({
                    content: '✅ ¡Tu título activo ha sido actualizado correctamente!',
                    embeds: [],
                    components: []
                });
                return;
            }
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'Hubo un error al procesar el menú.', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Hubo un error al procesar el menú.', ephemeral: true });
            }
        }
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) return;

    try {
        await command.execute(interaction);

        // Procesar ganancia de XP estática por utilizar comandos de barra exitosamente (+15)
        const { agregarXp } = require('./utils/xpManager');
        const resultado = await agregarXp(interaction.user.id, 15);
        
        if (resultado && resultado.subioDeNivel) {
            // Se envía un canal limpio ya que algunos comandos utilizan reply/editReply de forma asíncrona
            await interaction.channel.send(`🎉 ¡Felicidades <@${interaction.user.id}>! Gracias al uso del casino has alcanzado el **Nivel ${resultado.nuevoNivel}** en tu perfil.`);
        }
    } catch (error) {
        console.error(error);
        const errorPayload = { content: 'Hubo un error al ejecutar este comando.', ephemeral: true };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorPayload);
        } else {
            await interaction.reply(errorPayload);
        }
    }
});

client.on('error', error => console.error('Discord Client Error:', error));
client.on('warn', warning => console.warn('Discord Client Warning:', warning));
client.on('debug', info => console.log('Discord Client Debug:', info));

client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('CRITICAL ERROR: No se pudo iniciar sesión en Discord:', error);
});