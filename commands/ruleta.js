const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { verificarEstadoMorosidad } = require('../utils/handleMorosidad');
const wait = require('node:timers/promises').setTimeout;
const supabase = require('../supabase');
const { noMoney } = require('../utils/responses');
const { getUserWithBuffs, getTotalBuffValue } = require('../utils/handleUser');

const mesasActivas = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ruleta')
        .setDescription('Apuesta en la ruleta europea (Multijugador)')
        .addIntegerOption(option =>
            option.setName('apuesta')
                .setDescription('Cantidad de monedas a apostar')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption(option =>
            option.setName('tipo')
                .setDescription('Tipo de apuesta')
                .setRequired(true)
                .addChoices(
                    { name: 'Color (x2)', value: 'color' },
                    { name: 'Paridad (x2)', value: 'paridad' },
                    { name: 'Número Exacto (x36)', value: 'numero' }
                )
        )
        .addStringOption(option =>
            option.setName('valor')
                .setDescription('rojo, negro, par, impar o un número del 0 al 36')
                .setRequired(true)
        ),

    async execute(interaction) {
        // Respuesta efímera para que cada jugador apueste en privado y no llene el chat
        await interaction.deferReply({ ephemeral: true });

        const estadoMora = await verificarEstadoMorosidad(interaction.user.id);
        if (estadoMora.bloqueado) {
            return interaction.editReply(`🚫 **Acceso Denegado**\nNo puedes apostar en el casino porque el banco te ha embargado por morosidad.\nTienes una deuda vencida de **${estadoMora.deuda}** monedas. Usa \`/prestamo pagar\` para regularizar tu situación.`);
        }

        const discordId = interaction.user.id;
        const apuesta = interaction.options.getInteger('apuesta');
        const tipo = interaction.options.getString('tipo');
        let valor = interaction.options.getString('valor').toLowerCase().trim();

        // Validaciones de valor
        if (tipo === 'color' && !['rojo', 'negro'].includes(valor)) {
            return interaction.editReply('❌ Para apostar a color, escribe "rojo" o "negro".');
        }
        if (tipo === 'paridad' && !['par', 'impar'].includes(valor)) {
            return interaction.editReply('❌ Para apostar a paridad, escribe "par" o "impar".');
        }
        if (tipo === 'numero') {
            const num = parseInt(valor);
            if (isNaN(num) || num < 0 || num > 36) {
                return interaction.editReply('❌ El número debe estar entre 0 y 36.');
            }
            valor = num.toString();
        }

        const userData = await getUserWithBuffs(discordId);
        if (!userData || !userData.profile) {
            return interaction.editReply('❌ No tienes una cuenta registrada. Usa `/daily` primero.');
        }

        const user = userData.profile;
        if (Number(user.balance) < apuesta) {
            return interaction.editReply(noMoney(user.balance));
        }

        // Deducción inmediata (protege la base de datos de spam/doble gasto)
        const { error: deductError } = await supabase
            .from('perfiles_economia')
            .update({ balance: Number(user.balance) - apuesta })
            .eq('discord_id', discordId);

        if (deductError) {
            console.error('Error deduct ruleta:', deductError);
            return interaction.editReply('❌ Hubo un error procesando tu apuesta.');
        }

        const channelId = interaction.channelId;
        const coinsBuff = getTotalBuffValue(userData.buffs, 'coins');

        const playerInfo = {
            discordId: discordId,
            username: interaction.user.username,
            apuesta: apuesta,
            tipo: tipo,
            valor: valor,
            coinsBuff: coinsBuff
        };

        if (mesasActivas.has(channelId)) {
            // Unirse a mesa existente
            const mesa = mesasActivas.get(channelId);
            mesa.players.push(playerInfo);
            return interaction.editReply(`✅ Tu apuesta de **${apuesta}** a **${valor}** ha entrado en la ruleta en curso.`);
        } else {
            // Crear mesa nueva
            mesasActivas.set(channelId, { players: [playerInfo] });
            await interaction.editReply(`✅ Has iniciado la ruleta apostando **${apuesta}** a **${valor}**.`);

            const embedInicio = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('🎡 ¡La Ruleta está girando!')
                .setDescription(`**${interaction.user.username}** ha iniciado la ruleta.\n\nTodos en este canal tienen **30 segundos** para apostar usando \`/ruleta\`.\n¡Hagan sus apuestas!`)
                .setImage('https://rnhdmonauucuxpovqxun.supabase.co/storage/v1/object/public/vegas-media/ruleta-1.gif');

            const publicMessage = await interaction.channel.send({ embeds: [embedInicio] });

            await wait(30000); // 30 segundos de giro

            // Resolver juego
            const mesaFinal = mesasActivas.get(channelId);
            mesasActivas.delete(channelId); // Bloquear nuevas apuestas inmediatamente

            const numeroGanador = Math.floor(Math.random() * 37); // 0 a 36
            const rojos = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
            const colorGanador = numeroGanador === 0 ? 'verde' : (rojos.includes(numeroGanador) ? 'rojo' : 'negro');
            const paridadGanadora = numeroGanador === 0 ? 'cero' : (numeroGanador % 2 === 0 ? 'par' : 'impar');

            let ganadores = [];
            let perdedores = [];

            for (const p of mesaFinal.players) {
                let gano = false;
                let multiplicador = 0;

                if (p.tipo === 'color' && p.valor === colorGanador) {
                    gano = true;
                    multiplicador = 2;
                } else if (p.tipo === 'paridad' && p.valor === paridadGanadora) {
                    gano = true;
                    multiplicador = 2;
                } else if (p.tipo === 'numero' && p.valor === numeroGanador.toString()) {
                    gano = true;
                    multiplicador = 36;
                }

                // Obtener balance actual (en caso de que hayan ganado daily en esos 30s)
                const { data: currentProfile } = await supabase
                    .from('perfiles_economia')
                    .select('balance')
                    .eq('discord_id', p.discordId)
                    .single();
                
                const currentBalance = currentProfile ? Number(currentProfile.balance) : 0;

                if (gano) {
                    const gananciaBase = p.apuesta * multiplicador;
                    let gananciaReal = gananciaBase;
                    if (p.coinsBuff > 0) {
                        gananciaReal = Math.floor(gananciaBase * (1 + (p.coinsBuff / 100)));
                    }

                    await supabase
                        .from('perfiles_economia')
                        .update({ balance: currentBalance + gananciaReal })
                        .eq('discord_id', p.discordId);

                    ganadores.push(`**${p.username}** gana ${gananciaReal} (apostó a ${p.valor})`);
                } else {
                    let retenido = 0;
                    if (p.coinsBuff > 0) {
                        const retencion = Math.min(p.coinsBuff, 100);
                        const perdidaReal = Math.floor(p.apuesta * (1 - (retencion / 100)));
                        retenido = p.apuesta - perdidaReal;
                    }

                    if (retenido > 0) {
                        await supabase
                            .from('perfiles_economia')
                            .update({ balance: currentBalance + retenido })
                            .eq('discord_id', p.discordId);
                    }

                    const { procesarSeguro } = require('../utils/handleSeguro');
                    const resultadoSeguro = await procesarSeguro(p.discordId, p.apuesta);

                    if (resultadoSeguro.tituloDerrota === 'Derrota Asegurada') {
                        perdedores.push(`**${p.username}** pierde ${p.apuesta - retenido} a ${p.valor}, pero el Seguro devolvio un 25%`);
                    } else {
                        perdedores.push(`**${p.username}** pierde ${p.apuesta - retenido}${retenido > 0 ? ` (+ retención)` : ''} (apostó a ${p.valor})`);
                    }
                }
            }

            const embedResultado = new EmbedBuilder()
                .setTitle(`🎡 Resultados de la Ruleta`)
                .setDescription(`El número ganador es **${numeroGanador}** (${colorGanador.toUpperCase()})`)
                .setColor(colorGanador === 'rojo' ? 0xE74C3C : (colorGanador === 'negro' ? 0x2C3E50 : 0x2ECC71));

            if (ganadores.length > 0) {
                embedResultado.addFields({ name: '🏆 GANADORES', value: ganadores.join('\n') });
            } else {
                embedResultado.addFields({ name: '🏆 GANADORES', value: 'Nadie ganó esta vez.' });
            }

            if (perdedores.length > 0) {
                embedResultado.addFields({ name: '💀 PERDEDORES', value: perdedores.join('\n') });
            }

            await publicMessage.reply({ embeds: [embedResultado] });
        }
    }
};
