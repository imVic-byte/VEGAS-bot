const supabase = require('../supabase');

/**
 * Incrementa los fondos acumulados en la bóveda central del fisco.
 * @param {number} cantidad Monto a sumar a los fondos acumulados.
 */
async function sumarAlFisco(cantidad) {
    if (!cantidad || cantidad <= 0) return;
    
    try {
        const { data: boveda, error: selectError } = await supabase
            .from('fisco_boveda_central')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        if (selectError) {
            console.error('Error al seleccionar la bóveda central del fisco:', selectError);
            return;
        }

        if (!boveda) {
            // Si no existe, creamos el registro inicial
            const { error: insertError } = await supabase
                .from('fisco_boveda_central')
                .insert([{ id: 1, fondos_acumulados: cantidad }]);
            if (insertError) {
                console.error('Error al inicializar la bóveda central del fisco:', insertError);
            }
        } else {
            // Si existe, acumulamos
            const nuevosFondos = (Number(boveda.fondos_acumulados) || 0) + cantidad;
            const { error: updateError } = await supabase
                .from('fisco_boveda_central')
                .update({ fondos_acumulados: nuevosFondos })
                .eq('id', 1);
            if (updateError) {
                console.error('Error al actualizar los fondos acumulados en la bóveda central:', updateError);
            }
        }
    } catch (err) {
        console.error('Error en sumarAlFisco:', err);
    }
}

/**
 * Obtiene la tasa de impuesto a cobrar desde la bóveda central del fisco.
 * Retorna la tasa como fracción (ej. 0.12 para 12%).
 * @param {number} valorPorDefecto Tasa por defecto si falla la consulta (ej. 0.12).
 * @returns {Promise<number>} Tasa de impuesto como fracción.
 */
async function obtenerTasaImpuesto(valorPorDefecto = 0.12) {
    try {
        const { data: boveda, error } = await supabase
            .from('fisco_boveda_central')
            .select('impuesto')
            .eq('id', 1)
            .maybeSingle();

        if (error || !boveda || boveda.impuesto === null || boveda.impuesto === undefined) {
            return valorPorDefecto;
        }

        const val = Number(boveda.impuesto);
        // Si el valor ingresado es un entero como 12 o 10, lo dividimos por 100
        return val > 1 ? val / 100 : val;
    } catch (err) {
        console.error('Error al obtener tasa de impuesto:', err);
        return valorPorDefecto;
    }
}

module.exports = {
    sumarAlFisco,
    obtenerTasaImpuesto
};
