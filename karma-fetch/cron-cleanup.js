require('dotenv').config();
const cron = require('node-cron');
const client = require('./db'); 

const deleteOldEntries = async () => {
    try {
        const result = await client.query(`
            DELETE FROM image_news_cache
            WHERE created_at < NOW() - INTERVAL '7 minutes'
        `);

        const now = new Date();
        const readable = now.toLocaleString();
        console.log(`🧹 Deleted ${result.rowCount} IMAGE NEWS CACHE entries older than 7 minutes at  ${readable}`);
    } catch (err) {
        console.error('❌ Error cleaning entries:', err.message);
    }
};

cron.schedule('*/7 * * * *', deleteOldEntries);

cron.schedule('0 * * * *', async () => {
    try {
        const result = await client.query(`
            DELETE FROM subreddit_search_cache
            WHERE created_at < NOW() - INTERVAL '24 hours'
        `);

        const now = new Date();
        const readable = now.toLocaleString();
        console.log(`🧹 Deleted ${result.rowCount} SUBREDDIT SEARCH CACHE entries older than 24 hours at ${readable}`);
    } catch (err) {
        console.error('❌ Error cleaning subreddit_search_cache:', err.message);
    }
});

cron.schedule('0 * * * *', async () => {
    try {
        const result = await client.query(`
            DELETE FROM subreddit_icons
            WHERE created_at < NOW() - INTERVAL '24 hours'
        `);

        const now = new Date();
        const readable = now.toLocaleString();
        console.log(`🧹 Deleted ${result.rowCount} ICONS older than 24 hours at ${readable}`);
    } catch (err) {
        console.error('❌ Error deleting old icons:', err.message);
    }
});

async function cleanOldPosts() {
    try {
        const result = await client.query(`
            DELETE FROM posts
            WHERE indexed_at < NOW() - INTERVAL '7 minutes'
        `);

        const now = new Date();
        const readable = now.toLocaleString();
        console.log(`🧹 Deleted ${result.rowCount} POSTS at ${readable}`);

    } catch (err) {
        console.error('❌ Error cleaning old posts:', err.message);
    }
}

// Run every 7 minutes
setInterval(cleanOldPosts, 7 * 60 * 1000);