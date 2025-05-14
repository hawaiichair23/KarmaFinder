const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const client = require('./db');
const app = express();
const PORT = 3000;

const axios = require('axios');
const cheerio = require('cheerio');

app.use(cors());         
app.use(express.json());

require('dotenv').config();
require('./cron-cleanup');

const REDDIT_ANDROID_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/113.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://www.google.com/',
    'Connection': 'keep-alive',
};

async function getOGImage(url) {
    try {
        const { data: html } = await axios.get(url, { headers });
        const $ = cheerio.load(html);
        const ogImage = $('meta[property="og:image"]').attr('content');
        return ogImage || null;
    } catch (err) {
        console.error('🛑 OG fetch failed:', err.message);
        return null;
    }
}

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

app.post('/api/save-image', async (req, res) => {
    const { reddit_post_id, subreddit, title, url, thumbnail } = req.body;

    // Normalize thumbnail value to lowercase string (if it exists)
    const normalizedThumb = (thumbnail || '').toLowerCase();

    // List of bad/default thumbnails Reddit sometimes gives
    const badThumbs = new Set(['self', 'default', 'nsfw', 'spoiler', 'image', '']);

    let finalThumbnail = thumbnail;

    // If no thumbnail or it's clearly a placeholder, try scraping OG image
    if (!thumbnail || badThumbs.has(normalizedThumb)) {
        console.log(`🧪 OG fetch triggered for: ${url}`);
        try {
            finalThumbnail = await getOGImage(url);
            console.log(`🔍 OG image result: ${finalThumbnail}`);
        } catch (err) {
            console.error(`❌ Failed to fetch OG image: ${err.message}`);
            finalThumbnail = null; // Fallback
        }
    }

    // Insert to DB
    try {
        const query = `
            INSERT INTO image_news_cache (reddit_post_id, subreddit, title, url, thumbnail)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (reddit_post_id) DO NOTHING
        `;

        const values = [reddit_post_id, subreddit, title, url, finalThumbnail];
        await client.query(query, values);

        res.status(200).json({
            success: true,
            message: 'Saved!',
            data: {
                reddit_post_id,
                subreddit,
                title,
                url,
                thumbnail: finalThumbnail
            }
        });

    } catch (err) {
        console.error('❌ DB Insert error:', err.message);
        res.status(500).json({ success: false, message: 'Insert failed' });
    }
});

