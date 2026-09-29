/**
 * Seeds a demo platform with five different businesses (a salon, a clinic, a
 * repair shop, a college office and an IT help desk) and six customers who can
 * use any of them.
 *
 * Demo story (on the salon's main service, "Haircut & Styling"):
 *   H021 is being served, H022 + H023 are waiting, so a new customer (Rahul)
 *   gets H024 with 3 people ahead. Every business has a week of history —
 *   walk-ins, online tokens, checked-in bookings, cancellations, skips and a
 *   few no-shows — and tomorrow already has some slots booked.
 *
 * Usage: npm run db:seed   (clears existing rows first)
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { pool } = require('../config/db');
const PROFILES = require('./profiles');
const time = require('../utils/time');
const { slotTimes } = require('../services/appointment.service');

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const TIMEZONE = 'Asia/Kolkata';
const DOMAIN = 'waitwell.demo';

const CUSTOMERS = [
  ['Priya Sharma', 'priya', '+91 98450 10001'],
  ['Karthik Raman', 'karthik', '+91 98450 10002'],
  ['Ananya Das', 'ananya', '+91 98450 10003'],
  ['Rahul Verma', 'rahul', '+91 98450 10004'],
  ['Sneha Pillai', 'sneha', '+91 98450 10005'],
  ['Vikram Rao', 'vikram', '+91 98450 10006'],
];
const CUSTOMER_PASSWORD = 'Customer@123';
const TEAM_PASSWORD = 'Team@1234';
const WALK_IN_NAMES = ['Suresh Kumar', 'Lakshmi N.', 'Farhan Ali', 'Deepa R.', 'Joseph Mathew', 'Kavya S.', 'Imran Sheikh'];

// Staff 1 runs the main, paused and new services; staff 2 the other two.
const ASSIGNMENTS = [[0, 0], [0, 3], [0, 4], [1, 1], [1, 2]];

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Finished history rows whose service durations average exactly `avgMin`.
 * Every 5th token is a walk-in, some are checked-in bookings, the rest joined online.
 */
function buildHistory({ serviceId, count, avgMin, customerIds, now, cancelledAt = [], skippedAt = [] }) {
  const rows = [];
  const offsets = [-1, 1, 0, -0.5, 0.5]; // symmetric -> average stays avgMin
  let completedIdx = 0;
  for (let i = 1; i <= count; i++) {
    // Spread tokens over the last 7 days (older tokens first).
    const dayAgo = Math.floor(((count - i) / count) * 7);
    const joined = new Date(now - dayAgo * DAY - (count - i + 1) * 17 * MIN - 60 * MIN);
    const waitMin = 6 + ((i * 7) % 11); // 6..16 min waiting time
    let source = i % 5 === 0 ? 'WALK_IN' : i % 6 === 2 ? 'BOOKING' : 'ONLINE';
    const row = { serviceId, token: i, joined, called: null, completed: null, cancelled: null, skipped: null };

    if (cancelledAt.includes(i)) {
      source = 'ONLINE'; // only customers with the app can cancel themselves
      Object.assign(row, { status: 'CANCELLED', cancelled: new Date(+joined + 4 * MIN) });
    } else {
      row.called = new Date(+joined + waitMin * MIN);
      if (skippedAt.includes(i)) {
        Object.assign(row, { status: 'SKIPPED', skipped: new Date(+row.called + 2 * MIN) });
      } else {
        const serviceMin = avgMin + offsets[completedIdx % offsets.length];
        completedIdx++;
        Object.assign(row, { status: 'COMPLETED', completed: new Date(+row.called + serviceMin * MIN) });
      }
    }
    row.source = source;
    if (source === 'WALK_IN') row.guestName = WALK_IN_NAMES[i % WALK_IN_NAMES.length];
    else row.userId = customerIds[i % customerIds.length];
    rows.push(row);
  }
  // Fix up the last completed row so the mean is exactly avgMin.
  const completed = rows.filter((r) => r.status === 'COMPLETED');
  const total = completed.reduce((s, r) => s + (r.completed - r.called) / MIN, 0);
  const drift = avgMin * completed.length - total;
  if (completed.length && drift !== 0) {
    const last = completed[completed.length - 1];
    last.completed = new Date(+last.completed + drift * MIN);
  }
  return rows;
}

