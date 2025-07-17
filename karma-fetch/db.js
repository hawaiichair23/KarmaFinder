require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
    max: 20
});

setInterval(() => {
    const used = process.memoryUsage();
    console.log('Memory:', {
        rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
        heap: `${Math.round(used.heapUsed / 1024 / 1024)}MB`
    });
}, 60000); 

setInterval(() => {
    console.log('Still alive:', new Date().toLocaleTimeString());
}, 10000);

// Pool event handlers
pool.on('connect', (client) => {
    console.log('🟢 New pool connection established to PostgreSQL');

    // Handle client-level errors
    client.on('error', (err) => {
        console.error('💥 Client connection error (handled):', err.message);
        // Don't crash - just log and continue
    });
});

pool.on('error', (err) => {
    console.error('🔴 Unexpected database error:', err);
});

// Shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down, closing database connections...');
    await pool.end();
    process.exit(0);
});

// Test pool connection
pool.query('SELECT NOW()')
    .then(() => console.log('🟢 Connected to PostgreSQL pool'))
    .catch(err => console.error('🔴 Pool connection error:', err.stack));

// Export the pool
module.exports = pool;