app.get('/api/get-cached-posts', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM image_news_cache');
        res.json(result.rows);
    } catch (err) {
        console.error('❌ DB fetch error:', err.message);
        res.status(500).json({ error: 'Failed to fetch cached posts' });
    }
});

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

    // Check if this is a subreddit search request
    if (decodedUrl.includes('subreddits/search.json')) {
        // Extract the search query
        const urlParams = new URL(decodedUrl, 'https://example.com').searchParams;
        const query = urlParams.get('q');

        if (query) {
            try {
                // Check if we have a fresh cached result
                const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

                const cachedResult = await client.query(
                    "SELECT results, created_at FROM subreddit_search_cache WHERE query_term = $1",
                    [query]
                );

                const isCacheFresh = cachedResult.rows.length > 0 &&
                    (new Date() - new Date(cachedResult.rows[0].created_at)) < CACHE_DURATION;

                if (isCacheFresh) {
                    console.log(`🚀 Cache hit for query: ${query}`);
                    return res.json(cachedResult.rows[0].results);
                }
            } catch (error) {
                console.error('Error checking cache:', error);
                // Continue to fetch from Reddit if there's an error
            }
        }
    }

    // Rewrite www to oauth
    decodedUrl = decodedUrl.replace('https://www.reddit.com', 'https://oauth.reddit.com');

    // Strip trailing .json or .json/ since OAuth API doesn't need them
    decodedUrl = decodedUrl.replace(/\.json\/?$/, '');

    try {
        const token = await getRedditAppToken();

        // Only retry for ECONNRESET errors
        let response;
        let lastError;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                response = await dogFetch(decodedUrl, {
                    headers: {
                        ...headers,
                        'Authorization': `Bearer ${token}`,
                        'User-Agent': 'android:com.reddit.frontpage:v2023.10.0 (by /u/yourbot)'
                    }
                });

                // If it worked, break out of the loop
                break;

            } catch (error) {
                lastError = error;

                // ONLY retry if it's ECONNRESET
                if (error.code === 'ECONNRESET' && attempt < 3) {
                    console.log(`ECONNRESET on attempt ${attempt}, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }

                // For any other error, or if we've hit max attempts, throw immediately
                throw error;
            }
        }

        if (response.status === 429) {
            console.log('🚫 429 TOO MANY REQUESTS');
            return res.status(429).send('Rate limited by Reddit');
        }

        const data = await response.json();

        // 🔁 Inject icon_url into each post from subreddit_icons
        if (data?.data?.children) {
            for (let post of data.data.children) {
                const subreddit = post.data.subreddit;

                try {
                    const iconRes = await client.query(
                        'SELECT icon_url FROM subreddit_icons WHERE subreddit = $1',
                        [subreddit]
                    );

                    // Flatten the icon_url so it's directly on the post
                    post.icon_url = iconRes.rows[0]?.icon_url || null;
                } catch (err) {
                    console.error(`❌ Failed to fetch icon for r/${subreddit}:`, err.message);
                    post.icon_url = null;
                }
            }
        }
        
        // Cache subreddit search results
        if (encodedUrl.includes('subreddits/search.json')) {
            const urlParams = new URL(decodeURIComponent(encodedUrl), 'https://example.com').searchParams;
            const query = urlParams.get('q');

            if (query && data) {
                try {
                    // Clean the data before storing
                    const cleanedData = {
                        data: {
                            children: data.data.children.map(child => ({
                                data: {
                                    // Keep only these essential fields
                                    id: child.data.id,
                                    display_name: child.data.display_name,
                                    url: child.data.url,
                                    name: child.data.name,

                                    // Only the image fields you're actually using
                                    community_icon: child.data.community_icon || null,
                                    mobile_banner_image: child.data.mobile_banner_image || null,
                                    icon_img: child.data.icon_img || null,
                                    header_img: child.data.header_img || null,
                                    banner_img: child.data.banner_img || null
                                }
                            }))
                        }
                    };

                    // STORE QUERIES IN DB
                    await client.query(
                        `INSERT INTO subreddit_search_cache (query_term, results, created_at) 
                        VALUES ($1, $2, NOW()) 
                        ON CONFLICT (query_term) DO UPDATE 
                        SET results = $2, created_at = NOW()`,
                        [query, JSON.stringify(cleanedData)]  
                    );
                } catch (error) {
                    console.error('Error caching results:', error);
                }
            }
        }

        res.json(data);

        // ICON CACHING
        if (decodedUrl.includes('/about')) {
            const match = decodedUrl.match(/\/r\/([^/]+)\/about/);
            const subreddit = match ? match[1] : null;

            if (subreddit && data?.data) {
                const rawIcon = (
                    data.data.community_icon ||
                    data.data.mobile_banner_image ||
                    data.data.icon_img ||
                    data.data.header_img ||
                    data.data.banner_img ||
                    ''
                ).replace(/&amp;/g, '&').trim();

                const iconUrl = rawIcon || null;

                try {
                    await client.query(`
                        INSERT INTO subreddit_icons (subreddit, icon_url, created_at)
                        VALUES ($1, $2, NOW())
                        ON CONFLICT (subreddit)
                        DO UPDATE SET icon_url = EXCLUDED.icon_url, created_at = NOW()
                    `, [subreddit, iconUrl]);

                    console.log(`💾 Saved icon for r/${subreddit} from /about.json`);
                } catch (err) {
                    console.error(`❌ DB insert failed for r/${subreddit}:`, err.message);
                }
            }
        }

    } catch (err) {
        // Handle ECONNRESET first, BEFORE sending any other response
        if (err.code === 'ECONNRESET') {
            console.error('❌ Reddit closed the connection after 3 attempts');
            return res.status(503).json({ error: 'Reddit connection lost. Please try again.' });
        }

        // Handle all other errors
        console.error('❌ Reddit proxy error:', err.message);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(500).json({ error: 'Failed to fetch Reddit content. ' + err.message });
    }

});

app.get('/image', async (req, res) => {
    const imageUrl = decodeURIComponent(req.query.url);
    if (!imageUrl) return res.status(400).send('No image URL provided.');

    try {

        const imageHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/113.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.google.com/',
            'Connection': 'keep-alive',
        };

        const response = await fetch(imageUrl, {
            headers: imageHeaders,
            redirect: 'follow'
        });

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

const deleteOldEntries = async () => {
    try {
        const result = await client.query(`
            DELETE FROM image_news_cache
            WHERE created_at < NOW() - INTERVAL '7 minutes'
        `);
        console.log(`🧹 Deleted ${result.rowCount} entries older than 7 minutes`);
    } catch (err) {
        console.error('❌ Error cleaning entries:', err.message);
    }
};

setInterval(deleteOldEntries, 7 * 60 * 1000); // Run every 7 minutes

// 🔁 START SERVER LOGIC
async function startServer() {
    const token = await getRedditAppToken();
    console.log('✅ Reddit app token fetched:', token.slice(0, 12), '...');

    app.listen(PORT, () => {
        console.log(`🚀 FETCH server running at http://localhost:${PORT}`);
    });
}

startServer();