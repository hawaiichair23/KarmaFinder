require('dotenv').config();
const cron = require('node-cron');
const client = require('./db'); 

const deleteOldEntries = async () => {
    try {
        const result = await client.query(`
            DELETE FROM image_news_cache
            WHERE created_at < NOW() - INTERVAL '24 hours'
        `);

        const now = new Date();
        const readable = now.toLocaleString();
        console.log(`🧹 Deleted ${result.rowCount} IMAGE NEWS CACHE rows older than 24 hours at ${readable}`);
    } catch (err) {
        console.error('❌ Error cleaning entries:', err.message);
    }
};

cron.schedule('0 2 * * *', deleteOldEntries);

cron.schedule('0 3 * * *', async () => {
    try {
        const result = await client.query(`
            DELETE FROM media_analysis
            WHERE created_at < NOW() - INTERVAL '5 days'
        `);

        const now = new Date();
        const readable = now.toLocaleString();
        console.log(`🧹 Deleted ${result.rowCount} MEDIA_ANALYSIS rows older than 5 days at ${readable}`);
    } catch (err) {
        console.error('❌ Error deleting old media_analysis entries:', err.message);
    }
});

cron.schedule('0 * * * *', async () => {
    try {
        const result = await client.query(`
            DELETE FROM subreddit_search_cache
            WHERE created_at < NOW() - INTERVAL '24 hours'
        `);

        const now = new Date();
        const readable = now.toLocaleString();
        console.log(`🧹 Deleted ${result.rowCount} SUBREDDIT SEARCH CACHE rows older than 24 hours at ${readable}`);
    } catch (err) {
        console.error('❌ Error cleaning subreddit_search_cache:', err.message);
    }
});

cron.schedule('0 0 */10 * *', async () => {
    try {
        const result = await client.query(`
            DELETE FROM subreddit_icons
            WHERE created_at < NOW() - INTERVAL '10 days'
        `);
        const now = new Date();
        const readable = now.toLocaleString();
        console.log(`🧹 Deleted ${result.rowCount} ICONS older than 10 days at ${readable}`);
    } catch (err) {
        console.error('❌ Error deleting old icons:', err.message);
    }
});

cron.schedule('*/30 * * * *', async () => {
    try {
        const result = await client.query(`
            DELETE FROM comments 
            WHERE indexed_at < NOW() - INTERVAL '30 minutes'
        `);

        const now = new Date();
        const readable = now.toLocaleString();
        console.log(`🗑️ Deleted ${result.rowCount} COMMENTS rows older than 30 minutes at ${readable}`);
    } catch (err) {
        console.error('❌ Error cleaning old comments:', err.message);
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