/**
 * Socket.IO real-time layer.
 *
 * Connections must present a valid JWT (handshake `auth.token`); anonymous
 * sockets are rejected. Each socket joins:
 *   user:<id>        personal events (your turn, you're next, skipped...)
 *   business:<id>    staff and admins: changes anywhere in their business
 * and may subscribe to service:<id> rooms (one queue) or business:<id> rooms
 * (a business page a customer is looking at).
 *
 * Events are "notifications": they tell clients WHAT changed and the client
 * re-fetches through the REST API. The REST layer stays the single source of
 * truth and keeps its authorization rules — sockets never leak queue data a
 * user couldn't already GET.
 */
const { Server } = require('socket.io');
const env = require('../config/env');
const { verifyToken } = require('../utils/jwt');
const { pool } = require('../config/db');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientOrigins, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const payload = verifyToken(socket.handshake.auth?.token || '');
      const [rows] = await pool.query('SELECT id, business_id, name, role FROM users WHERE id = ?', [payload.sub]);
      if (!rows.length) return next(new Error('unauthorized'));
      socket.user = rows[0];
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket;
    socket.join(`user:${user.id}`);
    if (user.business_id) socket.join(`business:${user.business_id}`);

    const roomId = (value) => {
      const id = Number(value);
      return Number.isInteger(id) && id > 0 ? id : null;
    };
    socket.on('business:subscribe', (businessId) => {
      const id = roomId(businessId);
      if (id) socket.join(`business:${id}`);
    });
    socket.on('business:unsubscribe', (businessId) => {
      const id = roomId(businessId);
      if (id && id !== user.business_id) socket.leave(`business:${id}`);
    });

    socket.on('service:subscribe', (serviceId) => {
      const id = Number(serviceId);
      if (Number.isInteger(id) && id > 0) socket.join(`service:${id}`);
    });
    socket.on('service:unsubscribe', (serviceId) => {
      const id = Number(serviceId);
      if (Number.isInteger(id) && id > 0) socket.leave(`service:${id}`);
    });
  });

  return io;
}

/* ---- emit helpers used by controllers after a transaction commits ---- */

/*
 * Scaling note: people waiting in a queue (and its staff) are in that queue's
 * room and hear about its changes immediately. The "services list changed"
 * notice goes only to people looking at that business, and is coalesced: at most
 * one per second, however many queues changed. That keeps thousands of open
 * screens from all re-fetching after every single join or "Call next".
 */
const BROADCAST_EVERY_MS = 1000;
let pending = null;

function scheduleServicesBroadcast(serviceId, reason, businessId) {
  if (!pending) {
    pending = { serviceIds: new Set(), businessIds: new Set(), reason };
    setTimeout(flushServicesBroadcast, BROADCAST_EVERY_MS).unref();
  }
  if (serviceId) pending.serviceIds.add(Number(serviceId));
  if (businessId) pending.businessIds.add(Number(businessId));
  pending.reason = reason;
}

async function flushServicesBroadcast() {
  const { serviceIds, businessIds, reason } = pending;
  pending = null;
  if (!io) return;
  try {
    if (serviceIds.size) {
      const [rows] = await pool.query('SELECT DISTINCT business_id FROM services WHERE id IN (?)', [[...serviceIds]]);
      rows.forEach((r) => businessIds.add(r.business_id));
    }
    const at = new Date().toISOString();
    for (const businessId of businessIds) {
      io.to(`business:${businessId}`).emit('services:changed', { businessId, serviceIds: [...serviceIds], reason, at });
    }
  } catch (err) {
    console.error('[socket broadcast]', err.message);
  }
}

/** Something about a service's queue changed (join, cancel, call next, pause, booking...). */
function emitQueueChanged(serviceId, reason, businessId) {
  // Required lazily: the catalogue service loads after this module.
  require('../services/catalog.service').invalidateSummaries();
  if (!io) return;
  if (serviceId) {
    io.to(`service:${serviceId}`).emit('queue:updated', { serviceId: Number(serviceId), reason, at: new Date().toISOString() });
  }
  scheduleServicesBroadcast(serviceId, reason, businessId);
}

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

module.exports = { initSocket, emitQueueChanged, emitToUser };
