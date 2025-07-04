require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
    max: 100, 
    idleTimeoutMillis: 0, 
    connectionTimeoutMillis: 2000, 
});

setInterval(() => {
    const used = process.memoryUsage();
    console.log('Memory:', {
        rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
        heap: `${Math.round(used.heapUsed / 1024 / 1024)}MB`
    });
}, 60000); // Every minute

setInterval(() => {
    console.log('Still alive:', new Date().toLocaleTimeString());
}, 10000);

// Pool event handlers
pool.on('connect', () => {
    console.log('🟢 New pool connection established to PostgreSQL');
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