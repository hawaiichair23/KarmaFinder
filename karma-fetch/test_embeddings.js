require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');
let redditTokenExpiry = 0;

const REDDIT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/113.0.0.0 Safari/537.36';

// Test with just these 3 subreddits
const TEST_SUBS = ['funny', 'askreddit', 'gaming'];

// Initialize PostgreSQL client
const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL
});

// Reddit OAuth token
let redditToken = null;

// Replace the getRedditToken function with this:
async function getRedditToken() {
    const now = Date.now();
    if (redditToken && now < redditTokenExpiry) return redditToken;

    const basicAuth = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64');

    try {
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
    } catch (error) {
        console.error('❌ Failed to get Reddit token:', error.message);
        process.exit(1);
    }
}
async function fetchRedditPosts(subreddit, limit = 100, after = null) {
    const url = `https://oauth.reddit.com/r/${subreddit}/hot`;
    const params = { limit };
    if (after) params.after = after;

    try {
        const response = await axios.get(url, {
            params,
            headers: {
                'Authorization': `Bearer ${redditToken}`,
                'User-Agent': REDDIT_USER_AGENT
            }
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        return response.data.data;
    } catch (error) {
        console.error(`❌ Error fetching r/${subreddit}:`, error.response?.status || error.message);
        return null;
    }
}

function extractPostData(postData) {
    const post = postData.data;

    return {
        reddit_post_id: post.id,
        title: post.title,
        url: post.url || null,
        permalink: post.permalink || null,
        subreddit: post.subreddit,
        score: post.score ?? null,
        is_video: post.is_video ?? false,
        domain: post.domain || null,
        author: post.author || '[deleted]',
        created_utc: post.created_utc ?? null,
        num_comments: post.num_comments ?? 0,
        over_18: post.over_18 ?? false,
        selftext: post.selftext || '',
        body: null,
        is_gallery: post.is_gallery ?? false,
        gallery_data: post.gallery_data ?? null,
        media_metadata: post.media_metadata ?? null,
        crosspost_parent_list: post.crosspost_parent_list ?? null,
        content_type: post.is_video ? 'video' : (post.post_hint === 'image' ? 'image' : 'text'),
        icon_url: null,
        locked: post.locked ?? false,
        stickied: post.stickied ?? false,
        preview: post.preview ?? null,
        indexed_at: new Date().toISOString(),
        page_group: null,
        position: null,
        embedding: null,
        cache_expires_at: null
    };
}

async function getEmbeddings(texts) {
    try {
        const response = await axios.post('http://localhost:5000/embed', {
            texts: texts
        });
        return response.data.embeddings;
    } catch (error) {
        console.error('❌ Embedding server error:', error.message);
        return null;
    }
}

async function insertBatch(posts) {
    const client = await pool.connect();
    try {
        const query = `
            INSERT INTO posts_embeddings (
                reddit_post_id, title, url, permalink, subreddit, score, is_video, domain, author,
                created_utc, num_comments, over_18, selftext, body, is_gallery, gallery_data,
                media_metadata, crosspost_parent_list, content_type, icon_url, locked, stickied,
                preview, indexed_at, page_group, position, embedding, cache_expires_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
        `;

        for (const post of posts) {
            const values = [
                post.reddit_post_id, post.title, post.url, post.permalink, post.subreddit,
                post.score, post.is_video, post.domain, post.author, post.created_utc,
                post.num_comments, post.over_18, post.selftext, post.body, post.is_gallery,
                JSON.stringify(post.gallery_data), JSON.stringify(post.media_metadata),
                JSON.stringify(post.crosspost_parent_list), post.content_type, post.icon_url,
                post.locked, post.stickied, JSON.stringify(post.preview), post.indexed_at,
                post.page_group, post.position, JSON.stringify(post.embedding), post.cache_expires_at
            ];

            await client.query(query, values);
        }

        console.log(`✅ Inserted ${posts.length} posts`);
        return true;
    } catch (error) {
        console.error('❌ Insert batch error:', error.message);
        return false;
    } finally {
        client.release();
    }
}

async function processSubreddit(subreddit, targetCount) {
    console.log(`\n🔄 Processing r/${subreddit} (target: ${targetCount} posts)`);

    const data = await fetchRedditPosts(subreddit, 100);
    if (!data || !data.children || data.children.length === 0) {
        console.log(`❌ No posts found for r/${subreddit}`);
        return;
    }

    // Extract post data and take only what we need
    const posts = data.children.map(extractPostData).slice(0, targetCount);
    console.log(`📊 Collected ${posts.length} posts from r/${subreddit}`);

    // Prepare texts for embedding
    const texts = posts.map(post => `${post.title} ${post.selftext}`.trim());

    // Get embeddings
    const embeddings = await getEmbeddings(texts);
    if (!embeddings) return;

    // Add embeddings to posts
    posts.forEach((post, index) => {
        post.embedding = embeddings[index];
    });

    // Insert posts
    await insertBatch(posts);
}

async function main() {
    console.log('🧪 Starting TEST Reddit embedding pipeline');

    // Get Reddit OAuth token
    await getRedditToken();

    // Process 3 test subreddits with 5 posts each
    console.log('\n🔬 Processing TEST_SUBS (5 posts each)');
    for (const sub of TEST_SUBS) {
        await processSubreddit(sub, 5);
    }

    console.log('\n🎉 Test complete! Check your posts_embeddings table for 15 entries.');
}

main().catch(console.error);