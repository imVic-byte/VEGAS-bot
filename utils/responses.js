const { EmbedBuilder } = require('discord.js');

function noMoney(balanceActual) {
    const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Fondos Insuficientes')
        .setDescription(`No tienes suficientes monedas para realizar esta acción.\nTu saldo actual es de **${balanceActual}** monedas.`)
        .setImage('https://rnhdmonauucuxpovqxun.supabase.co/storage/v1/object/public/vegas-media/no%20money.gif');

    return {
        content: '',
        embeds: [embed],
        components: [],
        ephemeral: true
    };
}

function yourself() {
    const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Acción Inválida')
        .setDescription('No puedes interactuar contigo mismo. ¡Cuidado!')
        .setImage('https://rnhdmonauucuxpovqxun.supabase.co/storage/v1/object/public/vegas-media/last%20warning.jpg');

    return {
        content: '',
        embeds: [embed],
        components: [],
        ephemeral: true
    };
}

function together(donorId, beggarId, cantidad) {
    const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('💖 ¡Donación Exitosa!')
        .setDescription(`🎉 <@${donorId}> ha donado **${cantidad}** monedas a <@${beggarId}>.\n¡Qué generosidad!`)
        .setImage('https://rnhdmonauucuxpovqxun.supabase.co/storage/v1/object/public/vegas-media/together.jpg');

    return {
        content: '',
        embeds: [embed],
        components: []
    };
}

module.exports = {
    noMoney,
    yourself,
    together
};