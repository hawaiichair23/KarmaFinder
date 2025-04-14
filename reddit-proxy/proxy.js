const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = 3000;

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
});

app.get('/reddit', async (req, res) => {
    const url = req.query.url;
    console.log('[PROXY] Forwarding to:', url);

    if (!url || !url.startsWith('https://www.reddit.com/')) {
        return res.status(400).json({ error: 'Invalid or missing Reddit URL' });
    }

    // Add delay here (300ms)
    await new Promise(resolve => setTimeout(resolve, 300));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // ⏱ 8s timeout

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'KarmaFinder/1.0 (+https://karmafinder.site)'
            }
        });

        clearTimeout(timeout);

        if (!response.ok) {
            console.error('[PROXY] Reddit error:', response.status);
            return res.status(response.status).json({ error: `Reddit returned status ${response.status}` });
        }

        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('[PROXY] Error:', err.message);
        res.status(500).json({ error: 'Proxy failed', details: err.message });
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
