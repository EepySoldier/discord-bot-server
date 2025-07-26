const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.PG_CONN_STRING,
    keepAlive: true,
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool,
};
