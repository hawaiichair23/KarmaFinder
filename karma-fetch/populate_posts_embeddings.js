require('dotenv').config();
const axios = require('axios');
let redditTokenExpiry = 0;

const { Pinecone } = require('@pinecone-database/pinecone');
const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY
});

let totalPointsInserted = 311118;

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
                'User-Agent': process.env.REDDIT_USER_AGENT_2
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

async function createIndex() {
    try {
        const indexList = await pc.listIndexes();
        if (indexList.indexes.some(index => index.name === 'reddit-posts')) {
            return;
        }

        await pc.createIndex({
            name: 'reddit-posts',
            dimension: 384,
            metric: 'cosine',
            spec: {
                serverless: {
                    cloud: 'aws',
                    region: 'us-east-1'
                }
            }
        });
        console.log("Created reddit-posts index");
    } catch (error) {
        console.log("Error with index:", error.message);
    }
}
let apiRequestCount = 0;

// Current Setting: Top 100
async function fetchRedditPosts(subreddit, limit = 100, after = null) {
    const url = `https://oauth.reddit.com/r/${subreddit}/top`;
    const params = {
        limit
    };
    if (after) params.after = after;

    try {
        const response = await axios.get(url, {
            params,
            headers: {
                'Authorization': `Bearer ${redditToken}`,
                'User-Agent': process.env.REDDIT_USER_AGENT_2
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
        const index = pc.index('reddit-posts');

        const vectors = posts.map((post) => ({
            id: post.reddit_post_id,  
            values: post.embedding,
            metadata: {
                reddit_post_id: post.reddit_post_id,
                title: post.title || '',
                url: post.url || '',
                permalink: post.permalink || '',
                subreddit: post.subreddit,
                score: post.score || 0,
                is_video: post.is_video || false,
                domain: post.domain || '',
                author: post.author || '',
                created_utc: post.created_utc || 0,
                num_comments: post.num_comments || 0,
                over_18: post.over_18 || false,
                preview: post.preview ? JSON.stringify(post.preview) : '',
                selftext: post.selftext || '',
                body: post.body || '',
                is_gallery: post.is_gallery || false,
                gallery_data: post.gallery_data ? JSON.stringify(post.gallery_data) : '',
                media_metadata: post.media_metadata ? JSON.stringify(post.media_metadata) : '',
                crosspost_parent_list: post.crosspost_parent_list ? JSON.stringify(post.crosspost_parent_list) : '',
                content_type: post.content_type || '',
                locked: post.locked || false,
                stickied: post.stickied || false,
                indexed_at: post.indexed_at || ''
            }
        }));

        await index.upsert(vectors);
        console.log(`Inserted ${posts.length} posts to Pinecone`);
        return true;
    } catch (error) {
        console.error('Pinecone insert error:', error.message);
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
    await createIndex();

    console.log('\n Starting subreddits crawl (400 posts each, hot posts)');
    for (const sub of BIG_SUBS) {
        await processSubreddit(sub, 400);
    }

    console.log('\n Processing additional MEDIUM_SUBS (90 posts each, hot posts)');
    for (const sub of MEDIUM_SUBS) {
        await processSubreddit(sub, 50);
    }

    console.log('\n Complete!');
    console.log(`Final point count should be around: ${totalPointsInserted}`);
}

main().catch(console.error);