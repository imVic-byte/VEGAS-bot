const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
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
            return interaction.editReply('Usa /daily primero.');
        }

        if (user.balance < apuesta) {
            return interaction.editReply(`No tienes suficientes monedas. Saldo actual: ${user.balance}`);
        }

        if (blackjackGames.has(userId)) {
            return interaction.editReply('Ya tienes una partida activa.');
        }

        const mazo = crearMazo();

        const jugador = [
            mazo.pop(),
            mazo.pop()
        ];

        const dealer = [
            mazo.pop(),
            mazo.pop()
        ];

        blackjackGames.set(userId, {
            apuesta,
            mazo,
            jugador,
            dealer
        });

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

        const totalJugador = calcularTotal(jugador);

        const mensaje = `
🃏 **BLACKJACK VEGAS**

Tus cartas:
${jugador.map(c => c.carta).join(' ')}

Total: **${totalJugador}**

Dealer:
${dealer[0].carta} ❓

⏰ Tienes 60 segundos.
`;

        await interaction.editReply({
            content: mensaje,
            components: [botones]
        });

        setTimeout(async () => {

            if (!blackjackGames.has(userId)) return;

            const partida = blackjackGames.get(userId);

            blackjackGames.delete(userId);

            try {

                await interaction.editReply({
                    content:
`⏰ Tiempo agotado.

${interaction.user} se plantó automáticamente.

(La lógica del dealer se agregará en el siguiente paso.)`,
                    components: []
                });

            } catch {}

        }, 60000);
    }
};