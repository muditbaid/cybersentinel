const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Successfully connected to PostgreSQL');

    const result = await client.query('SELECT NOW()');
    console.log('Database time:', result.rows[0].now);

    const userResult = await client.query('SELECT email FROM users LIMIT 1');
    if (userResult.rows.length > 0) {
      console.log('✅ Found users in database:', userResult.rows);
    } else {
      console.log('⚠️ No users found in database. You need to insert one.');
    }

    client.release();
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
  }
}

testConnection();