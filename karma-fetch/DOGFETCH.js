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

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');

    // ✅ Allowed domains
    const allowedDomains = [
        'i.redd.it',
        'preview.redd.it',
        'external-preview.redd.it',
        'v.redd.it',
        'i.imgur.com',
        'imgur.com',
        'redditstatic.com'
    ];

    try {
        const urlObj = new URL(imageUrl);
        const hostname = urlObj.hostname;

        const isAllowed = allowedDomains.some(domain => hostname.endsWith(domain));
        if (!isAllowed) {
            console.warn(`[🚫] Blocked domain: ${hostname}`);
            return res.status(403).send('Domain not allowed.');
        }
    } catch (err) {
        console.error('[❌] Invalid URL:', err.message);
        return res.status(400).send('Invalid image URL.');
    }

    // In the /image route, replace the problematic part with this:
    try {
        const response = await fetch(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; KarmaFinder/1.0; +https://karmapath)'
            }
        });

        if (!response.ok) {
            console.error(`[⚠️] Image source returned status ${response.status}: ${imageUrl}`);
            return res.status(response.status).send(`Source returned ${response.status}`);
        }

        const contentType = response.headers.get('content-type');

        // More flexible content type checking
        if (!contentType || !(contentType.startsWith('image/') || contentType.includes('jpeg') || contentType.includes('png') || contentType.includes('gif'))) {
            console.error('[⚠️] Invalid image content:', contentType);
            return res.status(400).send('Invalid image content.');
        }

        // Set cache prevention headers
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        res.setHeader('ETag', `"${Date.now()}"`);

        // Set content type to match the original
        if (contentType) {
            res.setHeader('Content-Type', contentType);
        }

        // Get full image data with more explicit error handling
        let imageBuffer;
        try {
            imageBuffer = await response.arrayBuffer();
        } catch (bufferError) {
            console.error('[🔥] Error processing image response:', bufferError.message);
            return res.status(500).send('Error processing image data: ' + bufferError.message);
        }

        // Check if we got data
        if (!imageBuffer || imageBuffer.byteLength === 0) {
            console.warn('⚠️ Empty data received from image URL:', imageUrl);
            return res.status(500).send('Empty image data received from source.');
        }

        // Send the buffer as response
        res.send(Buffer.from(imageBuffer));

    } catch (err) {
        console.error('[🔥] Error fetching image:', err.message);
        res.status(500).send('Error fetching image: ' + err.message);
    }
});

app.use((err, req, res, next) => {
    console.error('🛑 Uncaught server error:', err);
    res.status(500).send('Internal server error.');
});


app.listen(PORT, () => {
    console.log(`✅ Proxy server running on http://localhost:${PORT}`);
});
