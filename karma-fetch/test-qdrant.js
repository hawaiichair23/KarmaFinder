const { QdrantClient } = require('@qdrant/js-client-rest');
require('dotenv').config();
const axios = require('axios');

const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY
});

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

async function createScoreIndex() {
    try {
        const response = await fetch(`${process.env.QDRANT_URL}/collections/reddit_posts/index`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.QDRANT_API_KEY
            },
            body: JSON.stringify({
                field_name: "score",
                field_schema: "integer"
            })
        });

        const result = await response.json();
        console.log('Index creation result:', result);
        return result;
    } catch (error) {
        console.error('Error creating index:', error);
    }
}


async function createCreatedUtcIndex() {
    try {
        const response = await fetch(`${process.env.QDRANT_URL}/collections/reddit_posts/index`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.QDRANT_API_KEY
            },
            body: JSON.stringify({
                field_name: "created_utc",
                field_schema: "integer"
            })
        });
        const result = await response.json();
        console.log('Index creation result:', result);
        return result;
    } catch (error) {
        console.error('Error creating index:', error);
    }
}

