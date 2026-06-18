require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const blackjackGames = require('./blackjackGames');

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
function calcularTotal(cartas) {

    let total = 0;
    let ases = 0;

    for (const carta of cartas) {

        if (['J', 'Q', 'K'].includes(carta.valor)) {
            total += 10;
        }
        else if (carta.valor === 'A') {
            total += 11;
            ases++;
        }
        else {
            total += parseInt(carta.valor);
        }

    }

    while (total > 21 && ases > 0) {
        total -= 10;
        ases--;
    }

    return total;
}

client.once('clientReady', () => {
    console.log('VEGAS listo');
});

client.on('interactionCreate', async interaction => {

    // Slash Commands
    if (interaction.isChatInputCommand()) {

        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
        }
    }

    // Botones
    if (interaction.isButton()) {

        console.log('Botón:', interaction.customId);

        // =====================
        // MENDIGAR
        // =====================
        if (interaction.customId.startsWith('beg_')) {

            const supabase = require('./supabase');

            const partes = interaction.customId.split('_');

            const mendigoId = partes[1];
            const cantidad = parseInt(partes[2]);

            const donanteId = interaction.user.id;

            if (donanteId === mendigoId) {
                return interaction.reply({
                    content: 'No puedes donar a tu propia solicitud.',
                    ephemeral: true
                });
            }

            const { data: donante } = await supabase
                .from('perfiles_economia')
                .select('*')
                .eq('discord_id', donanteId)
                .single();

            if (!donante) {
                return interaction.reply({
                    content: 'No tienes una cuenta económica. Usa /daily primero.',
                    ephemeral: true
                });
            }

            if (Number(donante.balance) < cantidad) {
                return interaction.reply({
                    content: `No tienes suficientes monedas. Necesitas ${cantidad}.`,
                    ephemeral: true
                });
            }

            const { data: mendigo } = await supabase
                .from('perfiles_economia')
                .select('*')
                .eq('discord_id', mendigoId)
                .single();

            if (!mendigo) {
                return interaction.reply({
                    content: 'La solicitud ya no es válida.',
                    ephemeral: true
                });
            }

            await supabase
                .from('perfiles_economia')
                .update({
                    balance: Number(donante.balance) - cantidad
                })
                .eq('discord_id', donanteId);

            await supabase
                .from('perfiles_economia')
                .update({
                    balance: Number(mendigo.balance) + cantidad
                })
                .eq('discord_id', mendigoId);

            await interaction.reply({
                content: `💸 Has donado ${cantidad} monedas.`,
                ephemeral: true
            });

            await interaction.message.edit({
                content: `💸 <@${interaction.user.id}> donó ${cantidad} monedas a <@${mendigoId}>.`,
                components: []
            });

            return;
        }

        // =====================
        // BLACKJACK
        // =====================
        if (interaction.customId.startsWith('bj_')) {

        const supabase = require('./supabase');

        const partes = interaction.customId.split('_');

        const accion = partes[1];
        const userId = partes[2];

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: 'Esta no es tu partida.',
                ephemeral: true
            });
        }

        const partida = blackjackGames.get(userId);

        if (!partida) {
            return interaction.reply({
                content: 'La partida ya terminó.',
                ephemeral: true
            });
        }

        // ==================
        // PEDIR CARTA
        // ==================
        if (accion === 'hit') {

            const nuevaCarta = partida.mazo.pop();

            partida.jugador.push(nuevaCarta);

            const totalJugador = calcularTotal(partida.jugador);

            blackjackGames.set(userId, partida);

            // SE PASÓ
            if (totalJugador > 21) {

                const { data: user } = await supabase
                    .from('perfiles_economia')
                    .select('balance')
                    .eq('discord_id', userId)
                    .single();

                const nuevoBalance =
                    Number(user.balance) - partida.apuesta;

                await supabase
                    .from('perfiles_economia')
                    .update({
                        balance: nuevoBalance
                    })
                    .eq('discord_id', userId);

                blackjackGames.delete(userId);

                return interaction.update({
                    content:
                        `💥 TE PASASTE

                        Cartas:
                        ${partida.jugador.map(c => c.carta).join(' ')}

                        Total: ${totalJugador}

                        💀 Perdiste ${partida.apuesta} monedas.

                        💰 Saldo actual: ${nuevoBalance}`,
                    components: []
                });

            }

            return interaction.update({
                content:
                    `🃏 BLACKJACK VEGAS

                    Tus cartas:
                    ${partida.jugador.map(c => c.carta).join(' ')}

                    Total: ${totalJugador}

                    Dealer:
                    ${partida.dealer[0].carta} ❓

                    ⏰ Sigue jugando.`,
                components: interaction.message.components
            });

        }

        // ==================
        // PLANTARSE
        // ==================
        if (accion === 'stand') {

            while (calcularTotal(partida.dealer) < 17) {
                partida.dealer.push(partida.mazo.pop());
            }

            const totalJugador = calcularTotal(partida.jugador);
            const totalDealer = calcularTotal(partida.dealer);

            const { data: user } = await supabase
                .from('perfiles_economia')
                .select('balance')
                .eq('discord_id', userId)
                .single();

            let nuevoBalance = Number(user.balance);
            let resultado = '';

            // Dealer se pasa
            if (totalDealer > 21) {

                nuevoBalance += partida.apuesta;

                resultado =
                    `🎉 El dealer se pasó de 21.\nGanaste ${partida.apuesta} monedas.`;

            }

            // Jugador gana
            else if (totalJugador > totalDealer) {

                nuevoBalance += partida.apuesta;

                resultado =
                    `🎉 Ganaste ${partida.apuesta} monedas.`;

            }

            // Dealer gana
            else if (totalDealer > totalJugador) {

                nuevoBalance -= partida.apuesta;

                resultado =
                    `💀 Perdiste ${partida.apuesta} monedas.`;

            }

            // Empate
            else {

                resultado =
                    `🤝 Empate. No ganas ni pierdes monedas.`;

            }

            await supabase
                .from('perfiles_economia')
                .update({
                    balance: nuevoBalance
                })
                .eq('discord_id', userId);

            blackjackGames.delete(userId);

            return interaction.update({
                content:
                    `🃏 BLACKJACK FINAL

                    Tus cartas:
                    ${partida.jugador.map(c => c.carta).join(' ')}

                    Total: ${totalJugador}

                    Dealer:
                    ${partida.dealer.map(c => c.carta).join(' ')}

                    Total Dealer: ${totalDealer}

                    ${resultado}

                    💰 Saldo actual: ${nuevoBalance}`,
                components: []
            });

        }

    }
    }
    

});

client.on('error', error => console.error('Discord Client Error:', error));
client.on('warn', warning => console.warn('Discord Client Warning:', warning));
client.on('debug', info => console.log('Discord Client Debug:', info));

client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('CRITICAL ERROR: No se pudo iniciar sesión en Discord:', error);
});