require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
    max: 80, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 2000, // How long to wait for a client from the pool
});

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