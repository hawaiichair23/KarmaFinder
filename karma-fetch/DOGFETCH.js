
const { exec } = require('child_process');
const { promisify } = require('util');
const util = require('util');
const fs = require('fs');
const tmp = require('tmp-promise');
const execAsync = promisify(exec);
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const pool = require('./db');
const app = express();
const PORT = 3000;

const axios = require('axios');
const cheerio = require('cheerio');
        
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    origin: '*',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

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

// Request timeout
app.use((_req, res, next) => {
    setTimeout(() => {
        if (!res.headersSent) {
            res.send('Page took too long to load, try again');
        }
    }, 10000); // 10 seconds
    next();
});

function shouldRunFFProbe(url) {
    const cleaned = (url || '').toLowerCase();
    const ext = cleaned.split('.').pop().split('?')[0];
    const mediaExtensions = ['gif', 'gifv', 'mp4', 'webm'];
    const mediaDomains = ['i.imgur.com', 'v.redd.it', 'streamable.com', 'redgifs.com'];
    return mediaExtensions.includes(ext) || mediaDomains.some(domain => cleaned.includes(domain));
}

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
    
    console.log('🧪 Media URL check:', url);

    // 🧪 Media analysis
    if (shouldRunFFProbe(url)) {
        console.log(`📼 Running FFprobe on media URL: ${url}`);
        try {
            // Create temp file
            const { path: filePath, cleanup } = await tmp.file({ postfix: '.media' });

            // Download the media file
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to download media: ${response.statusText}`);
            const buffer = await response.buffer();
            fs.writeFileSync(filePath, buffer);

            // Run ffprobe
            const ffprobeCmd = `ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames,width,height,duration -of default=noprint_wrappers=1 "${filePath}"`;
            const { stdout } = await execAsync(ffprobeCmd);

            // Parse output
            const result = {};
            stdout.split('\n').forEach(line => {
                const [key, val] = line.trim().split('=');
                if (key && val) result[key] = val;
            });

            const frameCount = parseInt(result.nb_read_frames || '0', 10);
            const animated = frameCount > 1;
            const width = parseInt(result.width || '0', 10);
            const height = parseInt(result.height || '0', 10);
            const duration = parseFloat(result.duration || '0');
            const type = url.split('.').pop().split('?')[0];

            // Insert into media_analysis
            await pool.query(`
                INSERT INTO media_analysis (url, type, frame_count, animated, width, height, duration)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (url) DO NOTHING
            `, [url, type, frameCount, animated, width, height, duration]);

            cleanup(); // Remove temp file

        } catch (err) {
            console.warn(`⚠️ FFprobe failed for ${url}:`, err.message);
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

app.get('/api/get-cached-posts', async (req, res) => {
    try {
        const result = await pool.query(`
        SELECT 
            p.*, 
            m.animated, 
            m.frame_count,
            m.duration
        FROM posts p
        LEFT JOIN media_analysis m ON p.url = m.url
        WHERE m.animated IS NOT NULL
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ DB fetch error:', err.message);
        res.status(500).json({ error: 'Failed to fetch cached posts' });
    }
});

