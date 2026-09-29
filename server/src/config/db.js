/**
 * MySQL connection pool (mysql2/promise).
 * Every query in the app uses placeholders (?) — parameterised queries
 * prevent SQL injection. All timestamps are stored and read as UTC.
 */
const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
  dateStrings: false,
});

// Make NOW()/CURRENT_TIMESTAMP use UTC on every pooled connection.
pool.pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

/**
 * Run `work(conn)` inside a transaction. Commits on success, rolls back on
 * any thrown error and always releases the connection.
 */
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
