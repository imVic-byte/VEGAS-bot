const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder
} = require('discord.js');
const { verificarEstadoMorosidad } = require('../utils/handleMorosidad');

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

        const serverId = interaction.guildId;
        if (!serverId) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ Este comando solo se puede usar dentro de un servidor.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        const estadoMora = await verificarEstadoMorosidad(interaction.user.id, serverId);
        if (estadoMora.bloqueado) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('🚫 Acceso Denegado')
                .setDescription(`No puedes apostar en el casino porque el banco te ha embargado por morosidad.\nTienes una deuda vencida de **${estadoMora.deuda}** monedas. Usa \`/prestamo pagar\` para regularizar tu situación.`);
            return interaction.editReply({ embeds: [errEmbed] });
        }

        const apuesta = interaction.options.getInteger('apuesta');
        const userId = interaction.user.id;

        const { data: user } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', userId)
            .eq('server_id', serverId)
            .single();

        if (!user) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ No tienes una cuenta. Usa `/daily` primero.');
            return interaction.editReply({ embeds: [errEmbed] });
        }

        if (user.balance < apuesta) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription(`❌ ¡ALTO AHÍ! No tienes suficientes monedas. Saldo actual: **${user.balance}**`);
            return interaction.editReply({ embeds: [errEmbed] });
        }

        if (blackjackGames.has(userId)) {
            const errEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ ¡ALTO AHÍ! Ya tienes una partida activa.');
            return interaction.editReply({ embeds: [errEmbed] });
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

        const crearGameEmbed = () => {
            return new EmbedBuilder()
                .setTitle('🃏 BLACKJACK VEGAS')
                .setColor('Blue')
                .setDescription(`Tus cartas:\n${jugador.map(c => c.carta).join(' ')}\nTotal: **${totalJugador}**\n\nDealer:\n${dealer[0].carta} ❓\n\n⏰ Tienes 60 segundos.`);
        };

        const respuesta = await interaction.editReply({
            embeds: [crearGameEmbed()],
            components: [botones]
        });

        const collector = respuesta.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000
        });

        collector.on('collect', async i => {
            if (i.user.id !== userId) {
                const errEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('🚫 Esta no es tu partida.');
                return i.reply({
                    embeds: [errEmbed],
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
                        embeds: [crearGameEmbed()]
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
                        .eq('discord_id', userId)
                        .eq('server_id', serverId);
                } catch (error) {
                    console.error(error);
                }
            }

            if (balanceFinal < Number(user.balance)) {
                const { procesarSeguro } = require('../utils/handleSeguro');
                const resultadoSeguro = await procesarSeguro(userId, serverId, apuesta);
                
                if (resultadoSeguro.tituloDerrota === 'Derrota Asegurada') {
                    const reembolso = Math.floor(apuesta * 0.25);
                    balanceFinal += reembolso;
                    resultadoTexto += `\n\n🛡️ **${resultadoSeguro.tituloDerrota}:** ${resultadoSeguro.descripcionDerrota}`;
                }
            }

            const cartasJugadorStr = jugador.map(c => c.carta).join(' ');
            const cartasDealerStr = dealer.map(c => c.carta).join(' ');

            const netReward = balanceFinal - Number(user.balance);
            const netRewardStr = netReward > 0 ? `+${netReward}` : `${netReward}`;
            const color = netReward > 0 ? 'Green' : (netReward === 0 ? 'Blue' : 'Red');

            const embedResultado = new EmbedBuilder()
                .setTitle('🃏 Blackjack - Resultado Final')
                .setColor(color)
                .setDescription(`Tus cartas:\n${cartasJugadorStr} (Total: **${totalJugador}**)\n\nDealer:\n${cartasDealerStr} (Total: **${totalDealer}**)\n\n${resultadoTexto}`)
                .addFields(
                    { name: '👤 Jugador', value: interaction.member.displayName, inline: true },
                    { name: '💵 Apuesta', value: `${apuesta} monedas`, inline: true },
                    { name: '📈 Resultado Financiero', value: `${netRewardStr} monedas`, inline: true },
                    { name: '💰 Saldo Actual', value: `${balanceFinal} monedas`, inline: false }
                );

            try {
                await respuesta.edit({
                    content: '',
                    embeds: [embedResultado],
                    components: []
                });
            } catch (error) {
                console.error(error);
            }
        });
    }
};