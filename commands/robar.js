const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('robar')
        .setDescription('Intenta robar monedas a otro usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario al que quieres robar')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const atacanteId = interaction.user.id;
        const victima = interaction.options.getUser('usuario');

        if (atacanteId === victima.id) {
            return interaction.editReply('No puedes robarte a ti mismo.');
        }

        const { data: atacanteData, error: atacanteError } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', atacanteId)
            .single();

        if (atacanteError || !atacanteData) {
            return interaction.editReply('No tienes una cuenta economica. Usa /daily primero.');
        }

        if (Number(atacanteData.balance) < 500) {
            return interaction.editReply('Necesitas al menos 500 monedas en tu balance para poder contratar un ladron.');
        }

        if (atacanteData.ultimo_robo) {
            const ultimoRobo = new Date(atacanteData.ultimo_robo);
            const now = new Date();
            const diffInMs = now - ultimoRobo;
            const msIn30Min = 30 * 60 * 1000;

            if (diffInMs < msIn30Min) {
                const timeLeftMs = msIn30Min - diffInMs;
                const minutesLeft = Math.floor(timeLeftMs / (1000 * 60));
                const secondsLeft = Math.floor((timeLeftMs % (1000 * 60)) / 1000);
                return interaction.editReply(`Debes esperar ${minutesLeft}m y ${secondsLeft}s para volver a robar.`);
            }
        }

        const { data: victimaData, error: victimaError } = await supabase
            .from('perfiles_economia')
            .select('*')
            .eq('discord_id', victima.id)
            .single();

        if (victimaError || !victimaData) {
            return interaction.editReply('El usuario al que intentas robar no tiene una cuenta economica.');
        }

        if (Number(victimaData.balance) < 1000) {
            return interaction.editReply('Esta victima tiene proteccion por tener menos de 1000 monedas.');
        }

        if (victimaData.sido_robado_el) {
            const sidoRobadoEl = new Date(victimaData.sido_robado_el);
            const now = new Date();
            const diffInMs = now - sidoRobadoEl;
            const msIn2Hours = 2 * 60 * 60 * 1000;

            if (diffInMs < msIn2Hours) {
                const timeLeftMs = msIn2Hours - diffInMs;
                const hoursLeft = Math.floor(timeLeftMs / (1000 * 60 * 60));
                const minutesLeft = Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60));
                return interaction.editReply(`Este usuario tiene proteccion temporal contra robos. Intenta en ${hoursLeft}h y ${minutesLeft}m.`);
            }
        }

        const { data: maletin } = await supabase
            .from('inventario_items')
            .select('*')
            .eq('discord_id', victima.id)
            .eq('item_id', 2)
            .gt('usos_restantes', 0)
            .single();

        const nowIso = new Date().toISOString();

        if (maletin) {
            const usosRestantes = maletin.usos_restantes - 1;
            
            if (usosRestantes <= 0) {
                await supabase
                    .from('inventario_items')
                    .delete()
                    .eq('id', maletin.id);
            } else {
                await supabase
                    .from('inventario_items')
                    .update({ usos_restantes: usosRestantes })
                    .eq('id', maletin.id);
            }

            const multaFija = 1000;
            let nuevoSaldoAtacante = Number(atacanteData.balance) - multaFija;
            if (nuevoSaldoAtacante < 0) nuevoSaldoAtacante = 0;

            await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoSaldoAtacante, ultimo_robo: nowIso })
                .eq('discord_id', atacanteId);

            const embedMaletin = new EmbedBuilder()
                .setTitle('Robo Frustrado por Defensa')
                .setColor(0xFF0000)
                .setDescription('Tu intento de robo fracaso estrepitosamente. La victima portaba un Maletin de Doble Fondo.')
                .addFields(
                    { name: 'Multa del Fisco', value: `-${multaFija} monedas`, inline: true },
                    { name: 'Tu Nuevo Saldo', value: `${nuevoSaldoAtacante} monedas`, inline: true }
                );

            return interaction.editReply({ embeds: [embedMaletin] });
        }

        const exito = Math.random() < 0.50;

        if (exito) {
            const porcentajeRobo = Math.floor(Math.random() * (25 - 10 + 1)) + 10;
            const montoRobado = Math.floor((porcentajeRobo / 100) * Number(victimaData.balance));

            const nuevoSaldoAtacante = Number(atacanteData.balance) + montoRobado;
            const nuevoSaldoVictima = Number(victimaData.balance) - montoRobado;

            const { error: updateAtacanteError } = await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoSaldoAtacante, ultimo_robo: nowIso })
                .eq('discord_id', atacanteId);

            if (updateAtacanteError) {
                return interaction.editReply('Ocurrio un error al intentar el robo.');
            }

            const { error: updateVictimaError } = await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoSaldoVictima, sido_robado_el: nowIso })
                .eq('discord_id', victima.id);

            if (updateVictimaError) {
                await supabase
                    .from('perfiles_economia')
                    .update({ balance: atacanteData.balance })
                    .eq('discord_id', atacanteId);
                
                return interaction.editReply('Ocurrio un error al sustraer el dinero de la victima. El robo fue cancelado.');
            }

            const embedExito = new EmbedBuilder()
                .setTitle('Robo Exitoso')
                .setColor(0x00FF00)
                .setDescription(`Has robado ${montoRobado} monedas (el ${porcentajeRobo} por ciento) a ${victima.username}.`)
                .addFields(
                    { name: 'Tu Nuevo Saldo', value: `${nuevoSaldoAtacante} monedas`, inline: false }
                );

            return interaction.editReply({ embeds: [embedExito] });

        } else {
            const porcentajePenalizacion = 15;
            const montoPenalizacion = Math.floor((porcentajePenalizacion / 100) * Number(atacanteData.balance));

            const nuevoSaldoAtacante = Number(atacanteData.balance) - montoPenalizacion;
            const nuevoSaldoVictima = Number(victimaData.balance) + montoPenalizacion;

            const { error: updateAtacanteError } = await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoSaldoAtacante, ultimo_robo: nowIso })
                .eq('discord_id', atacanteId);

            if (updateAtacanteError) {
                return interaction.editReply('Ocurrio un error al intentar el robo.');
            }

            const { error: updateVictimaError } = await supabase
                .from('perfiles_economia')
                .update({ balance: nuevoSaldoVictima })
                .eq('discord_id', victima.id);

            if (updateVictimaError) {
                await supabase
                    .from('perfiles_economia')
                    .update({ balance: atacanteData.balance })
                    .eq('discord_id', atacanteId);

                return interaction.editReply('Ocurrio un error al transferir la indemnizacion a la victima. El robo fue cancelado.');
            }

            const embedFracaso = new EmbedBuilder()
                .setTitle('Robo Fallido: Te han Atrapado')
                .setColor(0xFF0000)
                .setDescription(`El robo fracaso. Pagas una multa de ${montoPenalizacion} monedas (el 15 por ciento de tu dinero) que se transfiere a ${victima.username} como indemnizacion.`)
                .addFields(
                    { name: 'Tu Nuevo Saldo', value: `${nuevoSaldoAtacante} monedas`, inline: false }
                );

            return interaction.editReply({ embeds: [embedFracaso] });
        }
    }
};
