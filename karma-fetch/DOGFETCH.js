const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = 3000;

// Add the rate logging counter at the top level
let rateLogCounter = 0;

// Define the utility functions outside of your route handlers
function logFetch(url) {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    console.log(`🔁 [${timeString}] Fetching: ${url}`);
}

function logRateInfo(headers, force = false) {
    const now = new Date();
    const timeString = now.toLocaleTimeString();

    const used = parseFloat(headers.get("x-ratelimit-used") || "0");
    const remaining = parseFloat(headers.get("x-ratelimit-remaining") || "60");
    const reset = parseFloat(headers.get("x-ratelimit-reset") || "60");

    rateLogCounter++;

    if (force || rateLogCounter % 5 === 0) {
        console.log(
            `📉 [${timeString}] Rate Watch: Used ${used}, Remaining ${remaining}, Resets in ${reset}s`
        );
    }

    if (remaining <= 10) {
        console.warn(`🚨 [${timeString}] WARNING: Only ${remaining} Reddit API requests left!`);
    }
}

// Utility function for fetching with rate limiting
async function dogFetch(url, options = {}) {
    logFetch(url);

    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                "User-Agent": "KarmaFinder/1.0",
                ...(options.headers || {}),
            },
        });

        logRateInfo(response.headers);

        if (!response.ok) {
            console.error(`❌ Failed to fetch ${url} – Status: ${response.status}`);
        }

        return response;
    } catch (err) {
        console.error(`🐶💥 DOGFETCH ERROR: ${url}\n→ ${err.message}`);
        throw err;
    }
}

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
});

app.get('/reddit', async (req, res) => {
    const encodedUrl = req.query.url;
    const decodedUrl = decodeURIComponent(encodedUrl);

    // URL validation 
    if (!decodedUrl.startsWith('https://www.reddit.com/')) {
        return res.status(403).send('Only Reddit URLs are allowed');
    }

    try {
        // Use the dogFetch function instead of fetch
        const response = await dogFetch(decodedUrl, {
            headers: {
                'User-Agent': 'KarmaFinder/1.0 (by u/YourUsername)'
            }
        });

        if (response.status === 429) {
            console.log('🚫 429 TOO MANY REQUESTS');
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

    // More comprehensive validation for Reddit image domains
    const allowedDomains = [
        'i.redd.it',
        'preview.redd.it',
        'external-preview.redd.it',
        'v.redd.it',
        'i.imgur.com',
        'imgur.com',
        'redditstatic.com'
    ];

    // Check if URL is from an allowed domain
    const isAllowedDomain = allowedDomains.some(domain =>
        imageUrl.includes(domain)
    );

    if (!isAllowedDomain) {
        console.log(`🚫 Blocked request to non-Reddit image: ${imageUrl}`);
        return res.status(403).send('Only Reddit image domains are allowed');
    }

    try {
        // Use dogFetch here too
        const response = await dogFetch(imageUrl, {
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