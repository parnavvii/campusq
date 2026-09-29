const http = require('http');
const env = require('./config/env');
const app = require('./app');
const { pool } = require('./config/db');
const { initSocket, emitQueueChanged, emitToUser } = require('./socket');
const { sweepNoShows } = require('./services/appointment.service');

async function start() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('✖ Cannot connect to MySQL:', err.message);
    console.error('  Check DB_* values in server/.env and that MySQL is running.');
    process.exit(1);
  }

  const server = http.createServer(app);
  initSocket(server);
  server.listen(env.port, () => {
    console.log(`✔ Waitwell API + Socket.IO listening on http://localhost:${env.port}`);
  });

  // Every minute: bookings whose check-in window has closed become NO_SHOW.
  const sweep = async () => {
    try {
      const expired = await sweepNoShows();
      for (const serviceId of new Set(expired.map((a) => a.service_id))) emitQueueChanged(serviceId, 'no-show');
      for (const a of expired) emitToUser(a.user_id, 'booking:updated', { id: a.id, status: 'NO_SHOW', code: a.code });
    } catch (err) {
      console.error('[no-show sweep]', err.message);
    }
  };
  sweep();
  const sweeper = setInterval(sweep, 60 * 1000);

  const shutdown = () => {
    clearInterval(sweeper);
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
