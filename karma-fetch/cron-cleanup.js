require('dotenv').config();
const cron = require('node-cron');
const client = require('./db'); 

const deleteOldEntries = async () => {
    try {
        const result = await client.query(`
            DELETE FROM image_news_cache
            WHERE created_at < NOW() - INTERVAL '7 minutes'
        `);
        console.log(`🧹 Deleted ${result.rowCount} entries older than 7 minutes`);
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
        console.log(`🧹 Deleted ${result.rowCount} entries older than 24 hours from subreddit_search_cache`);
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
        console.log(`🧹 Deleted ${result.rowCount} icons older than 24 hours`);
    } catch (err) {
        console.error('❌ Error deleting old icons:', err.message);
    }
});
