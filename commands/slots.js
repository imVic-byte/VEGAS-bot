const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { verificarEstadoMorosidad } = require('../utils/handleMorosidad');
const wait = require('node:timers/promises').setTimeout;
const supabase = require('../supabase');
const { noMoney } = require('../utils/responses');
const { getUserWithBuffs, applyBuffs, getTotalBuffValue } = require('../utils/handleUser');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Juega en la máquina tragamonedas (Slots)')
        .addIntegerOption(option =>
            option.setName('apuesta')
                .setDescription('Cantidad de monedas a apostar')
                .setRequired(true)
                .setMinValue(1)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const estadoMora = await verificarEstadoMorosidad(interaction.user.id);
        if (estadoMora.bloqueado) {
            return interaction.editReply(`🚫 **Acceso Denegado**\nNo puedes apostar en el casino porque el banco te ha embargado por morosidad.\nTienes una deuda vencida de **${estadoMora.deuda}** monedas. Usa \`/prestamo pagar\` para regularizar tu situación.`);
        }

        const discordId = interaction.user.id;
        const apuesta = interaction.options.getInteger('apuesta');

        const userData = await getUserWithBuffs(discordId);
        if (!userData || !userData.profile) {
            return interaction.editReply('❌ No tienes una cuenta registrada. Usa `/daily` primero.');
        }

        const user = userData.profile;
        if (Number(user.balance) < apuesta) {
            return interaction.editReply(noMoney(user.balance));
        }

        // Deducción preventiva
        const balanceDespuesApuesta = Number(user.balance) - apuesta;
        const { error: deductError } = await supabase
            .from('perfiles_economia')
            .update({ balance: balanceDespuesApuesta })
            .eq('discord_id', discordId);

        if (deductError) {
            console.error('Error deduct slots:', deductError);
            return interaction.editReply('❌ Hubo un error procesando tu apuesta.');
        }

        // Embed Animación de Carga
        const loadingEmbed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle('🎰 Tragamonedas en Curso...')
            .setDescription(`Apostaste **${apuesta}** monedas.\n\n| 🔄 | 🔄 | 🔄 |\n| 🔄 | 🔄 | 🔄 |\n| 🔄 | 🔄 | 🔄 |`);

        if (userData.activePet) {
            loadingEmbed.setFooter({ text: `🐾 Acompañado por: ${userData.activePet.title}` });
        }

        await interaction.editReply({ embeds: [loadingEmbed] });

        // Cálculo Matemático
        const suerteBuff = getTotalBuffValue(userData.buffs, 'suerte');
        const weightD = 5 + suerteBuff; // Leyenda más fácil
        const weightX = Math.max(0, 15 - suerteBuff); // Menos basura

        const options = [
            { id: 'A', emoji: '🤡', mult: 1.5, weight: 40 },
            { id: 'B', emoji: '🤖', mult: 5, weight: 25 },
            { id: 'C', emoji: '🤑', mult: 15, weight: 15 },
            { id: 'D', emoji: '💎', mult: 50, weight: weightD },
            { id: 'X', emoji: '❌', mult: 0, weight: weightX }
        ];

        function getRandomSymbol() {
            const totalWeight = options.reduce((sum, item) => sum + item.weight, 0);
            let randomNum = Math.random() * totalWeight;
            for (const option of options) {
                if (randomNum < option.weight) return option;
                randomNum -= option.weight;
            }
            return options[options.length - 1];
        }

        const grid = [];
        for (let i = 0; i < 9; i++) {
            grid.push(getRandomSymbol());
        }

        // Evaluar Líneas
        const lines = [
            [0, 1, 2], // Fila 1
            [3, 4, 5], // Fila 2
            [6, 7, 8], // Fila 3
            [0, 4, 8], // Diagonal 1
            [2, 4, 6]  // Diagonal 2
        ];

        let totalMultiplier = 0;
        let linesWon = 0;

        for (const line of lines) {
            const [p1, p2, p3] = line;
            const s1 = grid[p1];
            const s2 = grid[p2];
            const s3 = grid[p3];

            // X nunca forma línea ganadora
            if (s1.id !== 'X' && s1.id === s2.id && s2.id === s3.id) {
                totalMultiplier += s1.mult;
                linesWon++;
            }
        }

        const gridText = 
            `| ${grid[0].emoji} | ${grid[1].emoji} | ${grid[2].emoji} |\n` +
            `| ${grid[3].emoji} | ${grid[4].emoji} | ${grid[5].emoji} |\n` +
            `| ${grid[6].emoji} | ${grid[7].emoji} | ${grid[8].emoji} |`;

        // Pausa de 1.5s real
        await wait(1500);

        // Resolución Final
        const resultEmbed = new EmbedBuilder().setTitle('🎰 Resultados Tragamonedas');
        if (userData.activePet) {
            resultEmbed.setFooter({ text: `🐾 Acompañado por: ${userData.activePet.title}` });
        }

        if (linesWon > 0) {
            const gananciaBruta = Math.floor(apuesta * totalMultiplier);
            const gananciaReal = applyBuffs(gananciaBruta, userData.buffs, 'coins');
            const nuevoBalance = balanceDespuesApuesta + gananciaReal;

            await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoBalance })
                .eq('discord_id', discordId);

            const coinsBuff = getTotalBuffValue(userData.buffs, 'coins');
            
            resultEmbed.setColor(0x57F287)
                .setDescription(`${gridText}\n\n✅ **¡GANASTE!** Encontraste ${linesWon} línea(s) ganadora(s).\nMultiplicador acumulado: **x${totalMultiplier.toFixed(2)}**\nPremio total: **${gananciaReal}** monedas${coinsBuff > 0 ? ' (buffos aplicados)' : ''}.\n\nTu saldo actual: ${nuevoBalance.toLocaleString()}`);
        } else {
            let retenido = 0;
            const coinsBuff = getTotalBuffValue(userData.buffs, 'coins');
            if (coinsBuff > 0) {
                const retencion = Math.min(coinsBuff, 100);
                const perdidaReal = Math.floor(apuesta * (1 - (retencion / 100)));
                retenido = apuesta - perdidaReal;
            }

            const nuevoBalance = balanceDespuesApuesta + retenido;
            if (retenido > 0) {
                await supabase
                    .from('perfiles_economia')
                    .update({ balance: nuevoBalance })
                    .eq('discord_id', discordId);
            }

            const { procesarSeguro } = require('../utils/handleSeguro');
            const { tituloDerrota, descripcionDerrota } = await procesarSeguro(discordId, apuesta);

            resultEmbed.setColor(0xED4245)
                .setTitle(tituloDerrota)
                .setDescription(`${gridText}\n\n${descripcionDerrota}`);
        }

        await interaction.editReply({ embeds: [resultEmbed] });
    }
};
