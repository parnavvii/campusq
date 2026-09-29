/**
 * Creates (or re-creates) all OnQ tables from schema.sql.
 * Usage: npm run db:setup   (WARNING: drops existing OnQ tables)
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function setup() {
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.query(`USE \`${env.db.database}\``);
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await conn.query(sql);
    console.log(`✔ Schema created in database "${env.db.database}"`);
  } finally {
    await conn.end();
  }
}

setup().catch((err) => {
  console.error('✖ Database setup failed:', err.message);
  if (err.code === 'ER_DBACCESS_DENIED_ERROR' || err.code === 'ER_ACCESS_DENIED_ERROR') {
    console.error('  Run server/src/db/create-database.sql as a MySQL admin first.');
  }
  process.exit(1);
});
