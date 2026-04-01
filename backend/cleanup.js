require('dotenv').config();
const { pool } = require('./db');
const fs = require('fs');
const path = require('path');

const tempDir = path.join(__dirname, 'temp');

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

// Delete old image news cache (every 24 hours)
async function deleteOldEntries() {
    try {
        const result = await pool.query(`
            DELETE FROM image_news_cache
            WHERE created_at < NOW() - INTERVAL '24 hours'
        `);
        const readable = new Date().toLocaleString();
        console.log(`🧹 Deleted ${result.rowCount} IMAGE NEWS CACHE rows older than 24 hours at ${readable}`);
    } catch (err) {
        console.error('❌ Error cleaning entries:', err.message);
    }
}

// Delete old subreddit search cache (every hour)
async function deleteOldSearchCache() {
    try {
        const result = await pool.query(`
            DELETE FROM subreddit_search_cache
            WHERE created_at < NOW() - INTERVAL '24 hours'
        `);
        const readable = new Date().toLocaleString();
        console.log(`🧹 Deleted ${result.rowCount} SUBREDDIT SEARCH CACHE rows older than 24 hours at ${readable}`);
    } catch (err) {
        console.error('❌ Error cleaning subreddit_search_cache:', err.message);
    }
}

// Delete old subreddit icons (every 24 hours, DB handles the 14-day cutoff)
async function deleteOldIcons() {
    try {
        const result = await pool.query(`
            DELETE FROM subreddit_icons
            WHERE created_at < NOW() - INTERVAL '14 days'
        `);
        const readable = new Date().toLocaleString();
        console.log(`🧹 Deleted ${result.rowCount} ICONS older than 14 days at ${readable}`);
    } catch (err) {
        console.error('❌ Error deleting old icons:', err.message);
    }
}

// Delete old comments (every 7 minutes)
async function deleteOldComments() {
    try {
        const result = await pool.query(`
            DELETE FROM comments 
            WHERE indexed_at < NOW() - INTERVAL '7 minutes'
        `);
        const readable = new Date().toLocaleString();
        console.log(`🗑️ Deleted ${result.rowCount} COMMENTS rows older than 7 minutes at ${readable}`);
    } catch (err) {
        console.error('❌ Error cleaning old comments:', err.message);
    }
}

// Delete old posts (every 7 minutes)
async function cleanOldPosts() {
    try {
        const result = await pool.query(`
            DELETE FROM posts
            WHERE indexed_at < NOW() - INTERVAL '7 minutes'
        `);
        const readable = new Date().toLocaleString();
        console.log(`🧹 Deleted ${result.rowCount} POSTS at ${readable}`);
    } catch (err) {
        console.error('❌ Error cleaning old posts:', err.message);
    }
}

// Temp file cleanup
async function cleanupTempFiles() {
    try {
        if (!fs.existsSync(tempDir)) {
            console.log('📁 Temp directory does not exist, skipping cleanup');
            return;
        }

        const files = await fs.promises.readdir(tempDir);
        const now = Date.now();
        const maxAge = 7 * 24 * HOUR; // 7 days

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

// --- Start all intervals ---
setInterval(deleteOldEntries, 24 * HOUR);       // every 24 hours
setInterval(deleteOldSearchCache, HOUR);         // every hour
setInterval(deleteOldIcons, 24 * HOUR);          // every 24 hours (DB handles 14-day cutoff)
setInterval(deleteOldComments, 7 * MINUTE);      // every 7 minutes
setInterval(cleanOldPosts, 7 * MINUTE);          // every 7 minutes
setInterval(cleanupTempFiles, HOUR);             // every hour

// Run cleanup once on startup
(async () => {
    console.log('🧹 Running startup cleanup...');
    await cleanupTempFiles();
})();

// Export scheduleFileDeletion for use in server
module.exports = {
    scheduleFileDeletion: function (outputPath, outputFileName) {
        // 24 hours instead of 7 days to stay under 32-bit integer limit
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
        }, 24 * HOUR);
    }
};