async function insertEntry(conn, r) {
  let appointmentId = null;
  if (r.source === 'BOOKING') {
    // A booking that was checked in on arrival: the appointment row plus its token.
    const [a] = await conn.query(
      `INSERT INTO appointments (service_id, user_id, code, slot_start, status, created_at, checked_in_at)
       VALUES (?, ?, ?, ?, 'CHECKED_IN', ?, ?)`,
      [r.serviceId, r.userId, code(), r.joined, new Date(+r.joined - DAY), new Date(+r.joined - 5 * MIN)]
    );
    appointmentId = a.insertId;
  }
  await conn.query(
    `INSERT INTO queue_entries
       (service_id, user_id, guest_name, guest_phone, source, appointment_id, token_number, status,
        joined_at, queue_at, called_at, completed_at, cancelled_at, skipped_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [r.serviceId, r.userId ?? null, r.guestName ?? null, r.guestPhone ?? null, r.source, appointmentId, r.token,
      r.status, r.joined, r.joined, r.called ?? null, r.completed ?? null, r.cancelled ?? null, r.skipped ?? null]
  );
}

async function book(conn, svc, dateStr, slotIdx, userId) {
  const slot = slotTimes(svc, dateStr, TIMEZONE)[slotIdx];
  await conn.query('INSERT INTO appointments (service_id, user_id, code, slot_start) VALUES (?, ?, ?, ?)', [svc.id, userId, code(), slot.start]);
}

async function seed() {
  const conn = await pool.getConnection();
  const logins = [];
  try {
    await conn.beginTransaction();
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['staff_services', 'queue_entries', 'appointments', 'services', 'users', 'businesses']) {
      await conn.query(`DELETE FROM ${t}`);
      await conn.query(`ALTER TABLE ${t} AUTO_INCREMENT = 1`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    const now = Date.now();
    const tomorrow = time.addDays(time.localDate(new Date(now), TIMEZONE), 1);
    const customerHash = await bcrypt.hash(CUSTOMER_PASSWORD, env.bcryptRounds);
    const teamHash = await bcrypt.hash(TEAM_PASSWORD, env.bcryptRounds);

    // Customers belong to no business — they can use all of them.
    const customers = [];
    for (const [name, handle, phone] of CUSTOMERS) {
      const email = `${handle}@${DOMAIN}`;
      const [r] = await conn.query(
        `INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'CUSTOMER')`,
        [name, email, phone, customerHash]
      );
      customers.push(r.insertId);
      logins.push(['CUSTOMER', '', email, CUSTOMER_PASSWORD]);
    }
    const c = (n) => customers[n - 1];

    for (const [key, profile] of Object.entries(PROFILES)) {
      const isMain = key === 'salon';
      const [b] = await conn.query(
        `INSERT INTO businesses (name, slug, category, tagline, address, timezone, booking_days_ahead, checkin_early_minutes, no_show_minutes)
         VALUES (?, ?, ?, ?, ?, ?, 7, 30, 10)`,
        [profile.centre.name, slugify(profile.centre.name), profile.centre.type, profile.centre.tagline, profile.centre.address, TIMEZONE]
      );
      const businessId = b.insertId;

      const team = [['ADMIN', profile.people.admin, `${key}.admin@${DOMAIN}`]];
      profile.people.staff.forEach((name, i) => team.push(['STAFF', name, `${key}.staff${i + 1}@${DOMAIN}`]));
      const staffIds = [];
      for (const [role, name, email] of team) {
        const [u] = await conn.query(
          'INSERT INTO users (business_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
          [businessId, name, email, teamHash, role]
        );
        if (role === 'STAFF') staffIds.push(u.insertId);
        logins.push([role, profile.centre.name, email, TEAM_PASSWORD]);
      }

      const services = [];
      for (const [i, s] of profile.services.entries()) {
        const [r] = await conn.query(
          `INSERT INTO services (business_id, name, location, token_prefix, status, avg_service_minutes,
                                 booking_enabled, slot_minutes, slot_capacity, open_time, close_time)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
          [businessId, s.name, s.location, s.prefix, i === 3 ? 'PAUSED' : 'ACTIVE', s.avg, s.slot, s.capacity, s.open, s.close]
        );
        services.push({ ...s, id: r.insertId, business_id: businessId, open_time: s.open, close_time: s.close, slot_minutes: s.slot });
      }
      const [main, second, third, paused, fresh] = services;
      for (const [staffIdx, svcIdx] of ASSIGNMENTS) {
        await conn.query('INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)', [staffIds[staffIdx], services[svcIdx].id]);
      }

      // A week of history for every business.
      const rows = [
        ...buildHistory({ serviceId: main.id, count: 20, avgMin: main.avg, customerIds: customers, now, cancelledAt: [5, 12, 17], skippedAt: [9] }),
        ...buildHistory({ serviceId: second.id, count: 12, avgMin: second.avg, customerIds: customers, now, cancelledAt: [4] }),
        ...buildHistory({ serviceId: third.id, count: 6, avgMin: third.avg, customerIds: customers, now }),
        ...buildHistory({ serviceId: paused.id, count: 8, avgMin: paused.avg, customerIds: customers, now, cancelledAt: [3] }),
      ];

      if (isMain) {
        // The demo story: 021 serving, 022 + 023 waiting; a walk-in at the second service; a paused queue.
        rows.push({ serviceId: main.id, userId: c(1), source: 'ONLINE', token: 21, status: 'SERVING', joined: new Date(now - 14 * MIN), called: new Date(now - 1 * MIN) });
        rows.push({ serviceId: main.id, userId: c(2), source: 'ONLINE', token: 22, status: 'WAITING', joined: new Date(now - 11 * MIN) });
        rows.push({ serviceId: main.id, userId: c(3), source: 'ONLINE', token: 23, status: 'WAITING', joined: new Date(now - 8 * MIN) });
        rows.push({ serviceId: second.id, userId: c(6), source: 'ONLINE', token: 13, status: 'SERVING', joined: new Date(now - 20 * MIN), called: new Date(now - 3 * MIN) });
        rows.push({ serviceId: second.id, guestName: 'Suresh Kumar', guestPhone: '+91 90000 12345', source: 'WALK_IN', token: 14, status: 'WAITING', joined: new Date(now - 6 * MIN) });
        rows.push({ serviceId: paused.id, userId: c(5), source: 'ONLINE', token: 9, status: 'WAITING', joined: new Date(now - 25 * MIN) });
        rows.push({ serviceId: paused.id, userId: c(2), source: 'ONLINE', token: 10, status: 'WAITING', joined: new Date(now - 22 * MIN) });
      } else {
        // Other businesses: a walk-in being served and two more in line right now.
        rows.push({ serviceId: main.id, guestName: 'Mohan R.', source: 'WALK_IN', token: 21, status: 'SERVING', joined: new Date(now - 12 * MIN), called: new Date(now - 2 * MIN) });
        rows.push({ serviceId: main.id, guestName: 'Fatima Z.', source: 'WALK_IN', token: 22, status: 'WAITING', joined: new Date(now - 7 * MIN) });
        rows.push({ serviceId: main.id, guestName: 'George P.', source: 'WALK_IN', token: 23, status: 'WAITING', joined: new Date(now - 3 * MIN) });
      }
      for (const r of rows) await insertEntry(conn, r);

      // A couple of bookings nobody showed up for.
      for (const [svc, daysAgo, custNo] of [[main, 1, 5], [main, 3, 6], [second, 2, 3]]) {
        await conn.query(
          `INSERT INTO appointments (service_id, user_id, code, slot_start, status, created_at) VALUES (?, ?, ?, ?, 'NO_SHOW', ?)`,
          [svc.id, c(custNo), code(), new Date(now - daysAgo * DAY - 2 * 60 * MIN), new Date(now - (daysAgo + 1) * DAY)]
        );
      }

      // Tomorrow's bookings, so the booking screens show some taken slots.
      if (isMain) {
        for (const [svc, slotIdx, custNo] of [[main, 1, 1], [main, 1, 2], [main, 3, 3], [second, 0, 5], [fresh, 1, 6]]) {
          await book(conn, svc, tomorrow, slotIdx, c(custNo));
        }
      } else {
        await book(conn, main, tomorrow, 2, c(1));
        await book(conn, main, tomorrow, 4, c(6));
      }
    }

    // Keep each service's token counter in sync with the highest issued token.
    await conn.query(
      `UPDATE services s
          SET s.last_token_number = (SELECT COALESCE(MAX(q.token_number), 0) FROM queue_entries q WHERE q.service_id = s.id)`
    );

    await conn.commit();
    console.log(`✔ Seed complete — ${Object.keys(PROFILES).length} businesses, ${CUSTOMERS.length} customers`);
    console.log('  Demo logins (customers can use every business):');
    for (const [role, business, email, password] of logins) {
      console.log(`   ${role.padEnd(8)} ${email.padEnd(30)} ${password.padEnd(13)} ${business}`);
    }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('✖ Seed failed:', err.message);
  process.exit(1);
});
