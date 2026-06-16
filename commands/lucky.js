const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const wait = require('node:timers/promises').setTimeout;
const supabase = require('../supabase');
const { noMoney } = require('../utils/responses');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lucky')
        .setDescription('Apuesta tus monedas lanzando una al aire')
        .addStringOption(option =>
            option.setName('cara_o_sello')
                .setDescription('Elige tu lado de la moneda')
                .setRequired(true)
                .addChoices(
                    { name: 'Cara', value: 'cara' },
                    { name: 'Sello', value: 'sello' }
                )
        )
        .addIntegerOption(option =>
            option.setName('apuesta')
                .setDescription('Cantidad de monedas a apostar')
                .setRequired(true)
                .setMinValue(1)
        ),
        
    async execute(interaction) {
        await interaction.deferReply();

        const eleccion = interaction.options.getString('cara_o_sello');
        const apuesta = interaction.options.getInteger('apuesta');
        const discordId = interaction.user.id;

        const { data: user, error: selectError } = await supabase
            .from('perfiles_economia')
            .select('balance')
            .eq('discord_id', discordId)
            .single();

        if (selectError && selectError.code !== 'PGRST116') {
            return interaction.editReply('Error de conexion con la base de datos.');
        }

        if (!user) {
            return interaction.editReply('No tienes una cuenta registrada. Usa /daily primero.');
        }

        if (Number(user.balance) < apuesta) {
            return interaction.editReply(noMoney(user.balance));
        }

        const embedGiro = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('Lanzando la moneda al aire...')
            .setImage('https://rnhdmonauucuxpovqxun.supabase.co/storage/v1/object/public/vegas-media/coin-flip.gif');

        await interaction.editReply({ embeds: [embedGiro] });

        await wait(2500);

        const rngEspecial = Math.random();
        let resultado;
        let multiplicador = 1;
        let cayoDeCanto = false;

        if (rngEspecial < 0.03) {
            resultado = 'canto';
            multiplicador = 3;
            cayoDeCanto = true;
        } else {
            resultado = Math.random() < 0.5 ? 'cara' : 'sello';
        }

        const ganoNormal = eleccion === resultado;
        let nuevoBalance;
        let tituloResultado;
        let colorEmbed;

        if (cayoDeCanto) {
            nuevoBalance = Number(user.balance) + (apuesta * multiplicador);
            tituloResultado = 'LA MONEDA CAYO DE CANTO';
            colorEmbed = 0xFFD700;
        } else if (ganoNormal) {
            nuevoBalance = Number(user.balance) + apuesta;
            tituloResultado = `Salio ${resultado.toUpperCase()}`;
            colorEmbed = 0x57F287;
        } else {
            nuevoBalance = Number(user.balance) - apuesta;
            tituloResultado = `Salio ${resultado.toUpperCase()}`;
            colorEmbed = 0xED4245;
        }

        const { error: updateError } = await supabase
            .from('perfiles_economia')
            .update({ balance: nuevoBalance })
            .eq('discord_id', discordId);

        if (updateError) {
            return interaction.editReply({ 
                content: 'Error al actualizar tu saldo.', 
                embeds: [] 
            });
        }

        const embedFinal = new EmbedBuilder()
            .setColor(colorEmbed)
            .setTitle(tituloResultado);

        if (resultado === 'cara') {
            embedFinal.setImage('https://rnhdmonauucuxpovqxun.supabase.co/storage/v1/object/public/vegas-media/Cara.png');
        } else if (resultado === 'sello') {
            embedFinal.setImage('https://rnhdmonauucuxpovqxun.supabase.co/storage/v1/object/public/vegas-media/Sello.png');
        } else if (resultado === 'canto') {
            embedFinal.setImage('https://rnhdmonauucuxpovqxun.supabase.co/storage/v1/object/public/vegas-media/Canto.png');
        }

        if (cayoDeCanto) {
            embedFinal.setDescription(`Un evento rarisimo acaba de ocurrir.\nMultiplicas tu apuesta x${multiplicador}.\n\nGanaste ${apuesta * multiplicador} monedas.\nSaldo actual: ${nuevoBalance}`);
        } else if (ganoNormal) {
            embedFinal.setDescription(`Ganaste ${apuesta} monedas.\nSaldo actual: ${nuevoBalance}`);
        } else {
            embedFinal.setDescription(`Perdiste ${apuesta} monedas.\nSaldo actual: ${nuevoBalance}`);
        }

        return interaction.editReply({ embeds: [embedFinal] });
    }
};