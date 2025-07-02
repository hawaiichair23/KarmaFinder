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
app.use(express.static(path.join(__dirname, '../html')));

require('dotenv').config();
require('./cron-cleanup');

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


app.get('/reddit/icons', async (req, res) => {

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
                    aboutData.data.icon_img ||
                    aboutData.data.community_icon ||
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
            ? `KarmaFinder - "${searchQuery}" in r/${subreddit} Search Results`
            : `KarmaFinder - "${searchQuery}" Search Results`;

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

        // Filter out Reddit videos
        if (url.includes('v.redd.it')) {
            throw new Error('Reddit videos are not supported');
        }

        // Filter out Reddit images
        if (url.includes('i.redd.it')) {
            throw new Error('Reddit videos are not supported');
        }

        // Download media
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '[binary]');
            throw new Error(`Fetch failed: ${response.status} ${response.statusText}\n${body}`);
        }

        const buffer = await response.buffer();
        await fs.promises.writeFile(filePath, buffer);

        // Check if file is actually video before FFprobe
        if (buffer.length < 1000) {
            throw new Error('Downloaded file too small, probably not a video');
        }
        
        // Check for common video file signatures
        const header = buffer.toString('hex', 0, 12);
        if (!header.includes('000018667479') && // MP4
            !header.includes('1a45dfa3') &&     // WebM
            !header.includes('464c5601')) {     // FLV
            throw new Error('Downloaded file is not a valid video format');
        }

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
            'SELECT id FROM sections WHERE user_id = $1 AND name = $2',
            [stripeCustomerId, 'Bookmarks']
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

        // Insert bookmark
        await pool.query(
            `INSERT INTO bookmarks (
                user_id, reddit_post_id, title, url, permalink, subreddit, score,
                is_video, domain, author, created_utc, num_comments, over_18,
                selftext, body, is_gallery, gallery_data, media_metadata,
                crosspost_parent_list, content_type, icon_url, locked, stickied, preview, section_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
            ON CONFLICT (user_id, reddit_post_id) DO NOTHING`,
            [
                stripeCustomerId, postId, title, url, permalink, subreddit, score,
                is_video, domain, author, created_utc, num_comments, over_18,
                selftext, body, is_gallery, galleryData, mediaMetadata,
                crosspostList, content_type, icon_url, locked, stickied, previewData, sectionId
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
        console.error('Error updating bookmark order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 6. Get bookmarks by section
app.get('/api/bookmarks/:userId/section/:sectionId', async (req, res) => {
    try {
        const { userId, sectionId } = req.params;
        const offset = parseInt(req.query.offset) || 0;
        const limit = parseInt(req.query.limit) || 10;
        console.log('userId:', userId, 'sectionId:', sectionId, 'limit:', limit, 'offset:', offset);
        const result = await pool.query(`
            SELECT * FROM bookmarks
            WHERE user_id = $1 AND section_id = $2
            ORDER BY sort_order ASC, created_utc ASC, reddit_post_id
            LIMIT $3 OFFSET $4
        `, [userId, sectionId, limit, offset]);
        console.log('Returned bookmarks:', result.rows.length);
        res.json({ bookmarks: result.rows });
    } catch (error) {
        console.error('Error fetching section bookmarks:', error);
        res.status(500).json({ error: 'Failed to fetch bookmarks' });
    }
});

// 7. Get all sections for a user
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
        console.error('Error fetching sections:', error);
        res.status(500).json({ error: 'Failed to fetch sections' });
    }
});

// 8. Move bookmark to different section
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
            SELECT id, name, sort_order, created_at
            FROM sections
            WHERE user_id = $1
            ORDER BY sort_order ASC
        `, [stripeCustomerId]);

        res.json({ sections: result.rows });
    } catch (error) {
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
        const { name } = req.body;

        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Section name cannot be empty' });
        }

        const query = `
            UPDATE sections 
            SET name = $1 
            WHERE id = $2 AND user_id = $3
            RETURNING id, name
        `;

        const result = await pool.query(query, [name.trim(), sectionId, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Section not found' });
        }

        console.log(`✅ Renamed section ${sectionId} to "${name}" for user ${userId}`);
        res.json({ success: true, section: result.rows[0] });

    } catch (error) {
        console.error('Error renaming section:', error);
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
        setTimeout(async () => {
            try {
                await fs.promises.unlink(outputPath);
                console.log(`🗑️ Deleted ${outputFileName}`);
            } catch (err) {
                console.log(`❌ Failed to delete ${outputFileName}:`, err.message);
            }
        }, 7 * 60 * 1000);

    } catch (err) {
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
        ff.stderr.on('data', d => process.stdout.write(d.toString()));
        ff.on('error', reject);
        ff.on('close', code => {
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
        ff.stderr.on('data', d => process.stdout.write(d.toString()));
        ff.on('error', reject);
        ff.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg exited with code ${code}`));
        });
    });
}

app.post('/api/auth/magic-link', async (req, res) => {
    const { email } = req.body;

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // 20 minutes

    try {
        // Save token to database
        await pool.query(`
      INSERT INTO magic_links (email, token, expires_at) 
      VALUES ($1, $2, $3)
    `, [email, token, expiresAt]);
        console.log('Token saved to database'); 

        // Send email
        await resend.emails.send({
            from: 'login@karmafinder.site',
            to: email,
            subject: 'Log in to KarmaFinder',
            html: `
        <p>Click the link below to log in:</p>
        <a href="http://localhost:3000/auth/verify/${token}">Log in to KarmaFinder</a>
        <p>This link expires in 20 minutes.</p>
      `
        });
        console.log('Email sent successfully');

        res.json({ success: true });
    } catch (error) {
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

        // Mark token as used
        await pool.query(`
      UPDATE magic_links SET used = TRUE WHERE token = $1
    `, [token]);

        // Create session/JWT
        const sessionToken = jwt.sign({ email }, JWT_SECRET);

        res.json({ success: true, sessionToken, email });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

app.get('/api/rare-line', (req, res) => {
    const rareChance = Math.random();
    if (rareChance < 0.005) {
        const randomChoice = Math.random();

        if (randomChoice < 0.7) { // 70% chance for lines 1-4 and 8 (random)
            const randomLines = [1, 2, 3, 4, 8];
            const selectedLine = randomLines[Math.floor(Math.random() * randomLines.length)];
            const line = process.env[`HERMES_RARE_LINE_${selectedLine}`];
            res.json({ line: line });
        } else { // 30% chance for sequential lines 5, 6, 7
            res.json({
                sequential: [
                    process.env.HERMES_RARE_LINE_5,
                    process.env.HERMES_RARE_LINE_6,
                    process.env.HERMES_RARE_LINE_7
                ]
            });
        }
    } else {
        res.json({ line: null }); // No rare line
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