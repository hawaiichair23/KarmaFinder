require('dotenv').config();
const { Pool } = require('pg');

// Main PostgreSQL pool with proper configuration
const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
    max: 15,                    // Max concurrent connections
    min: 2,                     // Keep minimum connections alive
    idleTimeoutMillis: 30000,   // Close idle connections after 30s
    connectionTimeoutMillis: 5000, // Timeout if can't get connection in 5s
    acquireTimeoutMillis: 10000,   // Timeout if can't acquire connection in 10s
    statement_timeout: 10000,      // Kill queries after 10s
    query_timeout: 10000,          // Same but for pool.query()
});

// Connection monitoring
pool.on('connect', (client) => {
    console.log('🟢 PostgreSQL pool connection established');

    // Set query timeout on each connection
    client.query('SET statement_timeout = 10000');

    client.on('error', (err) => {
        console.error('💥 Database client error:', err.message);
    });
});

pool.on('error', (err) => {
    console.error('🔴 Database pool error:', err.message);
});

pool.on('remove', () => {
    console.log('🟡 Connection removed from pool');
});

// Memory monitoring
setInterval(() => {
    const used = process.memoryUsage();
    console.log('Memory:', {
        rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
        heap: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
        poolTotal: pool.totalCount,
        poolIdle: pool.idleCount,
        poolWaiting: pool.waitingCount
    });
}, 60000);

// Health check
setInterval(() => {
    console.log('Still alive:', new Date().toLocaleTimeString());
}, 10000);

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down, closing database connections...');
    await pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await pool.end();
    process.exit(0);
});

// Test connection and log pool stats
pool.query('SELECT NOW()')
    .then(() => {
        console.log('🟢 PostgreSQL pool connected successfully');
        console.log(`📊 Pool config: max=${pool.options.max}, timeout=${pool.options.connectionTimeoutMillis}ms`);
    })
    .catch(err => console.error('🔴 Pool connection failed:', err.message));

module.exports = { pool };