const http = require('http');

const url = 'http://127.0.0.1:54321/rest/v1/';
const key = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const options = {
    headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
    }
};

http.get(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const schema = JSON.parse(data);
            console.log("inventario_bovedas definition:", schema.definitions.inventario_bovedas);
            console.log("\ntransacciones definition:", schema.definitions.transacciones);
        } catch (e) {
            console.error("Error parsing JSON:", e);
        }
    });
}).on('error', (err) => {
    console.error("HTTP error:", err);
});