app.get('/reddit', async (req, res) => {
    const encodedUrl = req.query.url;
    let decodedUrl = decodeURIComponent(encodedUrl);

    console.log('🔍 Decoded URL:', decodedUrl);

    // Ensure it’s a Reddit URL
    if (!decodedUrl.startsWith('https://www.reddit.com/')) {
        return res.status(403).send('Only Reddit URLs are allowed');
    }

    // Check if this is a subreddit search request
    if (decodedUrl.includes('subreddits/search.json')) {
        // Extract the search query
        const urlParams = new URL(decodedUrl, 'https://example.com').searchParams;
        const query = urlParams.get('q')?.trim().toLowerCase();
        console.log('🔍 Subreddit search query:', query);

        if (query) {
            try {

                const cachedResult = await pool.query(
                    "SELECT results, created_at FROM subreddit_search_cache WHERE query_term = $1",
                    [query]
                );

                if (cachedResult.rows.length > 0) {
                    console.log(`🚀 Cache hit for query: ${query}`);
                    const cachedData = cachedResult.rows[0].results;

                    // Loop through each subreddit in the results
                    for (let child of cachedData.data.children) {
                        const subreddit = child.data.display_name;
                        console.log(`🔎 Checking icon for r/${subreddit}`);

                        try {
                            // Try to get the icon from your table
                            const iconRes = await pool.query(
                                'SELECT icon_url FROM subreddit_icons WHERE subreddit = $1',
                                [subreddit]
                            );

                            console.log(`📦 iconRes for r/${subreddit}:`, iconRes.rows);

                            if (iconRes.rows.length > 0) {
                                child.icon_url = iconRes.rows[0].icon_url; // Allowed to be null
                            } else {
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
                                    aboutData.data.mobile_banner_image ||
                                    aboutData.data.icon_img ||
                                    aboutData.data.header_img ||
                                    aboutData.data.banner_img ||
                                    ''
                                ).replace(/&amp;/g, '&').trim();

                                const iconUrl = rawIcon || null;
                                child.icon_url = iconUrl;

                                // Save the icon to your DB for next time
                                await pool.query(`
                    INSERT INTO subreddit_icons (subreddit, icon_url, created_at)
                    VALUES ($1, $2, NOW())
                    ON CONFLICT (subreddit)
                    DO UPDATE SET icon_url = EXCLUDED.icon_url, created_at = NOW()
                `, [subreddit, iconUrl]);

                                console.log(`💾 Saved icon for r/${subreddit} from /about.json`);
                            }

                        } catch (err) {
                            console.error(`❌ Failed to fetch icon for r/${subreddit}:`, err.message);
                            child.icon_url = null;
                        }
                    }

                    // After all icons have been checked or fetched, send the result
                    return res.json(cachedData);
                }

                console.log("⚡ Fetching from Reddit because no cache hit");

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
        if (data?.data?.children?.length > 10) {
            data.data.children = data.data.children.slice(0, 10);
        }

        if (data?.data?.children) {
            for (let child of data.data.children) {
                const subreddit = child.data.subreddit;

                try {
                    // Try to get the icon from your table
                    const iconRes = await pool.query(
                        'SELECT icon_url FROM subreddit_icons WHERE subreddit = $1',
                        [subreddit]
                    );

                    if (iconRes.rows.length > 0) {
                        child.icon_url = iconRes.rows[0].icon_url;
                    } else {
                        // No icon in DB – fetch it from Reddit
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
                            aboutData.data.mobile_banner_image ||
                            aboutData.data.icon_img ||
                            aboutData.data.header_img ||
                            aboutData.data.banner_img ||
                            ''
                        ).replace(/&amp;/g, '&').trim();

                        const iconUrl = rawIcon || null;
                        child.icon_url = iconUrl;

                        // Save the icon for next time
                        await pool.query(`
                    INSERT INTO subreddit_icons (subreddit, icon_url, created_at)
                    VALUES ($1, $2, NOW())
                    ON CONFLICT (subreddit)
                    DO UPDATE SET icon_url = EXCLUDED.icon_url, created_at = NOW()
                `, [subreddit, iconUrl]);

                        console.log(`💾 Saved icon for r/${subreddit} from live /about.json`);
                    }
                } catch (err) {
                    console.error(`❌ Failed to fetch or cache icon for r/${subreddit}:`, err.message);
                    child.icon_url = null;
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
                            children: data.data.children
                                .filter(child => child && child.data && child.data.display_name) // ✅ Prevent [null]
                                .map(child => ({
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
            res.setHeader('Access-Control-Allow-Origin', '*');
            console.error(`[⚠️] Image source returned status ${response.status}: ${imageUrl}`);
            const body = await response.text();
            console.error('❌ Response body:', body.slice(0, 300));
            return res.status(response.status).send(`Source returned ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            console.error('[⚠️] Not image content:', contentType, '| URL:', imageUrl);
            return res.status(400).send('Invalid image content.');
        }

        const imageBuffer = await response.arrayBuffer();
        if (!imageBuffer || imageBuffer.byteLength === 0) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            console.warn('⚠️ Empty image buffer:', imageUrl);
            return res.status(500).send('Empty image data.');
        }

        res.setHeader('Access-Control-Allow-Origin', '*'); // ✅ HERE
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', imageBuffer.byteLength);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        res.setHeader('ETag', `"${Date.now()}"`);

        res.send(Buffer.from(imageBuffer));
    } catch (err) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        console.error('[🔥] Error fetching image:', err.message);
        res.status(500).send('Error fetching image: ' + err.message);
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
                const position = i;
          
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
        console.error('Error in db-posts endpoint:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/analyze-media', async (req, res) => {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
        return res.status(400).json({ success: false, message: 'Invalid or missing URL' });
    }

    try {
        // Create temp file
        const { path: filePath, cleanup } = await tmp.file({ postfix: '.media' });

        // Download media
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' // Pretend to be a browser
            }
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '[binary]');
            throw new Error(`Fetch failed: ${response.status} ${response.statusText}\n${body}`);
        }

        const buffer = await response.buffer();
        fs.writeFileSync(filePath, buffer);

        // Run ffprobe
        const ffprobeCmd = `ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames,width,height,duration -of default=noprint_wrappers=1 "${filePath}"`;
        const { stdout } = await execAsync(ffprobeCmd);

        const result = {};
        stdout.split('\n').forEach(line => {
            const [key, val] = line.trim().split('=');
            if (key && val) result[key] = val;
        });

        const frameCount = parseInt(result.nb_read_frames || '0', 10);
        const animated = frameCount > 1;
        const width = parseInt(result.width || '0', 10);
        const height = parseInt(result.height || '0', 10);
        const duration = parseFloat(result.duration || '0');

        // Save to DB
        await pool.query(`
            INSERT INTO media_analysis (url, type, frame_count, animated, width, height, duration)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (url) DO NOTHING
        `, [url, 'video', frameCount, animated, width, height, duration]);

        res.status(200).json({
            success: true,
            message: 'Media analyzed',
            data: { url, frameCount, animated, width, height, duration }
        });

    } catch (err) {
        console.error('❌ Media analysis failed:', err.message);
        res.status(500).json({ success: false, message: 'Media analysis failed' });
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

        if (!stripeCustomerId) {
            return res.status(400).json({ success: false, error: 'Missing customer ID' });
        }

        if (!postId) {
            return res.status(400).json({ success: false, error: 'Missing post ID' });
        }

        // Stringify JSON fields 
        const galleryData = (gallery_data && gallery_data !== null && !gallery_data.includes(null) && Object.keys(gallery_data || {}).length > 0) ? JSON.stringify(gallery_data) : null;
        const mediaMetadata = (media_metadata && media_metadata !== null && !media_metadata.includes(null) && Object.keys(media_metadata || {}).length > 0) ? JSON.stringify(media_metadata) : null;
        const crosspostList = (crosspost_parent_list && crosspost_parent_list !== null && crosspost_parent_list.length > 0 && !crosspost_parent_list.includes(null)) ? JSON.stringify(crosspost_parent_list) : null;
        const previewData = (preview && preview !== null && Object.keys(preview || {}).length > 0) ? JSON.stringify(preview) : null;

        // Insert bookmark
        await pool.query(
            `INSERT INTO bookmarks (
                user_id, reddit_post_id, title, url, permalink, subreddit, score, 
                is_video, domain, author, created_utc, num_comments, over_18, 
                selftext, body, is_gallery, gallery_data, media_metadata, 
                crosspost_parent_list, content_type, icon_url, locked, stickied, preview
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) 
            ON CONFLICT (user_id, reddit_post_id) DO NOTHING`,
            [
                stripeCustomerId, postId, title, url, permalink, subreddit, score,
                is_video, domain, author, created_utc, num_comments, over_18,
                selftext, body, is_gallery, galleryData, mediaMetadata,
                crosspostList, content_type, icon_url, locked, stickied, previewData
            ]
        );

        res.json({ success: true, message: 'Bookmark added' });
    } catch (error) {
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
        console.error('Error removing bookmark:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Get all bookmarks for a user
app.get('/api/bookmarks/:stripeCustomerId', async (req, res) => {
    try {
        const { stripeCustomerId } = req.params;
        const result = await pool.query(`
            SELECT reddit_post_id, title, url, permalink, subreddit, score,
                   is_video, domain, author, created_utc, num_comments, over_18,
                   selftext, body, is_gallery, gallery_data, media_metadata,
                   crosspost_parent_list, content_type, icon_url, locked, stickied, preview
            FROM bookmarks
            WHERE user_id = $1
            ORDER BY created_at DESC
        `, [stripeCustomerId]);
        res.json({ bookmarks: result.rows });
    } catch (error) {
        console.error('GET bookmarks error:', error);
        res.status(500).json({ error: error.message });
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