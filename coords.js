const http = require('http');
const port = process.env.PORT || 3000;

http.get(`http://localhost:${port}/coords`, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const coords = JSON.parse(data);
            console.log('\n--- Active Player Coordinates ---');
            console.table(coords);
        } catch (e) {
            console.error('Failed to parse response:', e.message);
        }
    });
}).on('error', (err) => {
    console.error('Error connecting to relay server:', err.message);
});
