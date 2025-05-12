require('dotenv').config();

const { Client } = require('pg');

const client = new Client({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
});

client.connect()
    .then(() => console.log('🟢 Connected to PostgreSQL'))
    .catch(err => console.error('🔴 Connection error:', err.stack));

module.exports = client;
