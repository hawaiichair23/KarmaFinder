const { exec } = require('child_process');
const { promisify } = require('util');
const util = require('util');
const fs = require('fs');
const tmp = require('tmp-promise');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const crypto = require('crypto');
const execAsync = promisify(exec);
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const pool = require('./db');
const os = require('os');
const app = express();
const { execSync } = require('child_process');
const { scheduleFileDeletion } = require('./cron-cleanup.js');

const PORT = 3000;

const axios = require('axios');
const cheerio = require('cheerio');
        
require('dotenv').config();
require('./daddy-bot');
require('./cron-cleanup');

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Track requests per minute
let requestCount = 0;
let lastMinute = Date.now();

// Add this middleware to your main server (before your routes)
app.use((req, res, next) => {
    requestCount++;

    // Check every minute
    const now = Date.now();
    if (now - lastMinute > 60000) { // 1 minute
        const rpm = requestCount;

        // Log traffic data
        const time = new Date().toLocaleTimeString();
        pool.query(`
            INSERT INTO monitoring_logs (log_level, endpoint, error_message) 
            VALUES ($1, $2, $3)
        `, ['info', '/traffic', `${time} - ${rpm} requests per minute`]);

        requestCount = 0;
        lastMinute = now;
    }

    next();
});

// Stripe webhook
app.use('/api/webhook', express.raw({ type: 'application/json' }));

