const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = 3000;

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
});

app.get('/reddit', async (req, res) => {
    const encodedUrl = req.query.url;
    const decodedUrl = decodeURIComponent(encodedUrl);

    try {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        console.log(`🔁 [${timeString}] Fetching: ${decodedUrl}`);

        const response = await fetch(decodedUrl, {
            headers: {
                'User-Agent': 'KarmaFinder/1.0 (by u/YourUsername)'
            }
        });

        // Optional: rate limit logging
        const remaining = response.headers.get('x-ratelimit-remaining');
        const reset = response.headers.get('x-ratelimit-reset');
        const used = response.headers.get('x-ratelimit-used');

        const timestamp = now.toLocaleTimeString();

        console.log(`📊 [${timestamp}] Rate Limit Info:`);
        console.log(`   Remaining: ${remaining}`);
        console.log(`   Used: ${used}`);
        console.log(`   Resets in: ${reset} seconds`);

        if (response.status === 429) {
            console.log(`🚫 [${timestamp}] 429 TOO MANY REQUESTS`);
            console.log(`   Remaining: ${remaining}`);
            console.log(`   Used: ${used}`);
            console.log(`   Resets in: ${reset} seconds`);

            return res.status(429).send('Rate limited by Reddit');
        }


        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('❌ Reddit proxy error:', err.message);
        res.status(500).json({ error: 'Failed to fetch Reddit content. ' + err.message });
    }
});


app.get('/image', async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send('No image URL provided.');

    try {
        const response = await fetch(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.startsWith('image/')) {
            return res.status(400).send('Invalid image content');
        }

        res.setHeader('Content-Type', contentType);
        response.body.pipe(res);
    } catch (err) {
        res.status(500).send('Error fetching image: ' + err.message);
    }
});

app.listen(PORT, () => {
    console.log(`✅ Proxy server running on http://localhost:${PORT}`);
});
