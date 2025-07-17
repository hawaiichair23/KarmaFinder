require('dotenv').config();
const cron = require('node-cron');
const client = require('./db');
const fs = require('fs');
const path = require('path');

const tempDir = path.join(__dirname, 'temp');

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

cron.schedule('*/7 * * * *', async () => {
    try {
        const result = await client.query(`
            DELETE FROM comments 
            WHERE indexed_at < NOW() - INTERVAL '7 minutes'
        `);

        const now = new Date();
        const readable = now.toLocaleString();
        console.log(`🗑️ Deleted ${result.rowCount} COMMENTS rows older than 7 minutes at ${readable}`);
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

// Clean up old files every 5 minutes
cron.schedule('*/5 * * * *', async () => {
    console.log('🧹 Running temp folder cleanup...');
    await cleanupTempFiles();
});

async function cleanupTempFiles() {
    try {
        // Check if temp directory exists
        if (!fs.existsSync(tempDir)) {
            console.log('📁 Temp directory does not exist, skipping cleanup');
            return;
        }

        const files = await fs.promises.readdir(tempDir);
        const now = Date.now();
        const maxAge = 7 * 60 * 1000; // 7 minutes in milliseconds

        let deletedCount = 0;

        for (const file of files) {
            const filePath = path.join(tempDir, file);

            try {
                const stats = await fs.promises.stat(filePath);
                const fileAge = now - stats.mtime.getTime();

                if (fileAge > maxAge) {
                    await fs.promises.unlink(filePath);
                    console.log(`🗑️ Deleted old file: ${file} (${Math.round(fileAge / 60000)} minutes old)`);
                    deletedCount++;
                }
            } catch (err) {
                console.log(`❌ Error processing ${file}:`, err.message);
            }
        }

        if (deletedCount > 0) {
            console.log(`✅ Cleanup complete: ${deletedCount} files deleted`);
        } else {
            console.log(`✅ Cleanup complete: No old files found`);
        }

    } catch (err) {
        console.error('❌ Cleanup error:', err);
    }
}

// Run cleanup once on startup to clear any leftover files
(async () => {
    console.log('🧹 Running startup cleanup...');
    await cleanupTempFiles();
})();

// Export the scheduleFileDeletion function for use in server
module.exports = {
    scheduleFileDeletion: function (outputPath, outputFileName) {
        setTimeout(async () => {
            try {
                if (fs.existsSync(outputPath)) {
                    await fs.promises.unlink(outputPath);
                    console.log(`🗑️ Timer deleted: ${outputFileName}`);
                } else {
                    console.log(`ℹ️ File already deleted: ${outputFileName}`);
                }
            } catch (err) {
                console.log(`❌ Timer delete failed for ${outputFileName}:`, err.message);
            }
        }, 7 * 60 * 1000);
    }
};