app.post('/api/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.ENDPOINTSECRET);
    } catch (err) {
        console.log(`Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle when someone completes checkout
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        try {
            if (!session.customer || !session.subscription) {
                console.log('⚠️ Incomplete checkout, skipping');
                return res.json({ received: true });
            }

            const customer = await stripe.customers.retrieve(session.customer);
            const subscription = await stripe.subscriptions.retrieve(session.subscription);

            const existingSubscription = await pool.query(`
               SELECT id FROM subscriptions WHERE email = $1
           `, [customer.email]);

            if (existingSubscription.rows.length > 0) {
                console.log(`⚠️ Subscription already exists for ${customer.email}, skipping`);
                return res.json({ received: true });
            }

            const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
            const priceId = lineItems.data[0]?.price?.id;

            let planType;
            if (priceId === 'price_1RhNDFD1lLWsoPSHMdd7uPvD') {
                planType = 'premium';
            } else if (priceId === 'price_1RhNE2D1lLWsoPSHJq3zAUpc') {
                planType = 'pro';
            } else {
                console.log(`⚠️ Unknown price ID: ${priceId}`);
                planType = 'unknown';
            }

            await pool.query(`
               INSERT INTO subscriptions (email, user_id, plan_type, stripe_subscription_id)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (email) DO UPDATE SET
                   user_id = EXCLUDED.user_id,
                   plan_type = EXCLUDED.plan_type,
                   stripe_subscription_id = EXCLUDED.stripe_subscription_id
           `, [customer.email, customer.id, planType, subscription.id]);

            console.log(`✅ Subscription created for ${customer.email} - Plan: ${planType}`);

        } catch (error) {
            console.error('Error creating subscription record:', error);
        }
    }

    // Customer changes plan
    if (event.type === 'customer.subscription.updated') {
        const subscription = event.data.object;
        try {
            const customer = await stripe.customers.retrieve(subscription.customer);
            const priceId = subscription.items.data[0]?.price?.id;

            let planType;
            if (priceId === 'price_1RhNDFD1lLWsoPSHMdd7uPvD') {
                planType = 'premium';
            } else if (priceId === 'price_1RhNE2D1lLWsoPSHJq3zAUpc') {
                planType = 'pro';
            } else {
                console.log(`⚠️ Unknown price ID: ${priceId}`);
                planType = 'unknown';
            }

            await pool.query(`
               UPDATE subscriptions 
               SET plan_type = $1, stripe_subscription_id = $2
               WHERE email = $3
           `, [planType, subscription.id, customer.email]);

            console.log(`✅ Subscription updated for ${customer.email} - New Plan: ${planType}`);
        } catch (error) {
            console.error('Error updating subscription record:', error);
        }
    }

    // Handle when subscription gets cancelled/deleted
    if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;

        try {
            const customer = await stripe.customers.retrieve(subscription.customer);

            await pool.query(`
               DELETE FROM subscriptions 
               WHERE email = $1
           `, [customer.email]);

            console.log(`🗑️ Subscription deleted for ${customer.email}`);
        } catch (error) {
            console.error('Error deleting subscription record:', error);
        }
    }

    res.json({ received: true });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    origin: '*',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());
app.use(express.static(path.join(__dirname, '../html')));

const REDDIT_ANDROID_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
const resend = new Resend(process.env.RESEND_API_KEY);

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/113.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://www.google.com/',
    'Connection': 'keep-alive',
};

process.on('unhandledRejection', (reason, promise) => {
    console.log('🚨 Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.log('🚨 Uncaught Exception:', error);
});

pool.on('error', (err) => {
    console.error('💥 Database pool error:', err);
});

function buildCacheKey(baseToken, filters) {
    const encode = str => encodeURIComponent(str || '');

    const query = encode(filters.query);
    const subreddit = encode(filters.subreddit || 'all');
    const contentType = encode(filters.contentType || 'all');
    const sort = encode(filters.sort || 'hot');
    const time = encode(filters.time || 'all');

    return `${baseToken}__${subreddit}__${sort}__${query}__${time}`;
}

async function getOGImage(url) {
    try {
        const { data: html } = await axios.get(url, {
            headers,
            timeout: 5000
        });
        const $ = cheerio.load(html);
        const ogImage = $('meta[property="og:image"]').attr('content');
        return ogImage || null;
    } catch (err) {
        console.error('🛑 Image scrape failed:', err.message);
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
            'User-Agent': 'android:com.reddit.frontpage:v2023.10.0'
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

    // Handle Reddit video URLs - convert to DASH format
    let processedUrl = url;
    if (url && url.includes('reddit.com/video/')) {
        const videoId = url.split('/').pop();
        processedUrl = `https://v.redd.it/${videoId}/DASH_480.mp4`;
        console.log(`🎥 Converted Reddit video URL: ${url} -> ${processedUrl}`);
    }

    // Normalize thumbnail value to lowercase string (if it exists)
    const normalizedThumb = (thumbnail || '').toLowerCase();

    // List of bad/default thumbnails Reddit sometimes gives
    const badThumbs = new Set(['self', 'default', 'nsfw', 'spoiler', 'image', '']);

    let finalThumbnail = thumbnail;

    // If no thumbnail or it's clearly a placeholder, try scraping OG image
    if ((!thumbnail || badThumbs.has(normalizedThumb)) &&
        !processedUrl.includes('i.redd.it') &&
        !processedUrl.includes('v.redd.it')) {

        console.log(`🧪 Image scrape triggered for: ${processedUrl}`);
        try {
            finalThumbnail = await getOGImage(processedUrl);
            console.log(`🔍 Image scrape result: ${finalThumbnail}`);
        } catch (err) {
            console.error(`❌ Failed to fetch image scrape: ${err.message}`);
            finalThumbnail = null;
        }
    }
    
    console.log('💾 Saving news image to database...');

    // Insert to DB
    try {
        const query = `
            INSERT INTO image_news_cache (reddit_post_id, subreddit, title, url, thumbnail)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (reddit_post_id) DO NOTHING
        `;

        const values = [reddit_post_id, subreddit, title, processedUrl, finalThumbnail];
        await pool.query(query, values);

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

app.get('/api/get-cached-image/:reddit_post_id', async (req, res) => {
    try {
        const { reddit_post_id } = req.params;
        const query = 'SELECT * FROM image_news_cache WHERE reddit_post_id = $1';
        const result = await pool.query(query, [reddit_post_id]);

        if (result.rows.length === 0) {
            return res.status(200).json({ success: false, message: 'Not cached yet' });
        }

        console.log(`🎯 Serving cached image for post: ${reddit_post_id} - ${result.rows[0].thumbnail}`);
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('❌ Cache fetch error:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.get('/reddit/icons', async (req, res) => {
    try {
        const subreddits = req.query.subreddits?.split(',').filter(s => s && s.trim()) || [];
        const icons = {};

        if (subreddits.length === 0) {
            return res.json({});
        }

        for (const subreddit of subreddits) {
            console.log(`🚨 Processing subreddit: ${subreddit}`);
            try {
                console.log(`🔎 Checking icon for r/${subreddit}`);

                // Check DB first
                const iconRes = await pool.query(
                    'SELECT icon_url FROM subreddit_icons WHERE subreddit = $1',
                    [subreddit]
                );

                if (iconRes.rows.length > 0) {
                    icons[subreddit] = iconRes.rows[0].icon_url;
                    console.log(`📦 Found cached icon for r/${subreddit}`);
                } else {
                    // Add 5ms delay before Reddit API call
                    await new Promise(resolve => setTimeout(resolve, 5));

                    // Fetch from Reddit
                    const token = await getRedditAppToken();
                    const aboutRes = await dogFetch(`https://oauth.reddit.com/r/${subreddit}/about`, {
                        headers: {
                            ...headers,
                            'Authorization': `Bearer ${token}`,
                            'User-Agent': 'android:com.reddit.frontpage:v2023.10.0 (by /u/yourbot)'
                        }
                    });

                    const aboutData = await aboutRes.json();
                    const rawIcon = (
                        aboutData.data.community_icon ||
                        aboutData.data.icon_img ||
                        aboutData.data.mobile_banner_image ||
                        aboutData.data.header_img ||
                        aboutData.data.banner_img ||
                        ''
                    ).replace(/&amp;/g, '&').trim();

                    const iconUrl = rawIcon || null;
                    icons[subreddit] = iconUrl;

                    console.log(`🔍 About to save: subreddit="${subreddit}", iconUrl="${iconUrl}"`);

                    // Cache it
                    await pool.query(`
                      INSERT INTO subreddit_icons (subreddit, icon_url, created_at)
                      VALUES ($1, $2, NOW())
                      ON CONFLICT (subreddit)
                      DO UPDATE SET icon_url = EXCLUDED.icon_url, created_at = NOW()
                  `, [subreddit, iconUrl]);

                    console.log(`💾 Saved icon for r/${subreddit}`);
                }
            } catch (err) {
                console.error(`❌ Failed to fetch icon for r/${subreddit}:`, err.message);
                icons[subreddit] = null;
            }
        }

        res.json(icons);
    } catch (error) {
        console.error('Icons route error:', error);
        res.status(500).json({ error: 'Failed to fetch icons' });
    }
});

app.get('/reddit', async (req, res) => {
    const encodedUrl = req.query.url;
    let decodedUrl = decodeURIComponent(encodedUrl);

    // Ensure it's a Reddit URL
    if (!decodedUrl.startsWith('https://www.reddit.com/')) {
        return res.status(200).send('Non-Reddit URL intercepted :3c');
    }

    // Check if this is a subreddit search request
    if (decodedUrl.includes('subreddits/search.json')) {
        const urlParams = new URL(decodedUrl, 'https://example.com').searchParams;
        const query = urlParams.get('q')?.trim().toLowerCase();
        console.log('🔍 Subreddit search query:', query);

        if (query) {
            try {
                const cachedResult = await pool.query(
                    "SELECT results FROM subreddit_search_cache WHERE query_term = $1",
                    [query]
                );

                if (cachedResult.rows.length > 0) {
                    console.log(`🚀 Cache hit for query: ${query}`);
                    return res.json(cachedResult.rows[0].results);
                }

                console.log("⚡ Fetching from Reddit because no cache hit");
            } catch (error) {
                console.error('Error checking cache:', error);
            }
        }
    }

    // Rewrite www to oauth
    decodedUrl = decodedUrl.replace('https://www.reddit.com', 'https://oauth.reddit.com');
    decodedUrl = decodedUrl.replace(/\.json\/?$/, '');

    try {
        const token = await getRedditAppToken();
        let response;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                // Add 10ms delay before Reddit API call
                await new Promise(resolve => setTimeout(resolve, 5));
                response = await dogFetch(decodedUrl, {
                    headers: {
                        ...headers,
                        'Authorization': `Bearer ${token}`,
                        'User-Agent': 'android:com.reddit.frontpage:v2023.10.0 (by /u/yourbot)'
                    }
                });
                break;
            } catch (error) {
                if (error.code === 'ECONNRESET' && attempt < 3) {
                    console.log(`ECONNRESET on attempt ${attempt}, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                throw error;
            }
        }

        if (response.status === 429) {
            const now = new Date().toLocaleTimeString();
            await pool.query(`
   INSERT INTO monitoring_logs (log_level, endpoint, error_message) 
   VALUES ($1, $2, $3)
`, ['warning', '/reddit', `Reddit API rate limit hit at ${now}`]);

            console.log('🚫 429 TOO MANY REQUESTS');
            return res.status(429).send('Rate limited by Reddit');
        }

        const data = await Promise.race([
            response.json(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('JSON parsing timeout')), 10000))
        ]);
        try {
            if (data?.data?.children?.length > 10) {
                data.data.children = data.data.children.slice(0, 10);
            }
        } catch (err) {
            console.log('❌ Error processing children array:', err.message);
        }

        // Cache subreddit search results
        if (encodedUrl.includes('subreddits/search.json')) {
            const urlParams = new URL(decodeURIComponent(encodedUrl), 'https://example.com').searchParams;
            const query = urlParams.get('q');

            if (query && data) {
                try {
                    const cleanedData = {
                        data: {
                            children: data.data.children
                                .filter(child => child && child.data && child.data.display_name)
                                .map(child => ({
                                    data: {
                                        id: child.data.id,
                                        display_name: child.data.display_name,
                                        url: child.data.url,
                                        name: child.data.name,
                                        community_icon: child.data.community_icon || null,
                                        mobile_banner_image: child.data.mobile_banner_image || null,
                                        icon_img: child.data.icon_img || null,
                                        header_img: child.data.header_img || null,
                                        banner_img: child.data.banner_img || null
                                    }
                                }))
                        }
                    };

                    await pool.query(
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

    } catch (err) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/reddit ECONNRESET', `${now} - ${err.message}`]);

        if (err.code === 'ECONNRESET') {
            console.error('❌ Reddit closed the connection after 3 attempts');
            return res.status(503).json({ error: 'Reddit connection lost. Please try again.' });
        }

        console.error('❌ Reddit proxy error:', err.message);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(500).json({ error: 'Failed to fetch Reddit content. ' + err.message });
    }
});

app.get('/search', async (req, res) => {
    const searchQuery = req.query.q;
    const subreddit = req.query.sub; 

    // Logging the search to the database
    try {
        if (searchQuery || subreddit) { 
            const existing = await pool.query(
                'SELECT id, score FROM search_suggestions WHERE query = $1 AND subreddit = $2',
                [searchQuery || '', subreddit || '']
            );

            if (existing.rows.length > 0) {
                // Update existing record
                await pool.query(
                    'UPDATE search_suggestions SET score = score + 1, updated_at = NOW() WHERE id = $1',
                    [existing.rows[0].id]
                );
            } else {
                // Insert new record
                await pool.query(
                    'INSERT INTO search_suggestions (query, subreddit, score, created_at, updated_at) VALUES ($1, $2, 1, NOW(), NOW())',
                    [searchQuery || '', subreddit || '']
                );
            }
        }
    } catch (err) {
        console.error('Failed to log search:', err);
    }


    try {
        // Build the Reddit URL with optional subreddit
        let redditUrl;
        if (subreddit && searchQuery) {
            // Search within specific subreddit
            redditUrl = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(searchQuery)}&sort=relevance&restrict_sr=1&limit=10`;
        } else if (subreddit && !searchQuery) {
            // Just get hot posts from subreddit
            redditUrl = `https://www.reddit.com/r/${subreddit}/hot.json?limit=10`;
        } else if (!subreddit && searchQuery) {
            // Search all of Reddit
            redditUrl = `https://www.reddit.com/r/all/search.json?q=${encodeURIComponent(searchQuery)}&sort=relevance&restrict_sr=0&limit=10`;
        } else {
            // Both empty - show r/all hot (front page)
            redditUrl = `https://www.reddit.com/r/all/hot.json?limit=10`;
        }

        const token = await getRedditAppToken();
        const oauthUrl = redditUrl.replace('https://www.reddit.com', 'https://oauth.reddit.com');
        // Add delay between Reddit requests
        await new Promise(resolve => setTimeout(resolve, 5));
        const response = await dogFetch(oauthUrl, {
            headers: {
                ...headers,
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'android:com.reddit.frontpage:v2023.10.0 (by /u/yourbot)'
            }
        });
        const redditData = await response.json();

        // Read your actual HTML file and modify it
        let html = fs.readFileSync(path.join(__dirname, '../html/karmafinder.html'), 'utf8');

        // Serve the assets folder for images
        app.use('/assets', express.static(path.join(__dirname, '../assets')));
        app.use('/assets/favicon-32x32.png', express.static(path.join(__dirname, '../assets/favicon-32x32.png')));

        // Set the sort dropdown to relevance for preloaded results
        html = html.replace(
            '<option value="relevance">Relevance</option>',
            '<option value="relevance" selected>Relevance</option>'
        );

        // Remove selected from hot
        html = html.replace(
            '<option value="hot" selected>Hot</option>',
            '<option value="hot">Hot</option>'
        );

        // Update the title and meta tags for SEO
        const titleText = subreddit
            ? `${searchQuery} in r/${subreddit} - KarmaFinder`
            : `${searchQuery} | KarmaFinder - Better than Reddit Search`;

        const descriptionText = subreddit
            ? `Reddit search results for '${searchQuery}' in r/${subreddit} - Find discussions and posts about ${searchQuery} in the ${subreddit} subreddit`
            : `Reddit search results for '${searchQuery}' - Find discussions, posts, and conversations about ${searchQuery} on Reddit`;

        html = html.replace(
            '<title>KarmaFinder - Better Reddit Search</title>',
            `<title>${titleText}</title>`
        );

        html = html.replace(
            '<meta name="description" content="Search Reddit like Google. Find exactly what you\'re looking for across any subreddit.">',
            `<meta name="description" content="${descriptionText}">`
        );

        // Inject the search data and query into the page
        const dataScript = `
    <script>
      window.preloadedSearchData = ${JSON.stringify(redditData)};
      window.preloadedQuery = "${searchQuery}";
      window.preloadedSubreddit = "${subreddit || ''}";
    </script>`;
        html = html.replace('</body>', dataScript + '</body>');

        // Update the search input to show the query
        html = html.replace(
            'placeholder="Search Reddit"',
            `placeholder="Search Reddit" value="${searchQuery}"`
        );

        res.send(html);
    } catch (err) {
        console.error('SEO search error:', err);
        res.status(500).send('Search failed: ' + err.message);
    }
});

app.get('/sitemap.xml', async (req, res) => {
    try {
        const searches = await pool.query(`
            SELECT DISTINCT query 
            FROM search_suggestions 
            WHERE query != '' AND query IS NOT NULL
            ORDER BY score DESC
        `);

        let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

        // Add your main pages
        sitemap += `
    <url>
        <loc>https://karmafinder.site</loc>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>`;

        // Add search URLs for each query
        searches.rows.forEach(row => {
            const encodedQuery = encodeURIComponent(row.query);
            sitemap += `
    <url>
        <loc>https://karmafinder.site/search?q=${encodedQuery}</loc>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>`;
        });

        sitemap += `
</urlset>`;

        res.set('Content-Type', 'text/xml');
        res.send(sitemap);
    } catch (error) {
        console.error('Sitemap error:', error);
        res.status(500).send('Error generating sitemap');
    }
});

app.get('/image', async (req, res) => {
    const imageUrl = decodeURIComponent(req.query.url);
    if (!imageUrl) return res.status(400).send('No image URL provided.');

    try {
        const imageHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/113.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.google.com/',
            'Connection': 'keep-alive',
        };

        const response = await fetch(imageUrl, {
            headers: imageHeaders,
            redirect: 'follow'
        });

        if (!response.ok) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            console.error(`[⚠️] Media source returned status ${response.status}: ${imageUrl}`);
            const body = await response.text();
            console.error('❌ Response body:', body.slice(0, 300));
            return res.status(response.status).send(`Source returned ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        const isAllowedMedia = contentType.startsWith('image/') || contentType.startsWith('video/');

        if (!isAllowedMedia) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            console.error('[⚠️] Unsupported media type:', contentType, '| URL:', imageUrl);
            return res.status(400).send('Unsupported media content.');
        }

        const mediaBuffer = await response.arrayBuffer();
        if (!mediaBuffer || mediaBuffer.byteLength === 0) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            console.warn('⚠️ Empty media buffer:', imageUrl);
            return res.status(500).send('Empty media data.');
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', mediaBuffer.byteLength);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        res.setHeader('ETag', `"${Date.now()}"`);

        res.send(Buffer.from(mediaBuffer));
    } catch (err) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/image', `${now} - ${err.message}`]);

        res.setHeader('Access-Control-Allow-Origin', '*');
        console.error('[🔥] Error fetching media:', err.message);
        res.status(500).send('Error fetching media: ' + err.message);
    }
});

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Endpoint to save posts from Reddit API
app.post('/api/save-posts', async (req, res) => {
    try {
  
        // Validate request has posts array
        const posts = req.body.posts;
        const pageGroup = req.body.page_group; // Get the page group token

        if (!posts || !Array.isArray(posts)) {
            console.error("Invalid posts data received:", req.body);
            return res.status(400).json({
                success: false,
                error: "Invalid request: posts array required"
            });
        }

        console.log(`Processing ${posts.length} posts for page group ${pageGroup}`);
        const savedIds = [];

        const connection = await pool.connect();
        try {

            await pool.query('DELETE FROM posts WHERE page_group = $1', [pageGroup]);
            await connection.query('BEGIN');

            for (let i = 0; i < posts.length; i++) {
                const post = posts[i];
                // Skip posts without data
                if (!post.data) {
                    console.log("Skipping post with no data");
                    continue;
                }

                const reddit_post_id = post.data.id;
                const position = post.data.position;
          
                // Safely stringify JSON objects - this is the key fix
                const galleryData = post.data.gallery_data ? JSON.stringify(post.data.gallery_data) : null;
                const mediaMetadata = post.data.media_metadata ? JSON.stringify(post.data.media_metadata) : null;
                const crosspostList = post.data.crosspost_parent_list ? JSON.stringify(post.data.crosspost_parent_list) : null;
                const preview = post.data.preview ? JSON.stringify(post.data.preview) : null;

                // Add page_group to your query
                const query = `
                    INSERT INTO posts (
                        reddit_post_id, title, url, permalink, subreddit, score,
                        is_video, domain, author, created_utc, num_comments,
                        over_18, selftext, body, is_gallery, gallery_data,
                        media_metadata, crosspost_parent_list, content_type,
                        icon_url, locked, stickied, preview, page_group, position
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
                    ON CONFLICT (reddit_post_id)
                    DO UPDATE SET
                        score = $6,
                        num_comments = $11,
                        indexed_at = CURRENT_TIMESTAMP,
                        position = $25,
                        page_group = $24,
                        content_type = $19
                    RETURNING reddit_post_id
                `;

                const values = [
                    reddit_post_id,
                    post.data.title,
                    post.data.url,
                    post.data.permalink,
                    post.data.subreddit,
                    post.data.score,
                    post.data.is_video,
                    post.data.domain,
                    post.data.author,
                    post.data.created_utc,
                    post.data.num_comments,
                    post.data.over_18,
                    post.data.selftext,
                    post.data.body,
                    post.data.is_gallery,
                    galleryData,
                    mediaMetadata,
                    crosspostList,
                    post.data.content_type,
                    post.data.icon_url,
                    post.data.locked,
                    post.data.stickied,
                    preview,
                    pageGroup,
                    position  
                ];

                const result = await connection.query(query, values);
                savedIds.push(result.rows[0].reddit_post_id);
            }

            await connection.query('COMMIT');

            // Send a simple success response
            console.log("Successfully saved posts, sending response");
            return res.json({ success: true, savedIds });

        } catch (e) {
            await connection.query('ROLLBACK');
            console.error("Database transaction error:", e);
            throw e;
        } finally {
            connection.release();
            console.log("Connection released");
        }
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/save-posts', `${now} - ${error.message}`]);

        console.error('Error saving posts:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint to get all stored posts from database
app.get('/api/db-posts', async (req, res) => {
    try {
        const {
            after,
            limit = 10,
            subreddit = 'all',
            query: searchQuery = '',
            contentType = 'all',
            sort = 'hot',
            time = 'all'
        } = req.query;

        const formattedAfter = after
            ? (after.startsWith('t3_') ? after : 't3_' + after)
            : 'page_1';

        const pageGroup = buildCacheKey(formattedAfter, {
            subreddit,
            sort,
            query: searchQuery,
            time
        });

        console.log(`Looking for page group: ${pageGroup}`);

        if (pageGroup) {
            // Look for posts with this exact page group
            const pageQuery = `
    SELECT * FROM posts
    WHERE page_group = $1
    ORDER BY position ASC
`;
            const pageParams = [pageGroup];
            const pageResult = await pool.query(pageQuery, pageParams);

            if (
                pageResult.rows.length > 0 &&
                pageResult.rows[0].page_group === pageGroup &&
                pageResult.rows.length === 10
            ) {
                console.log(`✅ Found full page group ${pageGroup} with 10 valid posts`);

                console.log("DB rows content_type values:", pageResult.rows.map(p => p.content_type));

                // Format response like Reddit API
                const response = {
                    data: {
                        children: pageResult.rows.map(post => ({
                            data: {
                                id: post.reddit_post_id,
                                title: post.title,
                                url: post.url,
                                permalink: post.permalink,
                                subreddit: post.subreddit,
                                score: post.score,
                                is_video: post.is_video,
                                domain: post.domain,
                                author: post.author,
                                created_utc: post.created_utc,
                                num_comments: post.num_comments,
                                over_18: post.over_18,
                                selftext: post.selftext,
                                body: post.body,
                                is_gallery: post.is_gallery,
                                gallery_data: post.gallery_data,
                                media_metadata: post.media_metadata,
                                crosspost_parent_list: post.crosspost_parent_list || [],
                                is_self: post.is_self,
                                post_hint: post.post_hint,
                                preview: post.preview,
                                locked: post.locked,
                                stickied: post.stickied,
                                content_type: post.content_type
                            }
                        })),
                        after: pageResult.rows.length > 0
                            ? (pageResult.rows[pageResult.rows.length - 1].reddit_post_id.startsWith('t3_')
                                ? pageResult.rows[pageResult.rows.length - 1].reddit_post_id
                                : 't3_' + pageResult.rows[pageResult.rows.length - 1].reddit_post_id)
                            : null,
                        before: null
                    }
                };
                console.log("🔎 Final response content_types:", response.data.children.map(p => p.data.content_type));

                return res.json(response);
            }
  
            console.log(`No complete page group found for ${pageGroup}, falling back to empty response`);

            // Return empty response to trigger Reddit API fetch
            return res.json({
                data: {
                    children: [],
                    after: null,
                    before: null
                }
            });
        }

    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/db-posts', `${now} - ${error.message}`]);

        console.error('Error in db-posts endpoint:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/suggestions?q=claude&subreddit=Art&limit=10
app.get('/api/suggestions', async (req, res) => {
    const { q, subreddit, limit = 6 } = req.query;

    let query = `
    SELECT query, subreddit, score 
    FROM search_suggestions 
    WHERE query ILIKE $1
  `;
    let params = [`${q}%`];

    // If they're searching within a specific subreddit
    if (subreddit) {
        query += ` AND subreddit = $2`;
        params.push(subreddit);
    }

    query += ` ORDER BY score DESC, query ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    const suggestions = await pool.query(query, params);
    res.json(suggestions.rows);
});

// POST /api/suggestions/select
app.post('/api/suggestions/store', async (req, res) => {
    const { query, subreddit } = req.body;

    await pool.query('SELECT increment_suggestion_score($1, $2)', [query.toLowerCase(), subreddit || null]);
    
    res.json({ success: true });
});

// Pull top queries on click
app.get('/api/top-searches', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT query, subreddit, score
            FROM search_suggestions 
            ORDER BY score DESC 
            LIMIT 6
        `);
        res.json(result.rows);
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/suggestions', `${now} - ${error.message}`]);

        res.status(500).json({ error: error.message });
    }
});

// GET /api/get-comments/:permalink
app.get('/api/get-comments/:permalink(*)', async (req, res) => {
    try {
        const { permalink } = req.params;

        if (!permalink || (!permalink.startsWith('/r/') && !permalink.startsWith('r/'))) {
            return res.status(400).json({ error: 'Invalid permalink' });
        }

        const normalizedPermalink = permalink.startsWith('/r/') ? permalink : '/' + permalink;

        const query = `
            SELECT reddit_comment_id, author, body, score, created_utc, position, post_total_comments, is_stickied
            FROM comments
            WHERE post_permalink = $1
            ORDER BY position ASC
            LIMIT 40
        `;

        const result = await pool.query(query, [normalizedPermalink]);

        if (result.rows.length > 0) {
            console.log(`✅ Found ${result.rows.length} cached comments for ${normalizedPermalink}`);
            return res.json({
                success: true,
                comments: result.rows,
                cached: true,
                post_total_comments: result.rows[0]?.post_total_comments,
                is_stickied: result.rows[0]?.is_stickied
            });
        }

        console.log(`❌ No cached comments found for ${normalizedPermalink}`);
        return res.json({
            success: true,
            comments: [],
            cached: false
        });

    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/get-comments', `${now} - ${error.message}`]);

        console.error('Error getting comments:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/save-comments
app.post('/api/save-comments', async (req, res) => {
    try {
        const { permalink, comments, total_comments, is_stickied } = req.body;
        if (!permalink || !comments || !Array.isArray(comments)) {
            return res.status(400).json({
                success: false,
                error: "Invalid request: permalink and comments array required"
            });
        }
        console.log(`Processing ${comments.length} comments for ${permalink}`);
        const savedIds = [];

        try {
            await pool.query('DELETE FROM comments WHERE post_permalink = $1', [permalink]);
            await pool.query('BEGIN');

            for (let i = 0; i < comments.length; i++) {
                const comment = comments[i];
                if (!comment.author || !comment.body) {
                    console.log("Skipping comment with missing data");
                    continue;
                }
                const query = `
                    INSERT INTO comments (
                        post_permalink, reddit_comment_id, author, body,
                        score, created_utc, position, post_total_comments, is_stickied
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING id
                `;
                const values = [
                    permalink,
                    comment.id || null,
                    comment.author,
                    comment.body,
                    comment.score || 0,
                    comment.created_utc || 0,
                    i,
                    total_comments || null,
                    is_stickied || false
                ];
                const result = await pool.query(query, values);
                savedIds.push(result.rows[0].id);
            }
            await pool.query('COMMIT');
            console.log(`✅ Successfully saved ${savedIds.length} comments`);
            return res.json({
                success: true,
                savedCount: savedIds.length
            });
        } catch (e) {
            await pool.query('ROLLBACK');
            console.error("Database transaction error:", e);
            throw e;
        }
    } catch (error) { 
        const now = new Date().toLocaleTimeString(); 
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/save-comments', `${now} - ${error.message}`]);

        console.error('Error saving comments:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// 1. Add a bookmark
app.post('/api/bookmarks', async (req, res) => {
    try {
        const {
            postId,
            stripeCustomerId,
            title,
            url,
            permalink,
            subreddit,
            score,
            is_video,
            domain,
            author,
            created_utc,
            num_comments,
            over_18,
            selftext,
            body,
            is_gallery,
            gallery_data,
            media_metadata,
            crosspost_parent_list,
            content_type,
            icon_url,
            locked,
            stickied,
            preview
        } = req.body;

        const defaultSectionResult = await pool.query(
            'SELECT id FROM sections WHERE user_id = $1 ORDER BY sort_order ASC LIMIT 1',
            [stripeCustomerId]
        );
        const sectionId = defaultSectionResult.rows[0]?.id;

        if (!sectionId) {
            return res.status(400).json({ success: false, error: 'Default section not found' });
        }

        if (!stripeCustomerId) {
            return res.status(400).json({ success: false, error: 'Missing customer ID' });
        }

        if (!postId) {
            return res.status(400).json({ success: false, error: 'Missing post ID' });
        }

        // Stringify JSON fields 
        const galleryData = (gallery_data && gallery_data !== null && Object.keys(gallery_data || {}).length > 0) ? JSON.stringify(gallery_data) : null;
        const mediaMetadata = (media_metadata && media_metadata !== null && Object.keys(media_metadata || {}).length > 0) ? JSON.stringify(media_metadata) : null;
        const crosspostList = (crosspost_parent_list && crosspost_parent_list !== null && crosspost_parent_list.length > 0) ? JSON.stringify(crosspost_parent_list) : null;
        const previewData = (preview && preview !== null && Object.keys(preview || {}).length > 0) ? JSON.stringify(preview) : null;

        // Get the next sort_order for this section
        const maxSortResult = await pool.query(
            'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_sort_order FROM bookmarks WHERE user_id = $1 AND section_id = $2',
            [stripeCustomerId, sectionId]
        );
        const nextSortOrder = maxSortResult.rows[0].next_sort_order;

        // Insert bookmark
        await pool.query(
            `INSERT INTO bookmarks (
                user_id, reddit_post_id, title, url, permalink, subreddit, score,
                is_video, domain, author, created_utc, num_comments, over_18,
                selftext, body, is_gallery, gallery_data, media_metadata,
                crosspost_parent_list, content_type, icon_url, locked, stickied, preview, section_id, sort_order
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
            ON CONFLICT (user_id, reddit_post_id) DO NOTHING`,
            [
                stripeCustomerId, postId, title, url, permalink, subreddit, score,
                is_video, domain, author, created_utc, num_comments, over_18,
                selftext, body, is_gallery, galleryData, mediaMetadata,
                crosspostList, content_type, icon_url, locked, stickied, previewData, sectionId, nextSortOrder
            ]
        );

        res.json({ success: true, message: 'Bookmark added' });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/bookmarks', `${now} - ${error.message}`]);

        console.error('Error adding bookmark:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Remove a bookmark
app.delete('/api/bookmarks/:stripeCustomerId/:reddit_post_id', async (req, res) => {
    try {
        const { stripeCustomerId, reddit_post_id } = req.params;

        if (!stripeCustomerId) {
            return res.status(400).json({ success: false, error: 'Missing customer ID' });
        }

        if (!reddit_post_id) {
            return res.status(400).json({ success: false, error: 'Missing post ID' });
        }

        // Delete bookmark
        await pool.query(
            'DELETE FROM bookmarks WHERE user_id = $1 AND reddit_post_id = $2',
            [stripeCustomerId, reddit_post_id]
        );

        res.json({ success: true, message: 'Bookmark removed' });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/bookmarks/:stripeCustomerId/:reddit_post_id', `${now} - ${error.message}`]);

        console.error('Error removing bookmark:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Get all bookmarks for a user
app.get('/api/bookmarks/:stripeCustomerId', async (req, res) => {
    try {
        const { stripeCustomerId } = req.params;
        const { offset = 0, limit = 10 } = req.query; 

        const result = await pool.query(`
            SELECT id, reddit_post_id, title, url, permalink, subreddit, score,
                   is_video, domain, author, created_utc, num_comments, over_18,
                   selftext, body, is_gallery, gallery_data, media_metadata,
                   crosspost_parent_list, content_type, icon_url, locked, stickied, preview
            FROM bookmarks
            WHERE user_id = $1
            ORDER BY sort_order ASC, created_at DESC
            LIMIT $2 OFFSET $3
        `, [stripeCustomerId, parseInt(limit), parseInt(offset)]); 

        res.json({ bookmarks: result.rows });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/bookmarks/:stripeCustomerId', `${now} - ${error.message}`]);

        console.error('GET bookmarks error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4b. Get bookmarks for a user by section 
app.get('/api/bookmarks/:stripeCustomerId/section/:sectionId', async (req, res) => {
    try {
        const { stripeCustomerId, sectionId } = req.params;
        const { offset = 0, limit = 10 } = req.query;

        console.log('userId:', stripeCustomerId, 'sectionId:', sectionId, 'limit:', limit, 'offset:', offset);

        const result = await pool.query(`
           SELECT id, reddit_post_id, title, url, permalink, subreddit, score,
                  is_video, domain, author, created_utc, num_comments, over_18,
                  selftext, body, is_gallery, gallery_data, media_metadata,
                  crosspost_parent_list, content_type, icon_url, locked, stickied, preview
           FROM bookmarks
           WHERE user_id = $1 AND section_id = $2
           ORDER BY sort_order ASC, created_utc ASC, reddit_post_id
           LIMIT $3 OFFSET $4
       `, [stripeCustomerId, parseInt(sectionId), parseInt(limit), parseInt(offset)]);

        console.log('Returned bookmarks:', result.rows.length);

        res.json({ bookmarks: result.rows });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/bookmarks/:stripeCustomerId/section/:sectionId', `${now} - ${error.message}`]);

        console.error('GET bookmarks by section error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Reorder bookmarks
app.post('/api/bookmarks/:stripeCustomerId/reorder', async (req, res) => {
    try {
        const { stripeCustomerId } = req.params;
        const { orderedIds, sectionId } = req.body;

        if (!orderedIds || !Array.isArray(orderedIds)) {
            return res.status(400).json({ success: false, error: 'Invalid ordered IDs' });
        }

        // Update each bookmark with its new position WITHIN THE SECTION
        for (let i = 0; i < orderedIds.length; i++) {
            await pool.query(
                'UPDATE bookmarks SET sort_order = $1 WHERE user_id = $2 AND reddit_post_id = $3 AND section_id = $4',
                [i, stripeCustomerId, orderedIds[i], sectionId]  
            );
        }

        console.log(`Updated sort order for section ${sectionId}:`, orderedIds.map((id, i) => `${id}=${i}`));

        res.json({ success: true, message: 'Bookmark order updated' });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/bookmarks/:stripeCustomerId/reorder', `${now} - ${error.message}`]);

        console.error('Error updating bookmark order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 6. Get all sections for a user
app.get('/api/bookmarks/:userId/sections', async (req, res) => {
    try {
        const { userId } = req.params;

        const result = await pool.query(`
            SELECT id, name, sort_order, 
                   (SELECT COUNT(*) FROM bookmarks WHERE section_id = sections.id) as count
            FROM sections 
            WHERE user_id = $1
            ORDER BY sort_order
        `, [userId]);

        res.json({ sections: result.rows });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/bookmarks/:userId/sections', `${now} - ${error.message}`]);

        console.error('Error fetching sections:', error);
        res.status(500).json({ error: 'Failed to fetch sections' });
    }
});

// 7. Move bookmark to different section
app.put('/api/bookmarks/:bookmarkId/section', async (req, res) => {
    try {
        const { bookmarkId } = req.params;
        const { sectionId } = req.body;
        await pool.query(`
            UPDATE bookmarks
            SET section_id = $1
            WHERE reddit_post_id = $2
        `, [sectionId, bookmarkId]); // Remove sort_order = 1
        res.json({ success: true });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/bookmarks/:bookmarkId/section', `${now} - ${error.message}`]);

        console.error('Error updating bookmark section:', error);
        res.status(500).json({ error: 'Failed to update section' });
    }
});

// SECTION ENDPOINTS

// Get all sections for a user
app.get('/api/sections/:stripeCustomerId', async (req, res) => {
    try {
        const { stripeCustomerId } = req.params;

        const result = await pool.query(`
            SELECT id, name, emoji, sort_order, created_at
            FROM sections
            WHERE user_id = $1
            ORDER BY sort_order ASC
        `, [stripeCustomerId]);

        res.json({ sections: result.rows });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/sections/:stripeCustomerId', `${now} - ${error.message}`]);

        console.error('GET sections error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create new section
app.post('/api/sections/:stripeCustomerId', async (req, res) => {
    try {
        const { stripeCustomerId } = req.params;
        const { name = 'New Section' } = req.body;

        // Get the next sort_order
        const maxSortResult = await pool.query(`
            SELECT COALESCE(MAX(sort_order), 0) + 1 as next_sort_order
            FROM sections
            WHERE user_id = $1
        `, [stripeCustomerId]);

        const nextSortOrder = maxSortResult.rows[0].next_sort_order;

        // Insert new section
        const result = await pool.query(`
            INSERT INTO sections (user_id, name, sort_order)
            VALUES ($1, $2, $3)
            RETURNING id, name, sort_order, created_at
        `, [stripeCustomerId, name, nextSortOrder]);

        res.json({ section: result.rows[0] });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/sections/:stripeCustomerId', `${now} - ${error.message}`]);

        console.error('POST sections error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/sections/:userId/:sectionId', async (req, res) => {
    const { userId, sectionId } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get the sort_order of the section to delete
        const { rows } = await client.query(
            'SELECT sort_order FROM sections WHERE id = $1 AND user_id = $2',
            [sectionId, userId]
        );

        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Section not found' });
        }

        const deletedSortOrder = rows[0].sort_order;

        // 2. Delete bookmarks in that section (optional if foreign key has ON DELETE CASCADE)
        await client.query(
            'DELETE FROM bookmarks WHERE section_id = $1 AND user_id = $2',
            [sectionId, userId]
        );

        // 3. Delete the section
        await client.query(
            'DELETE FROM sections WHERE id = $1 AND user_id = $2',
            [sectionId, userId]
        );

        // 4. Update sort_order for remaining sections
        await client.query(
            `UPDATE sections
             SET sort_order = sort_order - 1
             WHERE user_id = $1 AND sort_order > $2`,
            [userId, deletedSortOrder]
        );

        await client.query('COMMIT');
        res.json({ message: 'Section deleted and sort order updated' });

    } catch (err) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/sections/:userId/:sectionId', `${now} - ${err.message}`]);

        await client.query('ROLLBACK');
        console.error('❌ Error deleting section:', err);
        res.status(500).json({ message: 'Internal server error' });
    } finally {
        client.release();
    }
});

// PUT /api/sections/:userId/:sectionId
app.put('/api/sections/:userId/:sectionId', async (req, res) => {
    try {
        const { userId, sectionId } = req.params;
        const { name, emoji } = req.body;

        // Build dynamic query based on what fields are provided
        let query, values;

        if (name && emoji) {
            query = `UPDATE sections SET name = $1, emoji = $2 WHERE id = $3 AND user_id = $4 RETURNING id, name, emoji`;
            values = [name.trim(), emoji, sectionId, userId];
        } else if (name) {
            query = `UPDATE sections SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING id, name, emoji`;
            values = [name.trim(), sectionId, userId];
        } else if (emoji) {
            query = `UPDATE sections SET emoji = $1 WHERE id = $2 AND user_id = $3 RETURNING id, name, emoji`;
            values = [emoji, sectionId, userId];
        } else {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Section not found' });
        }

        console.log(`✅ Updated section ${sectionId} for user ${userId}:`, result.rows[0]);
        res.json({ success: true, section: result.rows[0] });

    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/sections/:userId/:sectionId', `${now} - ${error.message}`]);

        console.error('Error updating section:', error);
        res.status(500).json({ error: error.message });
    }
});

const { spawn } = require('child_process');
const tempDir = path.join(__dirname, 'temp');

// Make sure tempDir exists
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Serve combined videos
app.use('/temp', express.static(tempDir));
app.get('/api/reddit-video/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const outputFileName = `combined_${videoId}.mp4`;
        const outputPath = path.join(tempDir, outputFileName);

        if (await fs.promises.access(outputPath).then(() => true).catch(() => false)) {
            console.log(`✅ Already exists: ${outputFileName}`);
            return res.json({ success: true, videoUrl: `/temp/${outputFileName}` });
        }

        console.log(`🎬 Processing ${videoId}...`);

        // Find working video URL
        const videoQualities = ['480', '720', '360', '240'];
        let videoUrl = null;
        for (const q of videoQualities) {
            const testUrl = `https://v.redd.it/${videoId}/DASH_${q}.mp4`;
            try {
                const r = await fetch(testUrl, { method: 'HEAD' });
                if (r.ok) {
                    videoUrl = testUrl;
                    break;
                }
            } catch (e) { /* skip */ }
        }

        if (!videoUrl) return res.status(404).json({ error: 'No video found' });

        // Check for audio with different bitrates
        const audioBitrates = ['128', '64', '256'];
        let audioUrl = null;

        for (const bitrate of audioBitrates) {
            const testAudioUrl = `https://v.redd.it/${videoId}/DASH_AUDIO_${bitrate}.mp4`;
            console.log(`🔊 Trying audio bitrate: ${bitrate}...`);
            try {
                const audioCheck = await fetch(testAudioUrl, { method: 'HEAD' });
                if (audioCheck.ok) {
                    console.log(`✅ Found working audio: ${bitrate}kbps`);
                    audioUrl = testAudioUrl;
                    break;
                } else {
                    console.log(`❌ Audio ${bitrate} failed`);
                }
            } catch (e) {
                console.log(`❌ Audio ${bitrate} failed`);
            }
        }

        // Try HLS if no DASH audio found
        if (!audioUrl) {
            console.log(`🔄 Trying HLS stream...`);
            const hlsUrl = `https://v.redd.it/${videoId}/HLSPlaylist.m3u8?f=sd%2CsubsAll%2ChlsSpecOrder&v=1&a=1753933930%2CMmVhZGMxNTRiNDA5Y2M2YmIyY2NmMmI5YmQ4ZmVkMmNiOGU3ZTEyYzdlMTc2ODQ3NDNhZGUwYmZlYTZkOTJlMQ%3D%3D`;
            try {
                const hlsCheck = await fetch(hlsUrl, { method: 'HEAD' });
                if (hlsCheck.ok) {
                    console.log(`✅ Found HLS stream with audio, copying...`);
                    await copyVideoOnly(hlsUrl, outputPath); // copies the full HLS stream
                    console.log(`✅ Done: ${outputFileName}`);
                    return res.json({ success: true, videoUrl: `/temp/${outputFileName}` });
                }
            } catch (e) {
                console.log(`❌ HLS failed too`);
            }
        }

        // Combine or copy based on what we found
        if (audioUrl) {
            await combineWithFfmpeg(videoUrl, audioUrl, outputPath);
        } else {
            console.log(`📹 No audio available, copying video only...`);
            await copyVideoOnly(videoUrl, outputPath);
        }

        console.log(`✅ Done: ${outputFileName}`);
        res.json({ success: true, videoUrl: `/temp/${outputFileName}` });

        // Auto delete after 7 minutes
        scheduleFileDeletion(outputPath, outputFileName);

    } catch (err) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/reddit-video/:videoId', `${now} - ${err.message}`]);

        console.error('❌ Error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

function copyVideoOnly(videoUrl, outputPath) {
    return new Promise((resolve, reject) => {
        const args = [
            '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            '-headers', 'Referer: https://www.reddit.com/',
            '-i', videoUrl,
            '-c', 'copy',
            '-y',
            outputPath
        ];

        const ff = spawn('ffmpeg', args);

        // ADD TIMEOUT
        const timeout = setTimeout(() => {
            ff.kill('SIGKILL');
            reject(new Error('FFmpeg timeout after 60 seconds'));
        }, 60000);

        ff.stderr.on('data', d => process.stdout.write(d.toString()));
        ff.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
        ff.on('close', code => {
            clearTimeout(timeout);
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg exited with code ${code}`));
        });
    });
}

function combineWithFfmpeg(videoUrl, audioUrl, outputPath) {
    return new Promise((resolve, reject) => {
        const args = [
            '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            '-headers', 'Referer: https://www.reddit.com/',
            '-i', videoUrl,
            '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            '-headers', 'Referer: https://www.reddit.com/',
            '-i', audioUrl,
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-shortest',
            '-y',
            outputPath
        ];

        const ff = spawn('ffmpeg', args);

        // ADD TIMEOUT
        const timeout = setTimeout(() => {
            ff.kill('SIGKILL');
            reject(new Error('FFmpeg timeout after 60 seconds'));
        }, 60000);

        ff.stderr.on('data', d => process.stdout.write(d.toString()));
        ff.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
        ff.on('close', code => {
            clearTimeout(timeout);
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg exited with code ${code}`));
        });
    });
}

app.get('/api/subscription/:email', async (req, res) => {
    try {
        const { email } = req.params;

        const subscriptionResult = await pool.query(`
            SELECT user_id, plan_type 
            FROM subscriptions 
            WHERE email = $1
        `, [email]);

        const hasSubscription = subscriptionResult.rows.length > 0;
        const planType = hasSubscription ? subscriptionResult.rows[0].plan_type : null;
        const userId = hasSubscription ? subscriptionResult.rows[0].user_id : null;

        res.json({
            success: true,
            hasSubscription,
            planType,
            userId
        });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/subscription/:email', `${now} - ${error.message}`]);

        console.error('Error fetching subscription:', error);
        res.status(500).json({ error: 'Failed to fetch subscription data' });
    }
});

app.post('/api/auth/magic-link', async (req, res) => {
    const { email, redirect } = req.body;

    try {
        // Check if email exists in subscriptions table
        const emailCheck = await pool.query(`
            SELECT email FROM subscriptions WHERE email = $1
        `, [email]);

        if (emailCheck.rows.length === 0) {
            return res.status(404).json({ error: 'No account found with this email address.' });
        }

        // Generate token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // 20 minutes

        // Save token to database
        await pool.query(`
           INSERT INTO magic_links (email, token, expires_at)
           VALUES ($1, $2, $3)
       `, [email, token, expiresAt]);

        console.log('Token saved to database');

        // Build magic link URL with optional redirect
        let magicLinkUrl = `http://127.0.0.1:5500/html/karmafinder.html?token=${token}`;
        if (redirect) {
            magicLinkUrl += `&redirect=${redirect}`;
        }

        // Send email
        await resend.emails.send({
            from: 'login@karmafinder.site',
            to: email,
            subject: 'Log in to KarmaFinder',
            html: `
               <p>Click the link below to log in:</p>
               <a href="${magicLinkUrl}">Log in to KarmaFinder</a>
               <p>This link expires in 20 minutes.</p>
           `
        });

        console.log('Email sent successfully');
        res.json({ success: true });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/auth/magic-link', `${now} - ${error.message}`]);

        console.error(error);
        res.status(500).json({ error: 'Failed to send magic link' });
    }
});

app.post('/api/auth/verify/:token', async (req, res) => {
    const { token } = req.params;
    try {
        // Check if token exists and is valid
        const result = await pool.query(`
            SELECT email FROM magic_links
            WHERE token = $1
            AND expires_at > NOW()
            AND used = FALSE
        `, [token]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired link' });
        }

        const email = result.rows[0].email;

        // Check subscription status
        const subscriptionResult = await pool.query(`
            SELECT user_id, plan_type 
            FROM subscriptions 
            WHERE email = $1
        `, [email]);

        const hasSubscription = subscriptionResult.rows.length > 0;
        const planType = hasSubscription ? subscriptionResult.rows[0].plan_type : null;
        const userId = hasSubscription ? subscriptionResult.rows[0].user_id : null;

        // Mark token as used
        await pool.query(`
            UPDATE magic_links SET used = TRUE WHERE token = $1
        `, [token]);

        // Create session/JWT
        const sessionToken = jwt.sign({ email }, JWT_SECRET);

        res.json({
            success: true,
            sessionToken,
            email,
            hasSubscription,
            planType,
            userId
        });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/auth/verify/:token', `${now} - ${error.message}`]);

        console.error(error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

app.post('/api/auto-login-after-payment', async (req, res) => {
    try {
        const { session_id } = req.body;

        // Get session from Stripe to find the email
        const session = await stripe.checkout.sessions.retrieve(session_id);
        const customer = await stripe.customers.retrieve(session.customer);
        const email = customer.email;

        // Get subscription data from your database
        const subscriptionResult = await pool.query(`
            SELECT user_id, plan_type 
            FROM subscriptions 
            WHERE email = $1
        `, [email]);

        if (subscriptionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Subscription not found' });
        }

        const subscription = subscriptionResult.rows[0];

        // Send welcome email
        let subject, greeting;
        if (subscription.plan_type === 'pro') {
            subject = 'Welcome to KarmaFinder Pro!';
            greeting = 'Your Pro account is ready!';
        } else {
            subject = 'Welcome to KarmaFinder Premium!';
            greeting = 'Your premium account is ready!';
        }

        await resend.emails.send({
            from: 'welcome@karmafinder.site',
            to: email,
            subject: subject,
            html: `
       <h2>${greeting}</h2>
       <p>Thanks for supporting KarmaFinder! You now have access to Enhanced Search, unlimited bookmarks, and themes.</p>
       <p><a href="${req.headers.origin}/html/karmafinder.html">Start searching</a></p>
       <p>Questions? Just reply to this email.</p>
   `
        });
        
        res.json({
            success: true,
            email: email,
            hasSubscription: true,
            planType: subscription.plan_type,
            userId: subscription.user_id
        });

    } catch (error) {
        console.error('Auto-login error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/create-checkout', async (req, res) => {
    try {
        const { type, email } = req.body;

        if (email) {
            const existingSubscription = await pool.query(`
                SELECT plan_type FROM subscriptions WHERE email = $1
            `, [email]);

            if (existingSubscription.rows.length > 0) {
                const customer = await stripe.customers.list({
                    email: email,
                    limit: 1
                });

                if (customer.data.length > 0) {
                    const session = await stripe.billingPortal.sessions.create({
                        customer: customer.data[0].id,
                        return_url: `${req.headers.origin}/html/features.html`,
                    });

                    return res.json({ url: session.url, isPortal: true });
                }
            }
        }

        const sessionData = {
            payment_method_types: ['card'],
            line_items: [{
                price: 'price_1RhNDFD1lLWsoPSHMdd7uPvD',
                quantity: 1,
            }],
            mode: 'subscription',
            success_url: `${req.headers.origin}/html/karmafinder.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/html/features.html`,
        };
        const session = await stripe.checkout.sessions.create(sessionData);
        res.json({ url: session.url });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/create-checkout', `${now} - ${error.message}`]);

        console.error('Checkout error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/create-checkout-pro', async (req, res) => {
    try {
        const { type, email } = req.body;

        if (email) {
            const existingSubscription = await pool.query(`
                SELECT plan_type FROM subscriptions WHERE email = $1
            `, [email]);

            if (existingSubscription.rows.length > 0) {
                const customer = await stripe.customers.list({
                    email: email,
                    limit: 1
                });

                if (customer.data.length > 0) {
                    const session = await stripe.billingPortal.sessions.create({
                        customer: customer.data[0].id,
                        return_url: `${req.headers.origin}/html/features.html`,
                    });

                    return res.json({ url: session.url, isPortal: true });
                }
            }
        }

        const sessionData = {
            payment_method_types: ['card'],
            line_items: [{
                price: 'price_1RhNE2D1lLWsoPSHJq3zAUpc',
                quantity: 1,
            }],
            mode: 'subscription',
            success_url: `${req.headers.origin}/html/karmafinder.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/html/features.html`,
        };
        const session = await stripe.checkout.sessions.create(sessionData);
        res.json({ url: session.url });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/create-checkout-pro', `${now} - ${error.message}`]);

        console.error('Pro checkout error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/rare-line', (req, res) => {
    const rareChance = Math.random();
    if (rareChance < 0.001) {
        const randomChoice = Math.random();
        if (randomChoice < 0.7) {
            const randomLines = [1, 2, 3, 4, 8, 9]; // Added 9 for Whitney Houston line
            const selectedLine = randomLines[Math.floor(Math.random() * randomLines.length)];
            const line = process.env[`HERMES_RARE_LINE_${selectedLine}`];
            res.json({ line: line });
        } else {
            res.json({
                sequential: [
                    process.env.HERMES_RARE_LINE_5,
                    process.env.HERMES_RARE_LINE_6,
                    process.env.HERMES_RARE_LINE_7
                ]
            });
        }
    } else {
        res.json({ line: null });
    }
});

// 🔁 START SERVER LOGIC
async function startServer() {
    const token = await getRedditAppToken();
    console.log('✅ Reddit app token fetched:', token.slice(0, 12), '...');

    app.listen(PORT, () => {
        console.log(`🚀 FETCH server running at http://localhost:${PORT}`);

        // Start system monitoring AFTER server is running
        setInterval(logSystemHealth, 5 * 60 * 1000);
        console.log('💓 System health monitoring started');
    });
}

async function logSystemHealth() {
    let cpuUsage = 0;
    try {
        const cpuOutput = execSync('wmic cpu get loadpercentage /value', { encoding: 'utf8' });
        const match = cpuOutput.match(/LoadPercentage=(\d+)/);
        cpuUsage = match ? parseInt(match[1]) : 0;
    } catch (err) {
        cpuUsage = 0;
    }

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = ((totalMem - freeMem) / totalMem) * 100;
    const now = new Date().toLocaleTimeString();

    await pool.query(`
       INSERT INTO monitoring_logs (log_level, endpoint, error_message)
       VALUES ($1, $2, $3)
   `, ['info', '/system', `${now} - CPU: ${cpuUsage}%, Memory: ${memUsage.toFixed(1)}%`]);
}

// Memory monitoring and cleanup
setInterval(() => {
    const memUsage = process.memoryUsage();
    const memoryInMB = {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
    };

    // Alert if memory usage is too high
    if (memoryInMB.heapUsed > 300) { // 300MB threshold
        console.warn('⚠️ High memory usage detected!', memoryInMB);

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
            console.log('🧹 Forced garbage collection');
        }
    }
}, 2 * 60 * 1000); // Check every 2 minutes

startServer();