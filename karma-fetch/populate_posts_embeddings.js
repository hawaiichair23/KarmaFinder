require('dotenv').config();
const axios = require('axios');
const { QdrantClient } = require('@qdrant/js-client-rest');
let redditTokenExpiry = 0;

const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY
});
 
let totalPointsInserted = 355780;

// Later: consider going up to 1200 for the biggest subs? that'd add 300 to current ones

const BIG_SUBS = [
 
]

const MEDIUM_SUBS = [

]

// Reddit OAuth token
let redditToken = null;

async function getRedditToken() {
    const now = Date.now();
    if (redditToken && now < redditTokenExpiry) return redditToken;

    const basicAuth = Buffer.from(`${process.env.REDDIT_CLIENT_1_ID}:${process.env.REDDIT_CLIENT_1_SECRET}`).toString('base64');

    try {
        const res = await fetch('https://www.reddit.com/api/v1/access_token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': process.env.REDDIT_USER_AGENT_1
            },
            body: 'grant_type=client_credentials'
        });

        const data = await res.json();
        if (data.access_token) {
            redditToken = data.access_token;
            redditTokenExpiry = now + (data.expires_in || 3600) * 1000;
            console.log("Got Reddit token:", redditToken.slice(0, 16) + '...');
            return redditToken;
        } else {
            console.error("Failed to get Reddit token:", data);
            throw new Error("Could not fetch token");
        }
    } catch (error) {
        console.error('Failed to get Reddit token:', error.message);
        process.exit(1);
    }
}

async function createCollection() {
    try {
        const response = await fetch(`${process.env.QDRANT_URL}/collections/reddit_posts`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.QDRANT_API_KEY
            },
            body: JSON.stringify({
                vectors: {
                    size: 768,
                    distance: "Cosine"
                }
            })
        });

        if (response.ok) {
            console.log("Created reddit_posts collection");
        } else {
            console.log("ℹCollection already exists or error:", await response.text());
        }
    } catch (error) {
        console.error('Error creating collection:', error.message);
    }
}

let apiRequestCount = 0;

async function fetchRedditPosts(subreddit, limit = 100, after = null) {
    const url = `https://oauth.reddit.com/r/${subreddit}/hot`;
    const params = {
        limit
    };
    if (after) params.after = after;

    try {
        const response = await axios.get(url, {
            params,
            headers: {
                'Authorization': `Bearer ${redditToken}`,
                'User-Agent': process.env.REDDIT_USER_AGENT_1
            }
        });
        apiRequestCount++;
        console.log(`📡 API Request ${apiRequestCount}`);
        await new Promise(resolve => setTimeout(resolve, 100));
        return response.data.data;
    } catch (error) {
        console.error(`Error fetching r/${subreddit}:`, error.response?.status || error.message);
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
        subreddit: post.subreddit.toLowerCase(),
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
        locked: post.locked ?? false,
        stickied: post.stickied ?? false,
        preview: post.preview ?? null,
        indexed_at: new Date().toISOString()
    };
}

async function getEmbeddings(texts) {
    try {
        const response = await axios.post('http://localhost:5000/embed', {
            texts: texts
        });
        return response.data.embeddings;
    } catch (error) {
        console.error('Embedding server error:', error.message);
        return null;
    }
}

async function insertBatch(posts) {
    try {
        const points = posts.map((post) => ({
            id: totalPointsInserted++,
            vector: post.embedding,
            payload: {
                reddit_post_id: post.reddit_post_id,
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
                crosspost_parent_list: post.crosspost_parent_list,
                content_type: post.content_type,
                locked: post.locked,
                stickied: post.stickied,
                preview: post.preview,
                indexed_at: post.indexed_at
            }
        }));

        const response = await fetch(`${process.env.QDRANT_URL}/collections/reddit_posts/points`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.QDRANT_API_KEY
            },
            body: JSON.stringify({
                points: points
            })
        });

        if (response.ok) {
            console.log(`Inserted ${posts.length} posts to Qdrant`);
            return true;
        } else {
            console.error('Qdrant insert failed:', await response.text());
            return false;
        }
    } catch (error) {
        console.error('Qdrant insert error:', error.message);
        return false;
    }
}

async function processSubreddit(subreddit, targetCount) {
    console.log(`\n Processing r/${subreddit} (target: ${targetCount} posts)`);

    const allPosts = [];
    let after = null;

    while (allPosts.length < targetCount) {
        const data = await fetchRedditPosts(subreddit, 100, after);
        if (!data || !data.children || data.children.length === 0) break;

        const posts = data.children.map(extractPostData);
        allPosts.push(...posts);

        after = data.after;
        if (!after) break;

        console.log(`   Fetched ${allPosts.length} posts so far...`);
    }

    const finalPosts = allPosts.slice(0, targetCount);
    console.log(`Collected ${finalPosts.length} posts from r/${subreddit}`);

    for (let i = 0; i < finalPosts.length; i += 20) {
        const batch = finalPosts.slice(i, i + 20);
        const texts = batch.map(post => post.title);
        const embeddings = await getEmbeddings(texts);

        if (!embeddings) continue;

        batch.forEach((post, index) => {
            post.embedding = embeddings[index];
        });

        await insertBatch(batch);
        console.log(`   Processed batch ${Math.floor(i / 20) + 1}/${Math.ceil(finalPosts.length / 20)}`);
    }
}

async function main() {
    console.log('Starting Reddit crawl');
    console.log(`Starting point IDs from: ${totalPointsInserted}`);

    await getRedditToken();
    await createCollection();

    console.log('\n Starting subreddits crawl (300 posts each)');
    for (const sub of BIG_SUBS) {
        await processSubreddit(sub, 300);
    }

    console.log('\n Processing additional MEDIUM_SUBS (100 posts each)');
    for (const sub of MEDIUM_SUBS) {
        await processSubreddit(sub, 100);
    }

    console.log('\n Complete!');
    console.log(`Final point count should be around: ${totalPointsInserted}`);
}

main().catch(console.error);