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
const os = require('os');
const app = express();

const API_BASE = 'http://localhost:3000';

app.use(cors({
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    origin: '*',
    credentials: false,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Serve static frontend files from html folder 
app.use(express.static(path.join(__dirname, '../')));

// Serve assets
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// Serve video files
app.use('/temp', express.static(path.join(__dirname, 'temp')));

// Serve index.html for homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.get('/share/:shareCode', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

const { execSync } = require('child_process');
const { scheduleFileDeletion } = require('./cron-cleanup.js');
const { pool } = require('./db');
const redis = require('redis');

const redisClient = redis.createClient({
    url: `redis://default:${process.env.REDIS_API_KEY}@${process.env.REDIS_ENDPOINT}`
});

redisClient.on('error', (err) => {
    console.error('❌ Redis connection error:', err);
});

redisClient.on('connect', () => {
    console.log('✅ Connected to Redis');
});

// Connect to Redis
redisClient.connect();

// RedGifs token management
let redgifsToken = null;
let redgifsTokenExpiry = 0;

async function getRedGifsToken() {
    // Check if we have a valid token
    if (redgifsToken && Date.now() < redgifsTokenExpiry) {
        return redgifsToken;
    }

    try {
        console.log('🔑 Fetching new RedGifs token...');
        const response = await fetch('https://api.redgifs.com/v2/auth/temporary');
        const data = await response.json();

        if (data.token) {
            redgifsToken = data.token;
            // Token expires in 24 hours, refresh after 23 hours to be safe
            redgifsTokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
            console.log('✅ Got RedGifs token:', redgifsToken.slice(0, 16) + '...');
            return redgifsToken;
        } else {
            console.error('❌ Failed to get RedGifs token:', data);
            return null;
        }
    } catch (error) {
        console.error('❌ RedGifs token fetch error:', error.message);
        return null;
    }
}

// Redis helper functions for progressive search caching
function buildRedisKey(subreddit, sort, query, time, contentType, afterToken, postId = null) {
    const encode = str => encodeURIComponent(str || '');

    // If this is a comment request, build a unique key with post ID
    if (postId) {
        return `reddit:comments:${encode(subreddit)}__${encode(postId)}`;
    }

    // Original key format for regular searches
    return `reddit:batch:${encode(subreddit || 'all')}__${encode(sort)}__${encode(query)}__${encode(time)}__${encode(contentType)}__${encode(afterToken || 'null')}`;
}

async function getCachedBatch(subreddit, sort, query, time, contentType, afterToken, postId = null) {
    try {
        const key = buildRedisKey(subreddit, sort, query, time, contentType, afterToken, postId);
        const cached = await redisClient.get(key);
        if (cached) {
            console.log('🎯 Redis cache hit:', key);
            return JSON.parse(cached);
        }
        console.log('❌ Redis cache miss:', key);
        return null;
    } catch (error) {
        console.error('Redis get error:', error);
        return null;
    }
}

async function setCachedBatch(subreddit, sort, query, time, contentType, afterToken, data, postId = null) {
    try {
        const key = buildRedisKey(subreddit, sort, query, time, contentType, afterToken, postId);
        await redisClient.setEx(key, 420, JSON.stringify(data));
        console.log('💾 Cached batch in Redis:', key);
    } catch (error) {
        console.error('Redis set error:', error);
    }
}

// Vector search Redis helpers
function buildVectorSearchKey(query, subreddit, timeFilter = 'all') {
    const encode = str => encodeURIComponent(str || '');
    return `vector:search:${encode(query)}:${encode(subreddit || 'all')}:${encode(timeFilter)}`;
}

async function getCachedVectorSearch(query, subreddit, timeFilter = 'all') {
    try {
        const key = buildVectorSearchKey(query, subreddit, timeFilter);
        const cached = await redisClient.get(key);
        if (cached) {
            console.log('🎯 Vector search cache hit:', key);
            return JSON.parse(cached);
        }
        console.log('❌ Vector search cache miss:', key);
        return null;
    } catch (error) {
        console.error('Redis vector search get error:', error);
        return null;
    }
}

async function setCachedVectorSearch(query, subreddit, timeFilter = 'all', results) {
    try {
        const key = buildVectorSearchKey(query, subreddit, timeFilter);
        await redisClient.setEx(key, 420, JSON.stringify(results)); // 7 minutes TTL
        console.log('💾 Cached vector search results:', key);
    } catch (error) {
        console.error('Redis vector search set error:', error);
    }
}

const PORT = process.env.PORT || 3000;

const axios = require('axios');
const cheerio = require('cheerio');
        
require('dotenv').config();
require('./daddy-bot');
require('./cron-cleanup');

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const redditClients = [
    {
        clientId: process.env.REDDIT_CLIENT_1_ID,
        clientSecret: process.env.REDDIT_CLIENT_1_SECRET,
        userAgent: process.env.REDDIT_USER_AGENT_1,
        requestCount: 0,
        lastReset: Date.now()
    },
    {
        clientId: process.env.REDDIT_CLIENT_2_ID,
        clientSecret: process.env.REDDIT_CLIENT_2_SECRET,
        userAgent: process.env.REDDIT_USER_AGENT_2,
        requestCount: 0,
        lastReset: Date.now()
    },
    {
        clientId: process.env.REDDIT_CLIENT_3_ID,
        clientSecret: process.env.REDDIT_CLIENT_3_SECRET,
        userAgent: process.env.REDDIT_USER_AGENT_3,
        requestCount: 0,
        lastReset: Date.now()
    }
];

let currentClientIndex = 0;

function getNextClient() {
    const client = redditClients[currentClientIndex];

    // Check if current client hit rate limit (90 requests per minute)
    const now = Date.now();
    const timeSinceReset = now - client.lastReset;

    if (timeSinceReset >= 60000) { // Reset after 1 minute
        client.requestCount = 0;
        client.lastReset = now;
    }

    if (client.requestCount >= 90) {
        // Switch to next client
        currentClientIndex = (currentClientIndex + 1) % redditClients.length;
        return getNextClient(); // Recursively try next client
    }

    client.requestCount++;
    return client;
}

let emergencyMode = process.env.EMERGENCY_MODE === 'true';
let fallbackMode = process.env.REDDIT_FALLBACK_MODE || 'oauth';

function requireAdmin(req, res, next) {
    const adminKey = req.headers['x-admin-key'] || req.query.admin;
    if (adminKey !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// Track requests per minute
let requestCount = 0;
let lastMinute = Date.now();

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
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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
            if (priceId === process.env.STRIPE_PRICE_ID_1) {
                planType = 'premium';
            } else if (priceId === process.env.STRIPE_PRICE_ID_2) {
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
            if (priceId === process.env.STRIPE_PRICE_ID_1) {
                planType = 'premium';
            } else if (priceId === process.env.STRIPE_PRICE_ID_2) {
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

            // Delete subscription record
            await pool.query(`
           DELETE FROM subscriptions
           WHERE email = $1
       `, [customer.email]);

            // Delete all sections for this user
            await pool.query(`
        DELETE FROM sections
        WHERE user_id = $1
        `, [subscription.customer]); 

        } catch (error) {
            console.error('Error deleting subscription/user record:', error);
        }
    }
    res.json({ received: true });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

async function getRedditAppToken() {
    if (emergencyMode) {
        console.log('⚠️ Emergency mode active, skipping OAuth');
        return null;
    }

    const client = getNextClient();

    if (client.accessToken && Date.now() < client.tokenExpiry) {
        return client.accessToken;
    }

    const basicAuth = Buffer.from(`${client.clientId}:${client.clientSecret}`).toString('base64');

    try {
        const res = await fetch('https://www.reddit.com/api/v1/access_token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': client.userAgent
            },
            body: 'grant_type=client_credentials'
        });

        const data = await res.json();

        if (data.access_token) {
            client.accessToken = data.access_token;
            client.tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
            console.log("🔐 Got Reddit app token:", data.access_token.slice(0, 16) + '...');
            return client.accessToken;
        } else {
            console.error("❌ Failed to get Reddit app token:", data);
            return null;
        }
    } catch (error) {
        // Log EVERYTHING about the error
        console.error('🔥 REDDIT TOKEN FETCH ERROR:');
        console.error('   Error Type:', error.name);
        console.error('   Error Code:', error.code);
        console.error('   Message:', error.message);
        console.error('   Stack:', error.stack);

        // Specific error handling
        if (error.code === 'ETIMEDOUT') {
            console.error('   ⏰ TIMEOUT: Reddit took too long to respond');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('   🚫 CONNECTION REFUSED: Reddit rejected the connection');
        } else if (error.code === 'ENOTFOUND') {
            console.error('   🌐 DNS ERROR: Could not resolve reddit.com');
        } else if (error.code === 'ECONNRESET') {
            console.error('   💔 CONNECTION RESET: Reddit dropped the connection');
        }

        return null; // App keeps running
    }
}

function getCurrentUserAgent() {
    const client = redditClients[currentClientIndex];
    return client.userAgent;
}

// Add the rate logging counter at the top level
let rateLogCounter = 0;

// Define the utility functions outside of your route handlers
function logFetch(url) {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    console.log(`🔁 [${timeString}] Fetching: ${url}`);
}

let emergencyActivatedAt = null;

function activateEmergency(mode = 'json') {
    if (mode === 'oauth') {
        // Reset to normal mode
        emergencyMode = false;
        fallbackMode = 'oauth';
        emergencyActivatedAt = null;
        console.log('✅ NORMAL MODE RESTORED - Using OAuth');
    } else {
        // Emergency mode
        emergencyMode = true;
        fallbackMode = mode;
        emergencyActivatedAt = new Date();
        console.log(`🚨 EMERGENCY MODE ACTIVATED at ${emergencyActivatedAt.toLocaleString()} - Mode: ${mode}`);
    }
}

function logRateInfo(headers, force = false) {
    if (emergencyMode && emergencyActivatedAt) {
        console.log(`🚨 Emergency Mode Active (since ${emergencyActivatedAt.toLocaleTimeString()})`);
        return;
    }

    // Normal mode rate limiting
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const used = parseFloat(headers.get("x-ratelimit-used") || "0");
    const remaining = parseFloat(headers.get("x-ratelimit-remaining") || "60");
    const reset = parseFloat(headers.get("x-ratelimit-reset") || "60");

    rateLogCounter++;
    if (force || rateLogCounter % 5 === 0) {
        console.log(`📉 [${timeString}] OAuth Mode: Used ${used}, Remaining ${remaining}, Resets in ${reset}s`);
    }
}

// Fetch wrapper
async function dogFetch(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Build headers safely
    const headers = {
        'User-Agent': getCurrentUserAgent(),
        ...(options.headers || {})
    };

    if (emergencyMode) {
        delete headers.Authorization; // ensure no auth in emergency mode
        console.log('🚨 Emergency request without auth');
    }

    logFetch(url);

    try {
        const response = await fetch(url, {
            ...options,
            headers,
            signal: controller.signal
        });

        logRateInfo(response.headers);

        if (!response.ok) {
            console.error(`❌ Failed to fetch ${url} – Status: ${response.status}`);
        }

        return response;
    } catch (err) {
        console.error(`🐶💥 DOGFETCH ERROR: ${url}\n→ ${err.name}: ${err.message}`);
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

async function hedgedRedditRequest(url, isEmergencyMode, hedgeDelayMs = 2000) {
    const requests = [];
    let token = null;

    // Get token if not in emergency mode
    if (!isEmergencyMode) {
        try {
            token = await getRedditAppToken();
        } catch (error) {
            console.error('Token fetch failed in hedgedRequest:', error.message);
            token = null;
        }
    }

    // Start first request
    const makeRequest = () => {
        if (isEmergencyMode) {
            return dogFetch(url);
        } else {
            return dogFetch(url, {
                headers: {
                    ...headers,
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': getCurrentUserAgent()
                }
            });
        }
    };

    requests.push(makeRequest());

    // Start hedge request after delay
    const hedgeTimeout = setTimeout(() => {
        console.log(`🔄 Hedging request after ${hedgeDelayMs}ms`);
        requests.push(makeRequest());
    }, hedgeDelayMs);

    try {
        const response = await Promise.race(requests);
        clearTimeout(hedgeTimeout);
        return response;
    } catch (error) {
        clearTimeout(hedgeTimeout);
        throw error;
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

                    let aboutRes, aboutData;

                    if (emergencyMode) {
                        console.log(`🚨 Emergency mode: fetching r/${subreddit} icon via public JSON`);
                        aboutRes = await dogFetch(`https://www.reddit.com/r/${subreddit}/about.json`);
                        aboutData = await aboutRes.json();
                    } else {
                        // Normal OAuth mode
                        let token;
                        try {
                            token = await getRedditAppToken();
                        } catch (error) {
                            console.error(`Failed to get token for r/${subreddit}:`, error.message);
                            icons[subreddit] = null;
                            continue; // Skip this subreddit
                        }

                        aboutRes = await dogFetch(`https://oauth.reddit.com/r/${subreddit}/about`, {
                            headers: {
                                ...headers,
                                'Authorization': `Bearer ${token}`,
                                'User-Agent': getCurrentUserAgent()
                            }
                        });
                        aboutData = await aboutRes.json();
                    }

                    const iconOptions = [
                        aboutData.data.community_icon,
                        aboutData.data.icon_img,
                        aboutData.data.mobile_banner_image,
                        aboutData.data.header_img,
                        aboutData.data.banner_img
                    ].filter(url => url).map(url => url.replace(/&amp;/g, '&').trim());

                    let iconUrl = null;

                    // Try each icon URL until one works
                    for (const url of iconOptions) {
                        try {
                            const checkResponse = await dogFetch(url, { method: 'HEAD' });
                            if (checkResponse.status === 200) {
                                iconUrl = url;
                                break;
                            }
                        } catch (err) {
                            // Try next URL
                        }
                    }

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
                const cachedResult = await Promise.race([
                    pool.query("SELECT results FROM subreddit_search_cache WHERE query_term = $1", [query]),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 5000))
                ]);

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

    // EMERGENCY MODE URL HANDLING
    if (emergencyMode) {
        console.log('🚨 Emergency mode: using public Reddit URLs');

        // Check if .json is already in the URL
        if (!decodedUrl.includes('.json')) {
            // Add .json before query parameters
            const [baseUrl, queryString] = decodedUrl.split('?');
            decodedUrl = queryString ? `${baseUrl}.json?${queryString}` : `${baseUrl}.json`;
        }
        // If .json is already there, leave the URL as-is

    } else {
        // Normal mode: Rewrite www to oauth and remove ALL .json
        decodedUrl = decodedUrl.replace('https://www.reddit.com', 'https://oauth.reddit.com');
        decodedUrl = decodedUrl.replace(/\.json\?/, '?'); // Remove .json before query params
        decodedUrl = decodedUrl.replace(/\.json$/, '');
    }

    // Try Redis cache first (only for regular Reddit API calls, not subreddit search)
    if (!decodedUrl.includes('subreddits/search.json')) {
        try {
            // Parse URL to extract cache parameters
            const urlObj = new URL(decodedUrl.replace('https://oauth.reddit.com', 'https://www.reddit.com'));
            const pathParts = urlObj.pathname.split('/');

            // Extract subreddit from path like /r/programming/new
            let subreddit = 'all';
            if (pathParts[1] === 'r' && pathParts[2]) {
                subreddit = pathParts[2];
            }

            // Check if this is a comment URL
            let postId = null;
            if (urlObj.pathname.includes('/comments/')) {
                // Extract post ID from comment URLs like /r/subreddit/comments/POST_ID/title/
                postId = pathParts[4];
            }

            // Extract sort from path or default to 'hot'
            let sort = pathParts[3] || 'hot';

            // Get query parameters
            const query = urlObj.searchParams.get('q') || '';
            const time = urlObj.searchParams.get('t') || 'all';
            const after = urlObj.searchParams.get('after') || null;
            const contentType = 'all';

            // Check Redis cache (pass postId for comment URLs)
            const cachedBatch = await getCachedBatch(subreddit, sort, query, time, contentType, after, postId);
            if (cachedBatch) {
                if (postId) {
                    console.log(`🎯 Redis cache hit - comments for post:${postId} in r/${subreddit}`);
                } else {
                    console.log(`🎯 Redis cache hit - subreddit:${subreddit} sort:${sort} query:"${query}" time:${time} after:${after}`);
                }
                return res.json(cachedBatch);
            }

            if (postId) {
                console.log(`❌ Redis cache miss - comments for post:${postId} in r/${subreddit}`);
            } else {
                console.log(`❌ Redis cache miss - subreddit:${subreddit} sort:${sort} query:"${query}" time:${time} after:${after}`);
            }
        } catch (redisError) {
            console.error('Redis check failed, continuing to Reddit API:', redisError.message);
        }
    }

    try {
        let response;

        response = await hedgedRedditRequest(decodedUrl, emergencyMode);

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

        // Cache the result in Redis (only for regular Reddit API calls)
        if (!encodedUrl.includes('subreddits/search.json')) {
            try {
                const urlObj = new URL(decodedUrl.replace('https://oauth.reddit.com', 'https://www.reddit.com'));
                const pathParts = urlObj.pathname.split('/');

                let subreddit = 'all';
                if (pathParts[1] === 'r' && pathParts[2]) {
                    subreddit = pathParts[2];
                }

                let sort = pathParts[3] || 'hot';
                const query = urlObj.searchParams.get('q') || '';
                const time = urlObj.searchParams.get('t') || 'all';
                const after = urlObj.searchParams.get('after') || null;
                const contentType = 'all';

                await setCachedBatch(subreddit, sort, query, time, contentType, after, data);
            } catch (cacheError) {
                console.error('Failed to cache result:', cacheError.message);
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
        res.setHeader('Access-Control-Origin', '*');
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
        if (!token) {
            console.error('❌ Cannot perform search - no Reddit token available');
            return res.status(503).send('Reddit authentication temporarily unavailable. Please try again.');
        }

        const oauthUrl = redditUrl.replace('https://www.reddit.com', 'https://oauth.reddit.com');
        // Add delay between Reddit requests
        await new Promise(resolve => setTimeout(resolve, 5));
        const response = await dogFetch(oauthUrl, {
            headers: {
                ...headers,
                'Authorization': `Bearer ${token}`,
                'User-Agent': getCurrentUserAgent()
            }
        });
        const redditData = await response.json();

        // Read the HTML file and modify it
        let html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

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
            SELECT query
            FROM search_suggestions
            WHERE query != '' AND query IS NOT NULL 
AND query !~* '(genitals|genital|\\yass\\y|\\yjav\\y|\\ynude\\y|\\ysex\\y|undress|fucking|fuck|fucker|tits|titties|milf|loli|fucked|tiddies|nudes|shota|guro|onlyfans|hentai|\\yrape\\y|breeder|raped|gonewild|boobs|\\ycum\\y|\\ycock\\y|shit|shits|shitted|shat|cocksucker|cocks|cunt|gape|gooning|gooner|goon|pussy|porn|pantyhose)'
            GROUP BY query
            ORDER BY MAX(score) DESC
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

        res.set('Content-Type', 'application/xml');
        res.send(sitemap);
    } catch (error) {
        console.error('Sitemap error:', error.stack); 
        res.status(500).send('Error generating sitemap');
    }
});

app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /

Sitemap: https://karmafinder.site/sitemap.xml`);
});

app.get('/image', async (req, res) => {
    const imageUrl = decodeURIComponent(req.query.url);
    if (!imageUrl) return res.status(400).send('No image URL provided.');

    try {
        const imageHeaders = {
            'User-Agent': getCurrentUserAgent(),
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
        res.setHeader('Cache-Control', 'public, max-age=86400');
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
    const posts = req.body.posts;
    const pageGroup = req.body.page_group;

    if (!Array.isArray(posts) || posts.length !== 10) {
        console.warn(`⛔ Refusing to save page group ${pageGroup} — invalid post count: ${posts?.length}`);
        return res.status(400).json({
            success: false,
            error: "Exactly 10 posts are required for saving"
        });
    }

    console.log(`📝 Processing ${posts.length} posts for page group ${pageGroup}`);
    const savedIds = [];

    const connection = await pool.connect();
    try {
        await connection.query('BEGIN');

        // Ensure delete and insert are in the same transaction
        await connection.query('DELETE FROM posts WHERE page_group = $1', [pageGroup]);

        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            const data = post.data;

            if (!data || !data.id) {
                console.log(`⚠️ Skipping malformed post at index ${i}`);
                continue;
            }

            const galleryData = data.gallery_data ? JSON.stringify(data.gallery_data) : null;
            const mediaMetadata = data.media_metadata ? JSON.stringify(data.media_metadata) : null;
            const crosspostList = data.crosspost_parent_list ? JSON.stringify(data.crosspost_parent_list) : null;
            const preview = data.preview ? JSON.stringify(data.preview) : null;

            const insertQuery = `
                INSERT INTO posts (
                    reddit_post_id, title, url, permalink, subreddit, score,
                    is_video, domain, author, created_utc, num_comments,
                    over_18, selftext, body, is_gallery, gallery_data,
                    media_metadata, crosspost_parent_list, content_type,
                    icon_url, locked, stickied, preview, page_group, position
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                        $12, $13, $14, $15, $16, $17, $18, $19,
                        $20, $21, $22, $23, $24, $25)
                ON CONFLICT (reddit_post_id, page_group)
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
                data.id,
                data.title,
                data.url,
                data.permalink,
                data.subreddit,
                data.score,
                data.is_video,
                data.domain,
                data.author,
                data.created_utc,
                data.num_comments,
                data.over_18,
                data.selftext,
                data.body,
                data.is_gallery,
                galleryData,
                mediaMetadata,
                crosspostList,
                data.content_type,
                data.icon_url,
                data.locked,
                data.stickied,
                preview,
                pageGroup,
                data.position
            ];

            const result = await connection.query(insertQuery, values);
            savedIds.push(result.rows[0].reddit_post_id);
        }

        await connection.query('COMMIT');
        console.log(`Successfully saved 10 posts for ${pageGroup}`);
        return res.json({ success: true, savedIds });

    } catch (error) {
        await connection.query('ROLLBACK');
        console.error("Database transaction error:", error);
        return res.status(500).json({ success: false, error: error.message });

    } finally {
        connection.release();
        console.log("DB connection released");
    }
});

// Endpoint to get all stored posts from database
app.get('/api/db-posts', async (req, res) => {
    try {
        const {
            after,
            limit = 10,
            subreddit: rawSubreddit = 'all',
            query: searchQuery = '',
            contentType = 'all',
            sort: rawSort = 'hot',
            time = 'all'
        } = req.query;

        const subreddit = rawSubreddit.toLowerCase();
        // Normalize 'ultimate' to 'hot'
        const sort = (rawSort === 'ultimate') ? 'hot' : rawSort;

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
    WHERE LOWER(page_group) = LOWER($1)
    ORDER BY position ASC
`;
            const pageParams = [pageGroup];
            const pageResult = await pool.query(pageQuery, pageParams);

            if (
                pageResult.rows.length > 0 &&
                pageResult.rows[0].page_group.toLowerCase() === pageGroup.toLowerCase() &&
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
    const { query, subreddit, is_vector_search } = req.body;
    await pool.query('SELECT increment_suggestion_score($1, $2, $3)', [query.toLowerCase(), subreddit || '', is_vector_search || false]);

    res.json({ success: true });
});

// Pull top queries on click
app.get('/api/top-searches', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT query, subreddit, score
        FROM (
            SELECT *,
                ROW_NUMBER() OVER (
                    PARTITION BY query
                    ORDER BY score DESC
                ) AS rn
            FROM search_suggestions
        ) t
        WHERE rn = 1
        ORDER BY score DESC
        LIMIT 6;

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
        // Get auth token from headers
        const authToken = req.headers.authorization;

        if (!authToken) {
            return res.status(401).json({ success: false, error: 'No auth token provided' });
        }

        // Get user ID from token
        const userResult = await pool.query('SELECT user_id FROM subscriptions WHERE auth_token = $1', [authToken]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid auth token' });
        }

        const stripeCustomerId = userResult.rows[0].user_id;

        const {
            postId,
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

        // Update section's last_modified timestamp
        await pool.query(
            'UPDATE sections SET last_modified = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
            [sectionId, stripeCustomerId]
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
app.delete('/api/bookmarks/:reddit_post_id', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const { reddit_post_id } = req.params;

        if (!authToken) {
            return res.status(401).json({ success: false, error: 'No auth token provided' });
        }

        // Get user ID from token
        const userResult = await pool.query('SELECT user_id FROM subscriptions WHERE auth_token = $1', [authToken]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid auth token' });
        }

        const stripeCustomerId = userResult.rows[0].user_id;

        if (!reddit_post_id) {
            return res.status(400).json({ success: false, error: 'Missing post ID' });
        }

        // Get the section_id before deleting
        const bookmarkResult = await pool.query(
            'SELECT section_id FROM bookmarks WHERE user_id = $1 AND reddit_post_id = $2',
            [stripeCustomerId, reddit_post_id]
        );

        if (bookmarkResult.rows.length > 0) {
            const sectionId = bookmarkResult.rows[0].section_id;

            // Delete bookmark
            await pool.query(
                'DELETE FROM bookmarks WHERE user_id = $1 AND reddit_post_id = $2',
                [stripeCustomerId, reddit_post_id]
            );

            // Update section's last_modified timestamp
            await pool.query(
                'UPDATE sections SET last_modified = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
                [sectionId, stripeCustomerId]
            );
        }

        res.json({ success: true, message: 'Bookmark removed' });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/bookmarks/:reddit_post_id', `${now} - ${error.message}`]);

        console.error('Error removing bookmark:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Get all bookmarks for a user
app.get('/api/bookmarks', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const { offset = 0, limit = 10 } = req.query;

        if (!authToken) {
            return res.status(401).json({ error: 'No auth token provided' });
        }

        // Get user ID from token
        const userResult = await pool.query('SELECT user_id FROM subscriptions WHERE auth_token = $1', [authToken]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid auth token' });
        }

        const stripeCustomerId = userResult.rows[0].user_id;

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
            ['error', '/api/bookmarks', `${now} - ${error.message}`]);

        console.error('GET bookmarks error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4b. Get bookmarks for a user by section  
app.get('/api/bookmarks/section/:sectionId', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const { sectionId } = req.params;

        if (!authToken) {
            return res.status(401).json({ error: 'No auth token provided' });
        }

        const userResult = await pool.query('SELECT user_id FROM subscriptions WHERE auth_token = $1', [authToken]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid auth token' });
        }

        const stripeCustomerId = userResult.rows[0].user_id;
        const { offset = 0, limit = 10 } = req.query;

        console.log('userId:', stripeCustomerId, 'sectionId:', sectionId, 'limit:', limit, 'offset:', offset);

        // Get total count
        const countResult = await pool.query(`
            SELECT COUNT(*) as total_count
            FROM bookmarks
            WHERE user_id = $1 AND section_id = $2
        `, [stripeCustomerId, parseInt(sectionId)]);

        const topSubredditResult = await pool.query(`
            SELECT subreddit, COUNT(*) as count
            FROM bookmarks 
            WHERE user_id = $1 AND section_id = $2 AND subreddit IS NOT NULL
            GROUP BY subreddit 
            ORDER BY count DESC, MAX(score) DESC 
            LIMIT 1
        `, [stripeCustomerId, parseInt(sectionId)]);

        const topSubreddit = topSubredditResult.rows.length > 0 ? topSubredditResult.rows[0].subreddit : null;

        const sectionResult = await pool.query(`
            SELECT name, description, created_at, emoji, last_modified
            FROM sections
            WHERE id = $1 AND user_id = $2
        `, [parseInt(sectionId), stripeCustomerId]);

        const sectionData = sectionResult.rows[0] || {};
        // Get bookmarks
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

        res.json({
            bookmarks: result.rows,
            total_count: parseInt(countResult.rows[0].total_count),
            top_subreddit: topSubreddit,
            description: sectionData.description,
            created_at: sectionData.created_at,
            name: sectionData.name,
            emoji: sectionData.emoji,
            last_modified: sectionData.last_modified
        });
    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/bookmarks/section/:sectionId', `${now} - ${error.message}`]);

        console.error('GET bookmarks by section error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Reorder bookmarks
app.post('/api/bookmarks/reorder', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const { orderedIds, sectionId } = req.body;

        if (!authToken) {
            return res.status(401).json({ success: false, error: 'No auth token provided' });
        }

        const userResult = await pool.query('SELECT user_id FROM subscriptions WHERE auth_token = $1', [authToken]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid auth token' });
        }

        const stripeCustomerId = userResult.rows[0].user_id;

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
            ['error', '/api/bookmarks/reorder', `${now} - ${error.message}`]);

        console.error('Error updating bookmark order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 6. Get all sections for a user
app.get('/api/bookmarks/sections', async (req, res) => {
    try {
        const authToken = req.headers.authorization;

        if (!authToken) {
            return res.status(401).json({ error: 'No auth token provided' });
        }

        const userResult = await pool.query('SELECT user_id FROM subscriptions WHERE auth_token = $1', [authToken]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid auth token' });
        }

        const userId = userResult.rows[0].user_id;

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
            ['error', '/api/bookmarks/sections', `${now} - ${error.message}`]);

        console.error('Error fetching sections:', error);
        res.status(500).json({ error: 'Failed to fetch sections' });
    }
});

// 7. Move bookmark to different section
app.put('/api/bookmarks/:bookmarkId/section', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const { bookmarkId } = req.params;
        const { sectionId } = req.body;

        if (!authToken) {
            return res.status(401).json({ error: 'No auth token provided' });
        }

        const userResult = await pool.query('SELECT user_id FROM subscriptions WHERE auth_token = $1', [authToken]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid auth token' });
        }

        const userId = userResult.rows[0].user_id;

        // Get the current section_id before updating
        const currentSectionResult = await pool.query(
            'SELECT section_id FROM bookmarks WHERE reddit_post_id = $1 AND user_id = $2',
            [bookmarkId, userId]
        );

        if (currentSectionResult.rows.length > 0) {
            const oldSectionId = currentSectionResult.rows[0].section_id;

            // Update the bookmark's section
            await pool.query(`
        UPDATE bookmarks
        SET section_id = $1
        WHERE reddit_post_id = $2 AND user_id = $3
    `, [sectionId, bookmarkId, userId]);

            // Update both old and new sections' last_modified timestamps
            await pool.query(
                'UPDATE sections SET last_modified = CURRENT_TIMESTAMP WHERE id IN ($1, $2) AND user_id = $3',
                [oldSectionId, sectionId, userId]
            );
        }

        res.json({ success: true });

    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/bookmarks/:bookmarkId/section', `${now} - ${error.message}`]);

        console.error('Error updating bookmark section:', error);
        res.status(500).json({ error: 'Failed to update section' });
    }
});

// Update bookmark score
app.put('/api/bookmarks/:reddit_post_id/score', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const { reddit_post_id } = req.params;
        const { score } = req.body;

        const userId = await validateAuthToken(authToken);

        await pool.query(
            'UPDATE bookmarks SET score = $1 WHERE user_id = $2 AND reddit_post_id = $3',
            [score, userId, reddit_post_id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating bookmark score:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Copy bookmark from shared content
app.post('/api/bookmarks/copy', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const { redditPostId, sectionId } = req.body;

        const userResult = await pool.query('SELECT user_id FROM subscriptions WHERE auth_token = $1', [authToken]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid auth token' });
        }

        const userId = userResult.rows[0].user_id;

        // Check if user already has this bookmark
        const existingBookmark = await pool.query(
            'SELECT id FROM bookmarks WHERE user_id = $1 AND reddit_post_id = $2',
            [userId, redditPostId]
        );

        if (existingBookmark.rows.length > 0) {
            // Just move to new section if they already have it
            await pool.query(
                'UPDATE bookmarks SET section_id = $1 WHERE user_id = $2 AND reddit_post_id = $3',
                [sectionId, userId, redditPostId]
            );
        } else {
            // Get original bookmark data
            const originalBookmark = await pool.query(
                'SELECT * FROM bookmarks WHERE reddit_post_id = $1 LIMIT 1',
                [redditPostId]
            );

            if (originalBookmark.rows.length > 0) {
                const bookmark = originalBookmark.rows[0];

                // First, shift all existing bookmarks in target section down by 1
                await pool.query(
                    'UPDATE bookmarks SET sort_order = sort_order + 1 WHERE user_id = $1 AND section_id = $2',
                    [userId, sectionId]
                );

                // Then insert the new bookmark at position 0 (top)
                await pool.query(`
            INSERT INTO bookmarks (user_id, section_id, reddit_post_id, title, url, permalink, subreddit, score, is_video, domain, author, created_utc, num_comments, over_18, selftext, body, is_gallery, gallery_data, media_metadata, crosspost_parent_list, content_type, icon_url, locked, stickied, preview, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, 0)
        `, [userId, sectionId, bookmark.reddit_post_id, bookmark.title, bookmark.url, bookmark.permalink, bookmark.subreddit, bookmark.score, bookmark.is_video, bookmark.domain, bookmark.author, bookmark.created_utc, bookmark.num_comments, bookmark.over_18, bookmark.selftext, bookmark.body, bookmark.is_gallery, bookmark.gallery_data, bookmark.media_metadata, bookmark.crosspost_parent_list, bookmark.content_type, bookmark.icon_url, bookmark.locked, bookmark.stickied, bookmark.preview]);
            }
        }

        // Update section's last_modified timestamp
        await pool.query(
            'UPDATE sections SET last_modified = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
            [sectionId, userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Copy bookmark error:', error);
        res.status(500).json({ error: 'Failed to copy bookmark' });
    }
});

// SECTION ENDPOINTS

// Get all sections for a user
app.get('/api/sections', async (req, res) => {
    try {
        const authToken = req.headers.authorization;

        if (!authToken) {
            return res.status(401).json({ error: 'No auth token provided' });
        }

        const userResult = await pool.query('SELECT user_id FROM subscriptions WHERE auth_token = $1', [authToken]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid auth token' });
        }

        const stripeCustomerId = userResult.rows[0].user_id;

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
            ['error', '/api/sections', `${now} - ${error.message}`]);

        console.error('GET sections error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create new section
app.post('/api/sections', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const { name = 'New Section' } = req.body;

        if (!authToken) {
            return res.status(401).json({ error: 'No auth token provided' });
        }

        const userResult = await pool.query('SELECT user_id FROM subscriptions WHERE auth_token = $1', [authToken]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid auth token' });
        }

        const stripeCustomerId = userResult.rows[0].user_id;

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
            ['error', '/api/sections', `${now} - ${error.message}`]);

        console.error('POST sections error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/sections/:sectionId', async (req, res) => {
    const authToken = req.headers.authorization;
    const { sectionId } = req.params;

    if (!authToken) {
        return res.status(401).json({ message: 'No auth token provided' });
    }

    try {
        const userResult = await pool.query('SELECT user_id FROM subscriptions WHERE auth_token = $1', [authToken]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid auth token' });
        }

        const userId = userResult.rows[0].user_id;

        await pool.query('BEGIN');

        // 1. Get the sort_order of the section to delete
        const { rows } = await pool.query(
            'SELECT sort_order FROM sections WHERE id = $1 AND user_id = $2',
            [sectionId, userId]
        );

        if (rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ message: 'Section not found' });
        }

        const deletedSortOrder = rows[0].sort_order;

        // 2. Delete bookmarks in that section
        await pool.query(
            'DELETE FROM bookmarks WHERE section_id = $1 AND user_id = $2',
            [sectionId, userId]
        );

        // 3. Delete the section
        await pool.query(
            'DELETE FROM sections WHERE id = $1 AND user_id = $2',
            [sectionId, userId]
        );

        // 4. Update sort_order for remaining sections
        await pool.query(
            `UPDATE sections
             SET sort_order = sort_order - 1
             WHERE user_id = $1 AND sort_order > $2`,
            [userId, deletedSortOrder]
        );

        await pool.query('COMMIT');
        res.json({ message: 'Section deleted and sort order updated' });

    } catch (err) {
        await pool.query('ROLLBACK');
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/sections/:sectionId', `${now} - ${err.message}`]);
        console.error('❌ Error deleting section:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Share sections endpoint
app.post('/api/sections/:sectionId/share', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const userId = await validateAuthToken(authToken);
        const { sectionId } = req.params;

        // Verify user owns section
        const sectionCheck = await pool.query(
            'SELECT id FROM sections WHERE id = $1 AND user_id = $2',
            [sectionId, userId]
        );

        if (sectionCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Section not found' });
        }

        // Check if share code already exists for this section
        const existingShare = await pool.query(
            'SELECT share_code FROM share_links WHERE section_id = $1',
            [sectionId]
        );

        let shareCode;
        if (existingShare.rows.length > 0) {
            // Reuse existing share code
            shareCode = existingShare.rows[0].share_code;
        } else {
            // Generate new share code (existing logic)
            const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let attempts = 0;

            do {
                shareCode = '';
                for (let i = 0; i < 9; i++) {
                    shareCode += chars[Math.floor(Math.random() * chars.length)];
                }

                const existing = await pool.query('SELECT id FROM share_links WHERE share_code = $1', [shareCode]);
                if (existing.rows.length === 0) break;
                attempts++;
            } while (attempts < 5);

            if (attempts >= 5) {
                return res.status(500).json({ error: 'Failed to generate unique share code' });
            }

            await pool.query(
                'INSERT INTO share_links (share_code, section_id) VALUES ($1, $2)',
                [shareCode, sectionId]
            );
        }

        const shareUrl = `${req.protocol}://${req.get('host')}/share/${shareCode}`;

        res.json({ shareCode, shareUrl });

    } catch (error) {
        console.error('Share creation error:', error);
        res.status(500).json({ error: 'Failed to create share link' });
    }
});

// Get code for section
app.get('/api/share/:shareCode', async (req, res) => {
    try {
        const { shareCode } = req.params;

        const result = await pool.query(`
            SELECT s.id, s.name, s.emoji, s.user_id, s.created_at, s.description, s.last_modified
            FROM share_links sl 
            JOIN sections s ON sl.section_id = s.id 
            WHERE sl.share_code = $1
        `, [shareCode]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Share not found' });
        }

        const section = result.rows[0];

        const offset = parseInt(req.query.offset) || 0;
        const limit = parseInt(req.query.limit) || 11;

        // ADD THIS COUNT QUERY HERE:
        const totalCountResult = await pool.query(
            'SELECT COUNT(*) as total FROM bookmarks WHERE section_id = $1',
            [section.id]
        );

        const bookmarks = await pool.query(
            'SELECT * FROM bookmarks WHERE section_id = $1 ORDER BY sort_order ASC OFFSET $2 LIMIT $3',
            [section.id, offset, limit]
        );

        const topSubredditResult = await pool.query(`
            SELECT subreddit, COUNT(*) as count
            FROM bookmarks 
            WHERE section_id = $1 AND subreddit IS NOT NULL
            GROUP BY subreddit 
            ORDER BY count DESC, MAX(score) DESC 
            LIMIT 1
        `, [section.id]);

        const topSubreddit = topSubredditResult.rows.length > 0 ? topSubredditResult.rows[0].subreddit : null;

        res.json({
            section,
            bookmarks: bookmarks.rows,
            total_count: parseInt(totalCountResult.rows[0].total), // ADD THIS LINE
            top_subreddit: topSubreddit,
            created_at: section.created_at,
            last_modified: section.last_modified
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load shared content' });
    }
});

// Section description endpoint
app.put('/api/sections/:sectionId/description', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const userId = await validateAuthToken(authToken);
        const { sectionId } = req.params;
        const { description } = req.body;

        if (!description || typeof description !== 'string') {
            return res.status(400).json({ error: 'Invalid description' });
        }

        if (description.length > 500) {
            return res.status(400).json({ error: 'Description too long (max 500 characters)' });
        }

        // Strip HTML tags and dangerous characters
        const sanitizedDescription = description
            .replace(/<[^>]*>/g, '') // Remove all HTML tags
            .replace(/[<>&"']/g, (match) => {
                const htmlEntities = {
                    '<': '&lt;',
                    '>': '&gt;',
                    '&': '&amp;',
                    '"': '&quot;',
                    "'": '&#x27;'
                };
                return htmlEntities[match];
            })
            .trim();

        // Verify user owns section
        const result = await pool.query(
            'UPDATE sections SET description = $1, last_modified = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *',
            [sanitizedDescription, sectionId, userId] // Use sanitizedDescription here!
        );

        if (result.rows.length === 0) {
            return res.status(403).json({ error: 'Section not found or unauthorized' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update description' });
    }
});

// send html response for opengl
app.get('/share/:shareCode', async (req, res) => {
    try {
        const { shareCode } = req.params;

        const result = await pool.query(`
            SELECT s.id, s.name, s.emoji, s.user_id, s.created_at, s.description, s.last_modified
            FROM share_links sl 
            JOIN sections s ON sl.section_id = s.id 
            WHERE sl.share_code = $1
        `, [shareCode]);

        if (result.rows.length === 0) {
            return res.status(404).send('Share not found');
        }

        const section = result.rows[0];
        const bookmarkCount = await pool.query(
            'SELECT COUNT(*) as count FROM bookmarks WHERE section_id = $1',
            [section.id]
        );

        const count = bookmarkCount.rows[0].count;
        const title = `${section.emoji || '📌'} ${section.name} - KarmaFinder Collection`;
        const description = `${section.description || 'Curated Reddit collection'} - ${count} bookmarks`;
        const shareUrl = `${req.protocol}://${req.get('host')}/share/${shareCode}`;

        res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    
    <!-- Required Open Graph Meta Tags -->
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${shareUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${req.protocol}://${req.get('host')}/favicon.ico" />
    
    <!-- Standard Meta Tags -->
    <meta name="description" content="${description}" />
    
    <!-- Include your CSS and JS -->
    <link rel="stylesheet" href="/html/bookmarks.css">
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
</head>
<body>
    <div class="results-container"></div>
    <script src="/html/bookmarks.js"></script>
</body>
</html>`);

    } catch (error) {
        console.error('Share page error:', error);
        res.status(500).send('Error loading share page');
    }
});

app.put('/api/sections/:sectionId', async (req, res) => {
    const authToken = req.headers.authorization;
    const { sectionId } = req.params;
    const { name, emoji } = req.body;

    if (!authToken) {
        return res.status(401).json({ error: 'No auth token provided' });
    }

    try {
        const userResult = await pool.query('SELECT user_id FROM subscriptions WHERE auth_token = $1', [authToken]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid auth token' });
        }

        const userId = userResult.rows[0].user_id;

        // Build dynamic query based on what fields are provided
        let query, values;

        if (name && emoji) {
            query = 'UPDATE sections SET name = $1, emoji = $2, last_modified = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4 RETURNING id, name, emoji';
            values = [name.trim(), emoji, sectionId, userId];
        } else if (name) {
            query = `UPDATE sections SET name = $1, last_modified = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING id, name, emoji`;
            values = [name.trim(), sectionId, userId];
        } else if (emoji) {
            query = `UPDATE sections SET emoji = $1, last_modified = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING id, name, emoji`;
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
            ['error', '/api/sections/:sectionId', `${now} - ${error.message}`]);

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
        // Get URLs from query parameters if provided by frontend
        const { fallbackUrl, dashUrl, hlsUrl: providedHlsUrl } = req.query;

        const outputFileName = `combined_${videoId}.mp4`;
        const outputPath = path.join(tempDir, outputFileName);

        if (await fs.promises.access(outputPath).then(() => true).catch(() => false)) {
            console.log(`✅ Already exists: ${outputFileName}`);
            return res.json({ success: true, videoUrl: `/temp/${outputFileName}` });
        }

        console.log(`🎬 Starting: ${videoId}`);

        // If frontend provided URLs, try those FIRST
        if (fallbackUrl) {
            console.log(`🔄 Trying provided fallbackUrl...`);
            try {
                const baseVideoUrl = fallbackUrl;
                const audioUrl = `https://v.redd.it/${videoId}/DASH_AUDIO_128.mp4`;

                await combineWithFfmpeg(baseVideoUrl, audioUrl, outputPath);
                scheduleFileDeletion(outputPath, outputFileName);
                return res.json({ success: true, videoUrl: `/temp/${outputFileName}` });
            } catch (e) {
                console.log(`❌ Provided fallbackUrl failed: ${e.message}`);
            }
        }

        if (providedHlsUrl) {
            console.log(`🔄 Trying provided hlsUrl...`);
            try {
                await copyVideoOnly(providedHlsUrl, outputPath);
                scheduleFileDeletion(outputPath, outputFileName);
                return res.json({ success: true, videoUrl: `/temp/${outputFileName}` });
            } catch (e) {
                console.log(`❌ Provided hlsUrl failed: ${e.message}`);
            }
        }

        if (dashUrl) {
            console.log(`🔄 Trying provided dashUrl...`);
            try {
                await copyVideoOnly(dashUrl, outputPath);
                scheduleFileDeletion(outputPath, outputFileName);
                return res.json({ success: true, videoUrl: `/temp/${outputFileName}` });
            } catch (e) {
                console.log(`❌ Provided dashUrl failed: ${e.message}`);
            }
        }

        // Try downloading 480p video + 128kbps audio first (most common)
        let videoUrl = `https://v.redd.it/${videoId}/DASH_480.mp4`;
        let audioUrl = `https://v.redd.it/${videoId}/DASH_AUDIO_128.mp4`;

        try {
            await combineWithFfmpeg(videoUrl, audioUrl, outputPath);
            scheduleFileDeletion(outputPath, outputFileName);
            return res.json({ success: true, videoUrl: `/temp/${outputFileName}` });
        } catch (firstError) {
            console.log(`❌ 480p + 128kbps failed, trying alternatives...`);
        }

        // Fallback 1: Try different video quality (720p)
        await new Promise(resolve => setTimeout(resolve, 1000));
        videoUrl = `https://v.redd.it/${videoId}/DASH_720.mp4`;
        try {
            await combineWithFfmpeg(videoUrl, audioUrl, outputPath);
            scheduleFileDeletion(outputPath, outputFileName);
            return res.json({ success: true, videoUrl: `/temp/${outputFileName}` });
        } catch (e) {
            console.log(`❌ 720p failed`);
        }

        // Fallback 2: Try video-only 480p (no audio)
        await new Promise(resolve => setTimeout(resolve, 1000));
        videoUrl = `https://v.redd.it/${videoId}/DASH_480.mp4`;
        try {
            await copyVideoOnly(videoUrl, outputPath);
            scheduleFileDeletion(outputPath, outputFileName);
            return res.json({ success: true, videoUrl: `/temp/${outputFileName}` });
        } catch (e) {
            console.log(`❌ Video-only failed`);
        }

        // Fallback 3: Try HLS
        await new Promise(resolve => setTimeout(resolve, 1000));
        const hlsUrl = `https://v.redd.it/${videoId}/HLSPlaylist.m3u8`;
        try {
            await copyVideoOnly(hlsUrl, outputPath);
            scheduleFileDeletion(outputPath, outputFileName);
            return res.json({ success: true, videoUrl: `/temp/${outputFileName}` });
        } catch (e) {
            console.log(`❌ HLS failed`);
        }

        // Fallback 4: Try Render proxy for audio
        await new Promise(resolve => setTimeout(resolve, 1000));
        videoUrl = `https://v.redd.it/${videoId}/DASH_480.mp4`;
        audioUrl = `https://karmafinder.onrender.com/proxy-audio/${videoId}`;
        try {
            await combineWithFfmpeg(videoUrl, audioUrl, outputPath);
            scheduleFileDeletion(outputPath, outputFileName);
            return res.json({ success: true, videoUrl: `/temp/${outputFileName}` });
        } catch (e) {
            console.log(`❌ Render proxy failed`);
        }

        // All failed
        return res.status(404).json({ error: 'No video found' });

    } catch (err) {
        console.error('❌ Error:', err);
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)', [
            'error',
            '/api/reddit-video/:videoId',
            `${new Date().toLocaleTimeString()} - ${err.message}`
        ]);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/proxy-audio/:videoId', async (req, res) => {
    const { videoId } = req.params;
    const audioUrl = `https://v.redd.it/${videoId}/DASH_AUDIO_128.mp4`;

    try {
        const response = await fetch(audioUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://www.reddit.com'
            }
        });

        if (!response.ok) {
            return res.status(404).send('Audio not found');
        }

        res.set('Content-Type', 'audio/mp4');
        response.body.pipe(res);
    } catch (err) {
        console.error('Proxy error:', err);
        res.status(500).send('Proxy failed');
    }
});

// Get RedGifs video URL
app.get('/api/redgifs/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;

        // Get token
        const token = await getRedGifsToken();
        if (!token) {
            return res.status(500).json({ error: 'Failed to get RedGifs token' });
        }

        // Fetch video data
        const response = await fetch(`https://api.redgifs.com/v2/gifs/${videoId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        // ADD THIS:
        console.log('RedGifs API response:', JSON.stringify(data, null, 2));

        if (!data.gif || !data.gif.urls) {
            return res.status(404).json({ error: 'Video not found' });
        }

        if (!data.gif || !data.gif.urls) {
            return res.status(404).json({ error: 'Video not found' });
        }

        // Return the direct MP4 URL
        const videoUrl = data.gif.urls.hd || data.gif.urls.sd;

        const proxiedUrl = videoUrl.replace('https://media.redgifs.com/', '/proxy-redgifs/media/');

        const thumbnailUrl = data.gif.urls.poster
            ? data.gif.urls.poster.replace('https://thumbs2.redgifs.com/', '/proxy-redgifs/thumbs2/')
            : null;

        res.json({
            success: true,
            videoUrl: proxiedUrl,
            thumbnail: thumbnailUrl
        });

    } catch (error) {
        console.error('RedGifs API error:', error);
        res.status(500).json({ error: 'Failed to fetch RedGifs video' });
    }
});

function copyVideoOnly(videoUrl, outputPath) {
    return new Promise((resolve, reject) => {
        const isHLS = videoUrl.includes('.m3u8');

        if (isHLS) {
            // HLS must be processed by ffmpeg - it will fetch all segments
            const headers = 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
                'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                'Chrome/115.0.0.0 Safari/537.36\r\n' +
                'Referer: https://www.reddit.com/';

            const args = [
                '-headers', headers,
                '-i', videoUrl,
                '-c', 'copy',
                '-bsf:a', 'aac_adtstoasc',
                '-y',
                outputPath
            ];

            const ff = spawn('ffmpeg', args);

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
        } else {
            // Regular MP4 - download through Node
            (async () => {
                try {
                    const response = await fetch(videoUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': 'https://www.reddit.com/'
                        }
                    });

                    if (!response.ok) {
                        return reject(new Error(`Failed: ${response.status}`));
                    }

                    const buffer = Buffer.from(await response.arrayBuffer());
                    await fs.promises.writeFile(outputPath, buffer);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            })();
        }
    });
}

async function combineWithFfmpeg(videoUrl, audioUrl, outputPath) {
    return new Promise(async (resolve, reject) => {
        try {
            // Download video and audio through Node (with proper headers)
            console.log('📥 Downloading video through proxy...');
            const videoResponse = await fetch(videoUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0',
                    'Referer': 'https://www.reddit.com/'
                }
            });

            const audioResponse = await fetch(audioUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0',
                    'Referer': 'https://www.reddit.com/'
                }
            });

            if (!videoResponse.ok || !audioResponse.ok) {
                return reject(new Error(`Failed to download - Video: ${videoResponse.status}, Audio: ${audioResponse.status}`));
            }

            // Save to temp files
            const tempVideo = path.join(tempDir, `temp_video_${Date.now()}.mp4`);
            const tempAudio = path.join(tempDir, `temp_audio_${Date.now()}.mp4`);

            const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
            const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

            await fs.promises.writeFile(tempVideo, videoBuffer);
            await fs.promises.writeFile(tempAudio, audioBuffer);

            console.log('✅ Downloaded files, combining with ffmpeg...');

            // Now use ffmpeg with LOCAL files (no network requests = no 403)
            const args = [
                '-i', tempVideo,
                '-i', tempAudio,
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-map', '0:v:0',
                '-map', '1:a:0',
                '-shortest',
                '-y',
                outputPath
            ];

            const ff = spawn('ffmpeg', args);

            const timeout = setTimeout(() => {
                ff.kill('SIGKILL');
                reject(new Error('FFmpeg timeout after 60 seconds'));
            }, 60000);

            ff.stderr.on('data', d => process.stdout.write(d.toString()));

            ff.on('error', (err) => {
                clearTimeout(timeout);
                fs.promises.unlink(tempVideo).catch(() => { });
                fs.promises.unlink(tempAudio).catch(() => { });
                reject(err);
            });

            ff.on('close', code => {
                clearTimeout(timeout);
                fs.promises.unlink(tempVideo).catch(() => { });
                fs.promises.unlink(tempAudio).catch(() => { });

                if (code === 0) resolve();
                else reject(new Error(`FFmpeg exited with code ${code}`));
            });

        } catch (error) {
            reject(error);
        }
    });
}

app.get('/proxy-reddit/*', async (req, res) => {
    try {
        const path = req.params[0];
        const redditUrl = `https://v.redd.it/${path}`;

        console.log('🔍 Proxying:', redditUrl);

        const response = await fetch(redditUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.reddit.com/'
            }
        });

        console.log('📥 Reddit response:', response.status);

        if (!response.ok) {
            return res.status(response.status).send('Reddit returned error');
        }

        res.set('Content-Type', response.headers.get('content-type'));
        res.set('Content-Length', response.headers.get('content-length'));
        response.body.pipe(res);

    } catch (error) {
        console.error('❌ Proxy error:', error);
        res.status(500).send('Proxy failed');
    }
});

app.get('/proxy-redgifs/*', async (req, res) => {
    try {
        const path = req.params[0];
        const redgifsUrl = `https://media.redgifs.com/${path}`;

        console.log('🔍 Proxying RedGifs:', redgifsUrl);

        const response = await fetch(redgifsUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.redgifs.com/'
            }
        });

        console.log('📥 RedGifs response:', response.status);

        if (!response.ok) {
            return res.status(response.status).send('RedGifs returned error');
        }

        res.set('Content-Type', response.headers.get('content-type'));
        res.set('Content-Length', response.headers.get('content-length'));
        response.body.pipe(res);

    } catch (error) {
        console.error('❌ RedGifs proxy error:', error);
        res.status(500).send('Proxy failed');
    }
});

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

        res.json({
            success: true,
            hasSubscription,
            planType
        });

    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/subscription/:email', `${now} - ${error.message}`]);

        console.error('Error fetching subscription:', error);
        res.status(500).json({ error: 'Failed to fetch subscription data' });
    }
});


// Reddit OAuth Configuration
const REDDIT_CONFIG = {
    clientId: process.env.REDDIT_WEBAPP_CLIENT,
    clientSecret: process.env.REDDIT_WEBAPP_SECRET,
    redirectUri: process.env.NODE_ENV === 'production'
        ? 'https://karmafinder.site/auth/reddit/callback'
        : 'http://localhost:3000/auth/reddit/callback',
    userAgent: 'KarmaFinder:1.0.0 (by /u/karmafinder-dev)'
};

// Store OAuth states temporarily (use Redis in production)
const oauthStates = new Map();

/**
 * Validates auth token and returns user_id
 */
async function validateAuthToken(authToken) {
    if (!authToken) {
        throw new Error('No auth token provided');
    }

    const result = await pool.query(
        'SELECT user_id FROM subscriptions WHERE auth_token = $1',
        [authToken]
    );

    if (result.rows.length === 0) {
        throw new Error('Invalid auth token');
    }

    return result.rows[0].user_id;
}

/**
 * Route: Start Reddit OAuth flow
 */
app.get('/auth/reddit/start', async (req, res) => {
    try {
        const authToken = req.query.auth_token;
        const userId = await validateAuthToken(authToken);
        const state = crypto.randomBytes(32).toString('hex');
        oauthStates.set(state, {
            userId,
            expires: Date.now() + 10 * 60 * 1000
        });

        const authUrl = new URL('https://www.reddit.com/api/v1/authorize');
        authUrl.searchParams.append('client_id', REDDIT_CONFIG.clientId);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('redirect_uri', REDDIT_CONFIG.redirectUri);
        authUrl.searchParams.append('duration', 'temporary');
        authUrl.searchParams.append('scope', 'identity history read');

        res.redirect(authUrl.toString());
    } catch (error) {
        console.error('Reddit OAuth start error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
});

/**
 * Route: Handle Reddit OAuth callback 
 */
app.get('/auth/reddit/callback', async (req, res) => {
    try {
        const { code, state, error } = req.query;

        if (error) {
            console.error('Reddit OAuth error:', error);
            return res.redirect('/?page=bookmarks&reddit_auth=error&error_type=' + encodeURIComponent(error));
        }

        if (!code || !state) {
            return res.status(400).send('Missing authorization code or state');
        }

        // Validate state parameter
        const stateData = oauthStates.get(state);
        if (!stateData || Date.now() > stateData.expires) {
            return res.status(400).send('Invalid or expired state parameter');
        }

        // Exchange code for access token
        const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${REDDIT_CONFIG.clientId}:${REDDIT_CONFIG.clientSecret}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': REDDIT_CONFIG.userAgent
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDDIT_CONFIG.redirectUri
            })
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            throw new Error('Failed to get access token');
        }

        // Get Reddit user info
        const userResponse = await fetch('https://oauth.reddit.com/api/v1/me', {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'User-Agent': REDDIT_CONFIG.userAgent
            }
        });

        const userData = await userResponse.json();

        // Store Reddit token in database
        await pool.query(
            'UPDATE subscriptions SET reddit_access_token = $1, reddit_username = $2 WHERE user_id = $3',
            [tokenData.access_token, userData.name, stateData.userId]
        );

        // Clean up state
        oauthStates.delete(state);

        res.redirect('/?page=bookmarks&reddit_auth=success&auto_import=true');

    } catch (error) {
        console.error('Reddit callback error:', error);
        res.status(500).send('OAuth callback failed. Please try again.');
    }
});

module.exports = {
    validateAuthToken
};

app.post('/api/reddit/import', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        if (!authToken) {
            return res.status(401).json({ error: 'No auth token provided' });
        }

        const { sectionId } = req.body;
        if (!sectionId) {
            return res.status(400).json({ error: 'Section ID is required' });
        }

        const userResult = await pool.query('SELECT user_id FROM subscriptions WHERE auth_token = $1', [authToken]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid auth token' });
        }
        const userId = userResult.rows[0].user_id;

        // Verify section belongs to user
        const sectionResult = await pool.query(
            'SELECT id FROM sections WHERE id = $1 AND user_id = $2',
            [sectionId, userId]
        );
        if (sectionResult.rows.length === 0) {
            return res.status(403).json({ error: 'Section not found or unauthorized' });
        }

        // Get Reddit token
        const result = await pool.query(
            'SELECT reddit_access_token, reddit_username FROM subscriptions WHERE user_id = $1',
            [userId]
        );

        if (result.rows.length === 0 || !result.rows[0].reddit_access_token) {
            return res.status(404).json({ error: 'No Reddit account linked' });
        }

        const { reddit_access_token, reddit_username } = result.rows[0];

        // Fetch saved posts from Reddit
        const savedResponse = await fetch(`https://oauth.reddit.com/user/${reddit_username}/saved?limit=100`, {
            headers: {
                'Authorization': `Bearer ${reddit_access_token}`,
                'User-Agent': REDDIT_CONFIG.userAgent
            }
        });

        const savedData = await savedResponse.json();

        if (!savedResponse.ok) {
            return res.status(500).json({ error: 'Reddit API returned error: ' + JSON.stringify(savedData) });
        }

        if (!savedData.data || !savedData.data.children) {
            return res.status(500).json({ error: 'Unexpected Reddit response format' });
        }

        // Get existing Reddit posts to avoid duplicates
        const existingPosts = await pool.query(
            'SELECT reddit_post_id FROM bookmarks WHERE user_id = $1 AND reddit_post_id IS NOT NULL',
            [userId]
        );

        const existingIds = new Set(existingPosts.rows.map(row => row.reddit_post_id));

        // Filter unique posts
        const uniquePosts = savedData.data.children.filter(child =>
            !existingIds.has(child.data.id)
        );

        if (uniquePosts.length === 0) {
            return res.json({ imported: 0 });
        }

        // Import bookmarks with partial success handling
        let importedCount = 0;
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            for (const child of uniquePosts) {
                const data = child.data;
                const title = data.title || `Comment in r/${data.subreddit}`;
                const url = data.url || `https://reddit.com${data.permalink}`;

                try {
                    await client.query(
                        `INSERT INTO bookmarks (user_id, reddit_post_id, title, url, permalink, subreddit, score, is_video, domain, author, created_utc, num_comments, over_18, preview, selftext, body, is_gallery, gallery_data, media_metadata, crosspost_parent_list, content_type, icon_url, locked, stickied, section_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
                        [
                            userId,
                            data.id,
                            data.title || `Comment in r/${data.subreddit}`,
                            data.url || `https://reddit.com${data.permalink}`,
                            data.permalink,
                            data.subreddit,
                            data.score || 0,
                            data.is_video || false,
                            data.domain,
                            data.author,
                            data.created_utc,
                            data.num_comments || 0,
                            data.over_18 || false,
                            JSON.stringify(data.preview || null), 
                            data.selftext || '',
                            data.body || '',
                            data.is_gallery || false,
                            JSON.stringify(data.gallery_data || null),
                            JSON.stringify(data.media_metadata || null),
                            JSON.stringify(data.crosspost_parent_list || []),
                            data.content_type || '',
                            null, // icon_url
                            data.locked || false,
                            data.stickied || false,
                            sectionId
                        ]
                    );
                    importedCount++;
                } catch (insertError) {
                    console.warn('Failed to insert bookmark:', data.id, insertError.message);
                }
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        if (importedCount > 0) {
            const sortClient = await pool.connect();
            try {
                await sortClient.query('BEGIN');

                // First, shift all existing bookmarks down to make room at the top
                await sortClient.query(
                    'UPDATE bookmarks SET sort_order = sort_order + $1 WHERE user_id = $2 AND section_id = $3',
                    [importedCount, userId, sectionId]
                );

                // Then assign Reddit imports to positions 0, 1, 2, 3... (top of the list)
                for (let i = 0; i < uniquePosts.length; i++) {
                    const postId = uniquePosts[i].data.id;
                    await sortClient.query(
                        'UPDATE bookmarks SET sort_order = $1 WHERE user_id = $2 AND reddit_post_id = $3 AND section_id = $4',
                        [i, userId, postId, sectionId]
                    );
                }

                await sortClient.query('COMMIT');
            } catch (sortError) {
                await sortClient.query('ROLLBACK');
                console.error('Error updating sort order:', sortError);
            } finally {
                sortClient.release();
            }
        }

        // Update section's last_modified timestamp
        if (importedCount > 0) {
            await pool.query(
                'UPDATE sections SET last_modified = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
                [sectionId, userId]
            );
        }

        res.json({ imported: importedCount });

    } catch (error) {
        const now = new Date().toLocaleTimeString();
        await pool.query('INSERT INTO monitoring_logs (log_level, endpoint, error_message) VALUES ($1, $2, $3)',
            ['error', '/api/reddit/import', `${now} - ${error.message}`]);
        console.error('Reddit import error:', error);
        res.status(500).json({ error: 'Failed to import bookmarks' });
    }
});

app.get('/api/reddit/saved-count', async (req, res) => {
    try {
        const authToken = req.headers.authorization?.replace('Bearer ', '');
        const userId = await validateAuthToken(authToken);

        // Get Reddit token
        const result = await pool.query(
            'SELECT reddit_access_token, reddit_username FROM subscriptions WHERE user_id = $1',
            [userId]
        );

        if (result.rows.length === 0 || !result.rows[0].reddit_access_token) {
            return res.status(404).json({ error: 'No Reddit account linked' });
        }

        const { reddit_access_token, reddit_username } = result.rows[0];

        // Fetch saved posts from Reddit
        const savedResponse = await fetch(`https://oauth.reddit.com/user/${reddit_username}/saved?limit=100`, {
            headers: {
                'Authorization': `Bearer ${reddit_access_token}`,
                'User-Agent': REDDIT_CONFIG.userAgent
            }
        });

        console.log('Reddit API response status:', savedResponse.status);
        const savedData = await savedResponse.json();
        console.log('Reddit API response data:', savedData);

        if (!savedResponse.ok) {
            console.log('Reddit API error:', savedData);
            return res.status(500).json({ error: 'Reddit API returned error: ' + JSON.stringify(savedData) });
        }

        if (!savedData.data || !savedData.data.children) {
            console.log('Unexpected Reddit response format:', savedData);
            return res.status(500).json({ error: 'Unexpected Reddit response format' });
        }

        // Get existing Reddit posts to avoid duplicates
        const existingPosts = await pool.query(
            'SELECT reddit_post_id FROM bookmarks WHERE user_id = $1 AND reddit_post_id IS NOT NULL',
            [userId]
        );

        const existingIds = new Set(existingPosts.rows.map(row => row.reddit_post_id));

        // Count unique posts (not already imported)
        const uniquePosts = savedData.data.children.filter(child =>
            !existingIds.has(child.data.id)
        );

        res.json({
            username: reddit_username,
            totalSaved: savedData.data.children.length,
            uniqueCount: uniquePosts.length,
            alreadyImported: existingIds.size
        });

    } catch (error) {
        console.error('Error getting Reddit saved count:', error);
        res.status(500).json({ error: 'Failed to get Reddit data' });
    }
});

app.delete('/api/reddit/disconnect', async (req, res) => {
    try {
        const authToken = req.headers.authorization;
        const userId = await validateAuthToken(authToken);

        await pool.query(
            'UPDATE subscriptions SET reddit_access_token = NULL, reddit_username = NULL WHERE user_id = $1',
            [userId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Reddit disconnect error:', error);
        res.status(500).json({ error: 'Failed to disconnect Reddit account' });
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
            INSERT INTO magic_links (email, token, expires_at, redirect_url)
            VALUES ($1, $2, $3, $4)
            `, [email, token, expiresAt, redirect]);

        console.log('Token saved to database');

        // Build magic link URL with optional redirect
        let magicLinkUrl = `${API_BASE}/?token=${token}`;
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
            SELECT email, redirect_url FROM magic_links
            WHERE token = $1
            AND expires_at > NOW()
            AND used = FALSE
        `, [token]);

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired link' });
        }

        const email = result.rows[0].email;
        const redirectUrl = result.rows[0].redirect_url;

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

        // Generate permanent auth token
        let authToken = null;
        if (hasSubscription && userId) {
            authToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

            // Save token to database
            await pool.query('UPDATE subscriptions SET auth_token = $1 WHERE user_id = $2', [authToken, userId]);
        }

        res.json({
            success: true,
            sessionToken,
            email,
            hasSubscription,
            planType,
            authToken,
            redirect: redirectUrl 
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
    const connection = await pool.connect();

    try {
        const { session_id } = req.body;

        // Validate input
        if (!session_id) {
            return res.status(400).json({
                success: false,
                error: 'Session ID is required'
            });
        }

        // Get session from Stripe with validation
        let session, customer;
        try {
            session = await stripe.checkout.sessions.retrieve(session_id);

            if (!session) {
                return res.status(404).json({
                    success: false,
                    error: 'Checkout session not found'
                });
            }

            // Validate session is actually completed and paid
            if (session.payment_status !== 'paid') {
                return res.status(400).json({
                    success: false,
                    error: 'Payment not completed'
                });
            }

            if (!session.customer) {
                return res.status(400).json({
                    success: false,
                    error: 'No customer associated with session'
                });
            }

            customer = await stripe.customers.retrieve(session.customer);

            if (!customer || !customer.email) {
                return res.status(400).json({
                    success: false,
                    error: 'Customer email not found'
                });
            }

        } catch (stripeError) {
            console.error('Stripe API error in auto-login:', stripeError);
            return res.status(500).json({
                success: false,
                error: 'Failed to validate payment session'
            });
        }

        const email = customer.email.toLowerCase().trim();

        // Get subscription with line items to determine plan type
        let subscription, planType;
        try {
            subscription = await stripe.subscriptions.retrieve(session.subscription);

            // Get line items to determine plan type
            const lineItems = await stripe.checkout.sessions.listLineItems(session_id);
            const priceId = lineItems.data[0]?.price?.id;

            if (priceId === process.env.STRIPE_PRICE_ID_1) {
                planType = 'premium';
            } else if (priceId === process.env.STRIPE_PRICE_ID_2) {
                planType = 'pro';
            } else {
                console.warn(`Unknown price ID in auto-login: ${priceId}`);
                planType = 'premium'; // Default fallback
            }

        } catch (stripeError) {
            console.error('Failed to get subscription details:', stripeError);
            return res.status(500).json({
                success: false,
                error: 'Failed to retrieve subscription details'
            });
        }

        // Retry logic for database lookup (handles race condition with webhook)
        let dbSubscription = null;
        let retries = 0;
        const maxRetries = 15; // 15 retries = up to 7.5 seconds

        console.log(`🔄 Looking for subscription for email: ${email}`);

        while (!dbSubscription && retries < maxRetries) {
            try {
                const subscriptionResult = await connection.query(`
                    SELECT user_id, plan_type, auth_token 
                    FROM subscriptions 
                    WHERE LOWER(email) = $1
                `, [email]);

                if (subscriptionResult.rows.length > 0) {
                    dbSubscription = subscriptionResult.rows[0];
                    console.log(`✅ Found subscription for ${email} after ${retries} retries`);
                    break;
                }

                // Wait before retry (exponential backoff)
                const delay = Math.min(500 + (retries * 100), 1000);
                await new Promise(resolve => setTimeout(resolve, delay));
                retries++;

                console.log(`⏳ Subscription not found yet, retry ${retries}/${maxRetries}`);

            } catch (dbError) {
                console.error(`Database error on retry ${retries}:`, dbError);
                // Continue retrying unless it's the last attempt
                if (retries === maxRetries - 1) {
                    throw dbError;
                }
                await new Promise(resolve => setTimeout(resolve, 500));
                retries++;
            }
        }

        // If still not found after retries, create the subscription record
        if (!dbSubscription) {
            console.log(`⚠️ Subscription not found after ${maxRetries} retries, creating manually`);

            try {
                await connection.query('BEGIN');

                const insertResult = await connection.query(`
                    INSERT INTO subscriptions (email, user_id, plan_type, stripe_subscription_id)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (email) DO UPDATE SET
                        user_id = EXCLUDED.user_id,
                        plan_type = EXCLUDED.plan_type,
                        stripe_subscription_id = EXCLUDED.stripe_subscription_id
                    RETURNING user_id, plan_type
                `, [email, customer.id, planType, subscription.id]);

                dbSubscription = insertResult.rows[0];
                await connection.query('COMMIT');

                console.log(`✅ Created subscription record for ${email}`);

            } catch (insertError) {
                await connection.query('ROLLBACK');
                console.error('Failed to create subscription record:', insertError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to create subscription record'
                });
            }
        }

        // Ensure user has a default section for bookmarks
        try {
            const sectionCheck = await connection.query(`
                SELECT id FROM sections WHERE user_id = $1 LIMIT 1
            `, [dbSubscription.user_id]);

            if (sectionCheck.rows.length === 0) {
                await connection.query(`
                    INSERT INTO sections (user_id, name, sort_order, created_at)
                    VALUES ($1, 'Bookmarks', 0, NOW())
                `, [dbSubscription.user_id]);

                console.log(`✅ Created default section for user ${dbSubscription.user_id}`);
            }
        } catch (sectionError) {
            console.error('Failed to create default section:', sectionError);
            // Don't fail the whole request for this
        }

        // Generate or get auth token
        let authToken = dbSubscription.auth_token;

        if (!authToken) {
            authToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

            try {
                await connection.query(`
                    UPDATE subscriptions 
                    SET auth_token = $1 
                    WHERE user_id = $2
                `, [authToken, dbSubscription.user_id]);

                console.log(`✅ Generated auth token for user ${dbSubscription.user_id}`);

            } catch (tokenError) {
                console.error('Failed to save auth token:', tokenError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to generate authentication token'
                });
            }
        }

        // Send welcome email (non-blocking)
        const sendWelcomeEmail = async () => {
            try {
                let subject, greeting;
                if (dbSubscription.plan_type === 'pro') {
                    subject = 'Welcome to KarmaFinder Pro! 🚀';
                    greeting = 'Your Pro account is ready!';      
                } else {
                    subject = 'Welcome to KarmaFinder Premium! ⭐';
                    greeting = 'Your Premium account is ready!';
                }

                await resend.emails.send({
                    from: 'welcome@karmafinder.site',
                    to: email,
                    subject: subject,
                    html: `
       <h2>${greeting}</h2>
       <p>Thanks for supporting KarmaFinder! You now have access to Enhanced Search, unlimited bookmarks, and themes.</p>
       <p><a href="${req.headers.origin}/">Start searching</a></p>
   `
                });

                console.log(`📧 Welcome email sent to ${email}`);

            } catch (emailError) {
                console.error('Failed to send welcome email:', emailError);
                // Log but don't fail the request
                await pool.query(`
                    INSERT INTO monitoring_logs (log_level, endpoint, error_message) 
                    VALUES ($1, $2, $3)
                `, ['warning', '/api/auto-login-after-payment',
                    `Failed to send welcome email to ${email}: ${emailError.message}`]);
            }
        };

        // Send welcome email asynchronously
        sendWelcomeEmail();

        // Return success response
        const response = {
            success: true,
            email: email,
            hasSubscription: true,
            planType: dbSubscription.plan_type,
            authToken: authToken,
            message: 'Login successful! Welcome to KarmaFinder.'
        };

        console.log(`✅ Auto-login successful for ${email} (${dbSubscription.plan_type})`);
        res.json(response);

    } catch (error) {
        // Log error for monitoring
        const now = new Date().toLocaleTimeString();
        await pool.query(`
            INSERT INTO monitoring_logs (log_level, endpoint, error_message) 
            VALUES ($1, $2, $3)
        `, ['error', '/api/auto-login-after-payment', `${now} - ${error.message}`]);

        console.error('Auto-login error:', error);

        res.status(500).json({
            success: false,
            error: 'Login failed. Please try again or contact support.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });

    } finally {
        connection.release();
    }
});

app.post('/verify-token', async (req, res) => {
    const { token } = req.body;

    try {
        const result = await pool.query('SELECT auth_token FROM subscriptions WHERE auth_token = $1', [token]);

        if (result.rows.length > 0) {
            res.json({ valid: true });
        } else {
            res.json({ valid: false });
        }
    } catch (error) {
        console.error('Error verifying token:', error);
        res.json({ valid: false });
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
                        return_url: `${req.headers.origin}/`,
                    });

                    return res.json({ url: session.url, isPortal: true });
                }
            }
        }

        const sessionData = {
            payment_method_types: ['card'],
            line_items: [{
                price: process.env.STRIPE_PRICE_ID_1,
                quantity: 1,
            }],
            mode: 'subscription',
            success_url: `${req.headers.origin}/?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/`,
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
                        return_url: `${req.headers.origin}/`,
                    });

                    return res.json({ url: session.url, isPortal: true });
                }
            }
        }

        const sessionData = {
            payment_method_types: ['card'],
            line_items: [{
                price: process.env.STRIPE_PRICE_ID_2,
                quantity: 1,
            }],
            mode: 'subscription',
            success_url: `${req.headers.origin}/?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/`,
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

const { Pinecone } = require('@pinecone-database/pinecone');
const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY
});

app.post('/api/vector-search', async (req, res) => {
    try {
        const {
            query,
            subreddit: rawSubreddit = null,
            limit = 20,
            minScore = 25,
            timeFilter = 'all'
        } = req.body;

        // === SCORING CONFIGURATION - EASY TO ADJUST ===
        const SCORING_CONFIG = {
            // Base vector similarity weight (0.0 - 1.0)
            vectorSimilarity: 0.9,

            // Title matching boosts
            titleFullMatch: 2.0,      // Exact phrase match in title
            titlePartialMatch: 0.8,   // Per word match in title

            // Missing word penalties
            missingWordPenalty: -0.5, // Penalty per missing important word
            minWordLength: 3,         // Only penalize missing words >= this length

            // Subreddit matching (if query contains subreddit name)
            subredditFullMatch: 3.8,  // Full subreddit name match

            // Subtle boosts
            recencyBoost: 0.25,       // Max boost for newest posts
            upvoteBoost: 2.5,        // Max boost for highly upvoted posts

            // Normalization factors
            maxUpvotes: 1,        // Posts above this get max upvote boost
            maxAgeDays: 365           // Posts older than this get no recency boost
        };

        const subreddit = rawSubreddit ? rawSubreddit.toLowerCase() : null;

        // Check Redis cache first
        const cachedResults = await getCachedVectorSearch(query, subreddit, timeFilter);
        if (cachedResults) {
            return res.json(cachedResults);
        }

        const embedding = await getSearchEmbedding(query);
        if (!embedding) {
            return res.status(500).json({ error: 'Failed to get embedding' });
        }

        // Build Pinecone filter
        const filter = {
            score: { $gte: minScore }
        };

        // Add time filter
        if (timeFilter !== 'all') {
            const now = Math.floor(Date.now() / 1000);
            let timeCutoff = 0;

            switch (timeFilter) {
                case "hour": timeCutoff = now - 7140; break;
                case "day": timeCutoff = now - 169200; break;
                case "week": timeCutoff = now - 604800; break;
                case "month": timeCutoff = now - 2592000; break;
                case "year": timeCutoff = now - 31536000; break;
                default: timeCutoff = 0;
            }

            if (timeCutoff > 0) {
                filter.created_utc = { $gte: timeCutoff };
            }
        }

        // Add subreddit filter
        if (subreddit) {
            filter.subreddit = { $eq: subreddit };
        }

        // Query Pinecone
        const index = pc.index('reddit-posts');
        const queryResponse = await index.query({
            vector: embedding,
            topK: limit * 5,
            filter: filter,
            includeMetadata: true,
            includeValues: false
        });

        // === SCORING LOGIC ===
        const scoredResults = queryResponse.matches.map(match => {
            const similarity = match.score;
            const metadata = match.metadata;

            const queryLower = query.toLowerCase();
            const titleLower = (metadata.title || '').toLowerCase();
            const subredditName = (metadata.subreddit || '').toLowerCase();

            // 1. TITLE MATCHING
            let titleScore = 0;
            let missingWordPenalty = 0;

            if (titleLower.includes(queryLower)) {
                titleScore = SCORING_CONFIG.titleFullMatch;
            } else {
                const queryWords = queryLower.split(/\s+/).filter(word => word.length >= SCORING_CONFIG.minWordLength);
                const titleWords = titleLower.split(/\s+/);

                let matchedWords = 0;
                let missingWords = 0;

                queryWords.forEach(word => {
                    if (titleWords.some(titleWord => titleWord.includes(word))) {
                        matchedWords++;
                    } else {
                        missingWords++;
                    }
                });

                if (matchedWords > 0) {
                    titleScore = (matchedWords / queryWords.length) * SCORING_CONFIG.titlePartialMatch;
                }

                missingWordPenalty = missingWords * SCORING_CONFIG.missingWordPenalty;
            }

            // 2. SUBREDDIT MATCHING
            let subredditScore = 0;
            const queryWords = queryLower.split(/\s+/);
            for (const word of queryWords) {
                if (subredditName === word || subredditName.includes(word)) {
                    subredditScore = SCORING_CONFIG.subredditFullMatch;
                    break;
                }
            }

            // 3. RECENCY BOOST
            const now = Math.floor(Date.now() / 1000);
            const postAgeDays = (now - metadata.created_utc) / (24 * 60 * 60);
            const recencyScore = Math.max(0,
                (SCORING_CONFIG.maxAgeDays - postAgeDays) / SCORING_CONFIG.maxAgeDays
            ) * SCORING_CONFIG.recencyBoost;

            // 4. UPVOTE BOOST
            const upvoteScore = Math.min(metadata.score / SCORING_CONFIG.maxUpvotes, 1.0) * SCORING_CONFIG.upvoteBoost;

            // 5. FINAL WEIGHTED SCORE
            const finalScore =
                similarity * SCORING_CONFIG.vectorSimilarity +
                titleScore +
                missingWordPenalty +
                subredditScore +
                recencyScore +
                upvoteScore;

            return {
                ...match,
                similarity,
                weighted_score: finalScore,
                debug: {
                    titleScore,
                    missingWordPenalty,
                    subredditScore,
                    recencyScore,
                    upvoteScore,
                    vectorScore: similarity * SCORING_CONFIG.vectorSimilarity
                },
                payload: metadata
            };
        });

        // Sort by final score, remove duplicates, then limit results
        const seen = new Set();
        const finalResults = scoredResults
            .sort((a, b) => b.weighted_score - a.weighted_score)
            .filter(result => {
                const id = result.payload.reddit_post_id;
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            })
            .slice(0, limit);

        // Check for empty results
        if (finalResults.length === 0) {
            const emptyResponse = {
                data: {
                    children: [],
                    after: null,
                    before: null
                }
            };
            await setCachedVectorSearch(query, subreddit, timeFilter, emptyResponse);
            return res.json(emptyResponse);
        }

        // Log top results for debugging
        console.log('Top 3 results scoring breakdown:');
        finalResults.slice(0, 3).forEach((hit, i) => {
            const d = hit.debug;
            console.log(`${i + 1}. Vector: ${d.vectorScore.toFixed(3)} | Title: ${d.titleScore.toFixed(3)} | Missing: ${d.missingWordPenalty.toFixed(3)} | Subreddit: ${d.subredditScore.toFixed(3)} | Recent: ${d.recencyScore.toFixed(3)} | Upvotes: ${d.upvoteScore.toFixed(3)} | TOTAL: ${hit.weighted_score.toFixed(3)}`);
            console.log(`   Title: "${hit.payload.title.substring(0, 80)}..."`);
        });

        // Format response
        const response_data = {
            data: {
                children: finalResults.map(hit => ({
                    data: {
                        id: hit.payload.reddit_post_id,
                        title: hit.payload.title,
                        url: hit.payload.url,
                        permalink: hit.payload.permalink,
                        subreddit: hit.payload.subreddit,
                        score: hit.payload.score,
                        is_video: hit.payload.is_video,
                        domain: hit.payload.domain,
                        author: hit.payload.author,
                        created_utc: hit.payload.created_utc,
                        num_comments: hit.payload.num_comments,
                        over_18: hit.payload.over_18,
                        selftext: hit.payload.selftext,
                        body: hit.payload.body,
                        is_gallery: hit.payload.is_gallery,
                        gallery_data: hit.payload.gallery_data ? JSON.parse(hit.payload.gallery_data) : null,
                        media_metadata: hit.payload.media_metadata ? JSON.parse(hit.payload.media_metadata) : null,
                        crosspost_parent_list: hit.payload.crosspost_parent_list ? JSON.parse(hit.payload.crosspost_parent_list) : [],
                        content_type: hit.payload.content_type,
                        locked: hit.payload.locked,
                        stickied: hit.payload.stickied,
                        preview: hit.payload.preview ? JSON.parse(hit.payload.preview) : null,
                        similarity: hit.similarity,
                        weighted_score: hit.weighted_score
                    }
                })),
                after: null,
                before: null
            }
        };

        // Cache the results
        await setCachedVectorSearch(query, subreddit, timeFilter, response_data);
        res.json(response_data);

    } catch (error) {
        console.error('Vector search error:', error.message);
        res.status(500).json({ error: 'Vector search failed' });
    }
});

app.get('/admin', (req, res) => {
    const urlKey = req.query.key;
    if (urlKey !== process.env.ADMIN_SECRET) {
        return res.status(404).send('Page not found');
    }

    const filePath = path.join(__dirname, '..', 'html', 'admin.html');
    res.sendFile(filePath);
});

app.get('/api/admin/emergency/status', requireAdmin, (req, res) => {
    res.json({ emergencyMode, fallbackMode });
});

app.post('/api/admin/emergency/:mode', requireAdmin, (req, res) => {
    const { mode } = req.params;
    if (!['json', 'rss', 'oauth'].includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode' });
    }
    activateEmergency(mode);
    res.json({ success: true, message: `Emergency mode activated: ${mode}` });
});

app.get('/api/rare-line', (req, res) => {
    const rareChance = Math.random();
    if (rareChance < 0.001) {
        const randomChoice = Math.random();
        if (randomChoice < 0.7) {
            const randomLines = [1, 2, 3, 4, 8, 9];
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

async function getSearchEmbedding(query) {
    try {
        const response = await axios.post('http://localhost:5000/embed', {
            texts: [query]
        });

        console.log('Flask returned:', response.data);
        console.log('Embedding type:', typeof response.data.embeddings[0]);
        console.log('Embedding length:', response.data.embeddings[0]?.length);

        return response.data.embeddings[0];
    } catch (error) {
        console.error('❌ Search embedding error:', error.message);
        return null;
    }
}

// 🔁 START SERVER LOGIC
async function startServer() {
    const token = await getRedditAppToken();
    console.log('✅ Reddit app token fetched:', token.slice(0, 12), '...');

    const server = app.listen(PORT, () => {
        const host = process.env.NODE_ENV === 'production'
            ? 'https://karmafinder.site'
            : `http://localhost:${PORT}`;

        console.log(`🚀 FETCH server running at ${host}`);

        // Start system monitoring 
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