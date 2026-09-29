/**
 * Centralised, validated configuration. The app refuses to start with a
 * missing or weak JWT secret so a misconfigured deployment fails loudly.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name} (see server/.env.example)`);
  }
  return value;
}

const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: required('DB_NAME'),
  },
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
  // Number of proxies in front of the app (e.g. 1 on Render/Railway/Nginx). Unset locally.
  trustProxy: /^\d+$/.test(process.env.TRUST_PROXY || '') ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY === 'true',
};

if (env.jwt.secret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}

env.isProduction = env.nodeEnv === 'production';

module.exports = env;
