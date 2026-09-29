/**
 * Express application: security middleware, JSON parsing, REST routes,
 * error handling, and (optionally) the built React app.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const { reports, publicViews } = require('./routes/misc.routes');

const app = express();

app.disable('x-powered-by');
// Behind a hosting proxy / load balancer, trust it so req.ip (used by rate limits) is the real client.
if (env.trustProxy) app.set('trust proxy', env.trustProxy);
app.use(helmet({ contentSecurityPolicy: false })); // CSP is left to the static host / Vite in dev
app.use(cors({ origin: env.clientOrigins, credentials: true }));
app.use(express.json({ limit: '10kb' }));

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok', time: new Date().toISOString() }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/services', require('./routes/service.routes'));
app.use('/api/queues', require('./routes/queue.routes'));
app.use('/api/appointments', require('./routes/appointment.routes'));
app.use('/api/businesses', require('./routes/business.routes'));
app.use('/api/reports', reports);
app.use('/api/public', publicViews);
app.use('/api', notFound);

// If the client has been built (`npm run build` in /client), serve it too so
// the whole app can run from a single port for demos.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

module.exports = app;
