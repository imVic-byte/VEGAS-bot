const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const supabase = require('../supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Comando base de la tienda del servidor')
        .addSubcommand(subcommand => subcommand.setName('mascotas').setDescription('Tienda de mascotas (buffos de retención)'))
        .addSubcommand(subcommand => subcommand.setName('roles').setDescription('Tienda de roles estéticos y buffos (ej: multiplicadores)'))
        .addSubcommand(subcommand => subcommand.setName('titulos').setDescription('Tienda de títulos para personalizar tu perfil'))
        .addSubcommand(subcommand => subcommand.setName('boveda').setDescription('Mejoras de almacenamiento seguro'))
        .addSubcommand(subcommand => subcommand.setName('items').setDescription('Tienda de consumibles dinámicos')),

    async execute(interaction) {
        await interaction.deferReply();
        const subcomando = interaction.options.getSubcommand();
        
        let category = subcomando;
        if (category === 'mascotas') category = 'mascota';
        if (category === 'roles') category = 'rol';
        if (category === 'titulos') category = 'titulo';
        if (category === 'items') category = 'item';

        await this.handlePagination(interaction, category, 1);
    },

    async handlePagination(interaction, category, page) {
        let list = [];
        let title = '';

        if (category === 'mascota') {
            const { getMascotas } = require('../utils/handleMascotas');
            list = await getMascotas() || [];
            title = '🐾 Tienda de Mascotas';
        } else if (category === 'rol') {
            const { getRoles } = require('../utils/handleRoles');
            list = await getRoles() || [];
            title = '🎭 Tienda de Roles';
        } else if (category === 'titulo') {
            const { getTitles } = require('../utils/handleTitulos');
            list = await getTitles() || [];
            title = '🏷️ Tienda de Títulos';
        } else if (category === 'boveda') {
            const { data } = await supabase.from('tienda_bovedas').select('*').order('nivel_requerido', { ascending: true });
            list = data || [];
            title = '🏦 Mejoras de Bóveda';
        } else if (category === 'item') {
            const { data } = await supabase.from('tienda_items').select('*').order('precio_base', { ascending: true });
            list = data || [];
            title = '🎒 Tienda de Consumibles';
        }

        const ITEMS_PER_PAGE = 5;
        const totalPages = Math.ceil(list.length / ITEMS_PER_PAGE) || 1;
        
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;

        const startIndex = (page - 1) * ITEMS_PER_PAGE;
        const currentItems = list.slice(startIndex, startIndex + ITEMS_PER_PAGE);

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(0xF1C40F)
            .setFooter({ text: `Página ${page} de ${totalPages}` });

        let desc = '';
        const buttons = [];
        let indexOnPage = 1;

        for (const item of currentItems) {
            const id = item.id;
            let name = '';
            let price = 0;
            let extra = '';

            if (category === 'mascota') {
                name = item.title;
                price = item.price;
                extra = item.description || '';
            } else if (category === 'rol') {
                name = item.title;
                price = item.price;
                extra = item.description || '';
            } else if (category === 'titulo') {
                name = item.name;
                price = item.price;
            } else if (category === 'boveda') {
                name = item.nombre;
                price = item.precio;
                extra = `Capacidad: ${item.capacidad_maxima}`;
            } else if (category === 'item') {
                name = item.nombre;
                price = item.precio_base;
                
                let descFija = item.descripcion || '';
                if (!descFija) {
                    if (id === 1) descFija = 'Multiplica x2 tu experiencia ganada por comandos.';
                    else if (id === 2) descFija = 'Inmunidad a tu próximo asalto (Pagas multa de 1000).';
                    else if (id === 3) descFija = 'Evade el impuesto del 12% en transferencias.';
                    else if (id === 4) descFija = 'Recupera el 25% del monto de tu apuesta si pierdes.';
                    else if (id === 5) descFija = 'Eleva tu límite crediticio y extiende el plazo de pago a 72h.';
                }
                
                let tiempo = item.duracion_minutos > 0 ? ` | Duración: ${item.duracion_minutos / 60} horas` : '';
                extra = `Usos: ${item.usos_iniciales}${tiempo}\n*${descFija}*`;
            }

            const impuesto = Math.floor(price * 0.10);
            desc += `**[${indexOnPage}] ${name}**\nPrecio Base: ${price} | IVA: ${impuesto} | Total: ${price + impuesto}\n${extra ? `*${extra}*\n` : ''}\n`;

            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`buy_${category}_${id}`)
                    .setLabel(String(indexOnPage))
                    .setStyle(ButtonStyle.Success)
            );
            
            indexOnPage++;
        }

        embed.setDescription(desc || 'No hay artículos disponibles en esta categoría.');

        const row1 = new ActionRowBuilder();
        if (buttons.length > 0) {
            row1.addComponents(buttons);
        }

        const row2 = new ActionRowBuilder();
        row2.addComponents(
            new ButtonBuilder()
                .setCustomId(`shop_page_${category}_${page - 1}`)
                .setLabel('⬅️ Anterior')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page <= 1),
            new ButtonBuilder()
                .setCustomId(`shop_page_${category}_${page + 1}`)
                .setLabel('Siguiente ➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page >= totalPages)
        );

        const payload = { embeds: [embed], components: buttons.length > 0 ? [row1, row2] : [row2] };

        if (interaction.isButton()) {
            await interaction.update(payload);
        } else {
            await interaction.editReply(payload);
        }
    }
};