const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = 3000;

require('dotenv').config();

const REDDIT_ANDROID_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;

let redditToken = null;
let redditTokenExpiry = 0;

async function getRedditAppToken() {
    const now = Date.now();
    if (redditToken && now < redditTokenExpiry) return redditToken;

    const basicAuth = Buffer.from(`${REDDIT_ANDROID_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');

    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'android:com.reddit.frontpage:v2023.10.0 (by /u/yourbot)'
        },
        body: 'grant_type=client_credentials'
    });

    const data = await res.json();

    if (data.access_token) {
        redditToken = data.access_token;
        redditTokenExpiry = now + (data.expires_in || 3600) * 1000;
        console.log("🔐 Got Reddit app token:", redditToken.slice(0, 16) + '...');
        return redditToken;
    } else {
        console.error("❌ Failed to get Reddit app token:", data);
        throw new Error("Could not fetch token");
    }
}

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
    let decodedUrl = decodeURIComponent(encodedUrl);

    // Ensure it’s a Reddit URL
    if (!decodedUrl.startsWith('https://www.reddit.com/')) {
        return res.status(403).send('Only Reddit URLs are allowed');
    }

    // Rewrite www to oauth
    decodedUrl = decodedUrl.replace('https://www.reddit.com', 'https://oauth.reddit.com');

    // Strip trailing .json or .json/ since OAuth API doesn't need them
    decodedUrl = decodedUrl.replace(/\.json\/?$/, '');

    try {
        const token = await getRedditAppToken();

        const response = await dogFetch(decodedUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'android:com.reddit.frontpage:v2023.10.0 (by /u/yourbot)'
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

    try {
        const token = await getRedditAppToken();

        const headers = {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'android:com.reddit.frontpage:v2023.10.0 (by /u/yourbot)',
            'Accept': 'image/*'
        };

        const response = await fetch(imageUrl, { headers });

        if (!response.ok) {
            console.error(`[⚠️] Image source returned status ${response.status}: ${imageUrl}`);
            const body = await response.text();
            console.error('❌ Response body:', body.slice(0, 300));
            return res.status(response.status).send(`Source returned ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            console.error('[⚠️] Not image content:', contentType, '| URL:', imageUrl);
            return res.status(400).send('Invalid image content.');
        }

        const imageBuffer = await response.arrayBuffer();
        if (!imageBuffer || imageBuffer.byteLength === 0) {
            console.warn('⚠️ Empty image buffer:', imageUrl);
            return res.status(500).send('Empty image data.');
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', imageBuffer.byteLength);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        res.setHeader('ETag', `"${Date.now()}"`);

        res.send(Buffer.from(imageBuffer));
    } catch (err) {
        console.error('[🔥] Error fetching image:', err.message);
        res.status(500).send('Error fetching image: ' + err.message);
    }
});

// 🔁 START SERVER LOGIC
async function startServer() {
    const token = await getRedditAppToken();
    console.log('✅ Reddit app token fetched:', token.slice(0, 12), '...');

    app.listen(PORT, () => {
        console.log(`🚀 FETCH server running at http://localhost:${PORT}`);
    });
}

startServer();