const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} = require('discord.js');

const blackjackGames = require('../blackjackGames');
const supabase = require('../supabase');

function crearMazo() {
    const palos = ['♠️', '♥️', '♦️', '♣️'];
    const valores = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const mazo = [];

    for (const palo of palos) {
        for (const valor of valores) {
            mazo.push({
                carta: `${valor}${palo}`,
                valor
            });
        }
    }

    return mazo.sort(() => Math.random() - 0.5);
}

function calcularTotal(cartas) {
    let total = 0;
    let ases = 0;

    for (const carta of cartas) {
        if (['J', 'Q', 'K'].includes(carta.valor)) {
            total += 10;
        } else if (carta.valor === 'A') {
            total += 11;
            ases++;
        } else {
            total += parseInt(carta.valor);
        }
    }

    while (total > 21 && ases > 0) {
        total -= 10;
        ases--;
    }

    return total;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Juega una partida de Blackjack')
        .addIntegerOption(option =>
            option.setName('apuesta')
                .setDescription('Cantidad a apostar')
                .setRequired(true)
                .setMinValue(1)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const apuesta = interaction.options.getInteger('apuesta');
        const userId = interaction.user.id;

        const { data: user } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', userId)
            .single();

        if (!user) {
            return interaction.editReply('❌ No tienes una cuenta. Usa /daily primero.');
        }

        if (user.balance < apuesta) {
            return interaction.editReply(`❌ ALTO AHÍ!! No tienes suficientes monedas. Saldo actual: ${user.balance}`);
        }

        if (blackjackGames.has(userId)) {
            return interaction.editReply('❌ ALTO AHÍ!! Ya tienes una partida activa.');
        }

        const mazo = crearMazo();
        const jugador = [mazo.pop(), mazo.pop()];
        const dealer = [mazo.pop(), mazo.pop()];

        blackjackGames.set(userId, true);

        const botones = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`bj_hit_${userId}`)
                    .setLabel('🃏 Pedir')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`bj_stand_${userId}`)
                    .setLabel('✋ Plantarse')
                    .setStyle(ButtonStyle.Danger)
            );

        let totalJugador = calcularTotal(jugador);

        const respuesta = await interaction.editReply({
            content: `🃏 **BLACKJACK VEGAS**\n\nTus cartas:\n${jugador.map(c => c.carta).join(' ')}\nTotal: **${totalJugador}**\n\nDealer:\n${dealer[0].carta} ❓\n\n⏰ Tienes 60 segundos.`,
            components: [botones]
        });

        const collector = respuesta.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000
        });

        collector.on('collect', async i => {
            if (i.user.id !== userId) {
                return i.reply({
                    content: '🚫 Esta no es tu partida.',
                    ephemeral: true
                });
            }

            if (i.customId === `bj_hit_${userId}`) {
                jugador.push(mazo.pop());
                totalJugador = calcularTotal(jugador);

                if (totalJugador > 21) {
                    await i.deferUpdate();
                    collector.stop('busto');
                } else {
                    await i.update({
                        content: `🃏 **BLACKJACK VEGAS**\n\nTus cartas:\n${jugador.map(c => c.carta).join(' ')}\nTotal: **${totalJugador}**\n\nDealer:\n${dealer[0].carta} ❓\n\n⏰ Tienes 60 segundos.`
                    });
                }
            } else if (i.customId === `bj_stand_${userId}`) {
                await i.deferUpdate();
                collector.stop('stand');
            }
        });

        collector.on('end', async (collected, reason) => {
            blackjackGames.delete(userId);
            
            let totalDealer = calcularTotal(dealer);
            let resultadoTexto = '';
            let balanceFinal = Number(user.balance);

            if (reason === 'busto') {
                balanceFinal -= apuesta;
                resultadoTexto = `💀 Te pasaste de 21. Perdiste **${apuesta}** monedas.`;
            } else {
                while (totalDealer < 17) {
                    dealer.push(mazo.pop());
                    totalDealer = calcularTotal(dealer);
                }

                if (totalDealer > 21) {
                    balanceFinal += apuesta;
                    resultadoTexto = `🎉 El dealer se pasó de 21. Ganaste **${apuesta}** monedas.`;
                } else if (totalJugador > totalDealer) {
                    balanceFinal += apuesta;
                    resultadoTexto = `🎉 Ganaste **${apuesta}** monedas.`;
                } else if (totalDealer > totalJugador) {
                    balanceFinal -= apuesta;
                    resultadoTexto = `💀 El dealer gana. Perdiste **${apuesta}** monedas.`;
                } else {
                    resultadoTexto = `🤝 Empate. Recuperas tu apuesta.`;
                }
            }

            if (reason === 'time') {
                balanceFinal -= apuesta;
                resultadoTexto = `⏰ Tiempo agotado. Perdiste **${apuesta}** monedas por inactividad.`;
            }

            if (balanceFinal !== Number(user.balance)) {
                try {
                    await supabase
                        .from('perfiles_economia')
                        .update({ balance: balanceFinal })
                        .eq('discord_id', userId);
                } catch (error) {
                    console.error(error);
                }
            }

            const cartasJugadorStr = jugador.map(c => c.carta).join(' ');
            const cartasDealerStr = dealer.map(c => c.carta).join(' ');

            try {
                await respuesta.edit({
                    content: `🃏 **RESULTADO FINAL**\n\nTus cartas:\n${cartasJugadorStr} (Total: **${totalJugador}**)\n\nDealer:\n${cartasDealerStr} (Total: **${totalDealer}**)\n\n${resultadoTexto}\n💰 Saldo actual: **${balanceFinal}**`,
                    components: []
                });
            } catch (error) {
                console.error(error);
            }
        });
    }
};