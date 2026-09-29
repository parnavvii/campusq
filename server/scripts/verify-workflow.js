/**
 * End-to-end verification of the Waitwell platform against a running server.
 *
 *   npm run db:reset   # fresh seed data (required)
 *   npm start          # in another terminal
 *   npm run verify
 *
 * Exercises REST + Socket.IO like real customers and staff: join → call next →
 * live updates → served; walk-ins; booking a slot → check-in → served; the daily
 * report; business settings; the public directory, pages and display board;
 * business sign-up; isolation between businesses; and every validation,
 * permission and concurrency rule.
 * NOTE: it changes data — run `npm run db:reset` again before a live demo.
 */
const { io } = require('socket.io-client');
const time = require('../src/utils/time');
const { positionFor, newJoinerPosition, compareEntries } = require('../src/services/estimate.service');

const BASE = process.env.VERIFY_URL || 'http://localhost:5000';
let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✔ ${label}`);
  } else {
    failed++;
    console.log(`  ✖ ${label}${detail !== undefined ? `  →  ${JSON.stringify(detail)}` : ''}`);
  }
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function login(email, password) {
  const r = await api('POST', '/auth/login', { body: { email, password } });
  if (r.status !== 200) throw new Error(`Login failed for ${email}: ${JSON.stringify(r.data)}`);
  return r.data.token;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(e));
  });
}

/** Resolves with the first `event` payload matching `predicate`, or null on timeout. */
function waitFor(socket, event, predicate = () => true, ms = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(null);
    }, ms);
    function handler(payload) {
      if (predicate(payload)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      }
    }
    socket.on(event, handler);
  });
}

function unitChecks() {
  console.log('0. Queue order & smart estimate (unit)');
  const now = new Date('2026-01-01T10:00:00Z');
  const m = (mins) => new Date(+now + mins * 60000);
  const entries = [
    { id: 1, status: 'SERVING', source: 'ONLINE', queue_at: m(-30), token_number: 4 },
    { id: 2, status: 'WAITING', source: 'WALK_IN', queue_at: m(-20), token_number: 5 },
    { id: 3, status: 'WAITING', source: 'BOOKING', queue_at: m(-1), token_number: 7 }, // slot has arrived
    { id: 4, status: 'WAITING', source: 'BOOKING', queue_at: m(30), token_number: 8 }, // checked in early
  ];
  const state = { now, avg: { minutes: 10 }, entries, pendingSlots: [] };
  const order = entries.filter((e) => e.status === 'WAITING').sort((a, b) => compareEntries(a, b, now)).map((e) => e.id);
  check('due booking first, then walk-ins, then early-arrived booking', JSON.stringify(order) === '[3,2,4]', order);
  const joiner = newJoinerPosition(state);
  check('new joiner: 3 ahead now + 1 booking that will become due first → 40 min', joiner.peopleAhead === 3 && joiner.bookingsAhead === 1 && joiner.estimatedWaitMinutes === 40, joiner);
  const early = positionFor(entries[3], state);
  check('early-arrived booking waits for its slot time (≥ 30 min)', early.estimatedWaitMinutes >= 30 && early.peopleAhead === 2, early);
  const withPending = { ...state, pendingSlots: [+m(5), +m(200)] };
  const j2 = newJoinerPosition(withPending);
  check('bookings not yet checked in are counted only if due before your turn', j2.bookingsAhead === 2 && j2.estimatedWaitMinutes === 50, j2);
}

async function main() {
  console.log(`Waitwell platform verification against ${BASE}\n`);
  unitChecks();

  console.log('\n1. Authentication & validation');
  let r = await api('POST', '/auth/login', { body: { email: '', password: '' } });
  check('empty login fields → 400 "Email and password are required."', r.status === 400 && r.data.message === 'Email and password are required.', r.data);
  r = await api('POST', '/auth/login', { body: { email: "' OR 1=1 --", password: 'x' } });
  check('SQL-injection style email is rejected (not logged in)', r.status === 401 && !r.data.token, r);
  r = await api('POST', '/auth/login', { body: { email: 'rahul@waitwell.demo', password: 'wrong-pass1' } });
  check('wrong password → 401', r.status === 401, r.data);
  r = await api('POST', '/auth/register', { body: { name: 'Test', email: 'not-an-email', password: 'abc' } });
  check('register with bad email → 400', r.status === 400, r.data);
  r = await api('POST', '/auth/register', { body: { name: 'Test', email: 't@x.demo', password: 'short' } });
  check('register with weak password → 400', r.status === 400, r.data);
  r = await api('POST', '/auth/register', { body: { name: 'Test', email: 't2@x.demo', password: 'Passw0rd!', phone: 'call me' } });
  check('register with an invalid phone number → 400', r.status === 400, r.data);
  const email = `verify${Date.now()}@waitwell.demo`;
  r = await api('POST', '/auth/register', { body: { name: 'Role Hacker', email, password: 'Passw0rd!', phone: '+91 99999 00000', role: 'ADMIN' } });
  check('register ignores a client-supplied role (always CUSTOMER) and keeps the phone', r.status === 201 && r.data.user.role === 'CUSTOMER' && r.data.user.phone === '+91 99999 00000', r.data);
  r = await api('POST', '/auth/register', { body: { name: 'Dup', email, password: 'Passw0rd!' } });
  check('duplicate email → 409', r.status === 409, r.data);
  r = await api('GET', '/services');
  check('no token → 401', r.status === 401, r.data);
  r = await api('GET', '/services', { token: 'garbage.token.value' });
  check('forged token → 401', r.status === 401, r.data);

  const c4 = await login('rahul@waitwell.demo', 'Customer@123'); // Rahul, the "new customer"
  const c2 = await login('karthik@waitwell.demo', 'Customer@123'); // holds 022 on the salon's main service
  const c5 = await login('sneha@waitwell.demo', 'Customer@123');
  const c1 = await login('priya@waitwell.demo', 'Customer@123');
  const staff1 = await login('salon.staff1@waitwell.demo', 'Team@1234'); // runs the main, paused and new services
  const staff2 = await login('salon.staff2@waitwell.demo', 'Team@1234'); // NOT assigned to the main service
  const admin = await login('salon.admin@waitwell.demo', 'Team@1234');
  const clinicAdmin = await login('clinic.admin@waitwell.demo', 'Team@1234'); // a different business
  check('seeded customers, staff and admins of different businesses can log in', true);

  const settings = (await api('GET', '/businesses/glow-go-salon')).data.business;
  console.log(`\n2. Service listing — ${settings.name} (${settings.category})`);
  r = await api('GET', '/services', { token: c4 });
  check('customers must say which business they are looking at → 400', r.status === 400, r.data);
  r = await api('GET', `/services?business=${settings.id}`, { token: c4 });
  const byId = [...r.data.services].sort((a, b) => a.id - b.id);
  const [main, second, , paused, fresh] = byId;
  const P = main.tokenPrefix;
  const tk = (prefix, n) => `${prefix}${String(n).padStart(3, '0')}`;
  check(`${main.name} shows current token ${tk(P, 21)}`, main.currentToken === tk(P, 21), main);
  check('queue length (waiting) = 2', main.queueLength === 2, main);
  const expectedWait = Math.round((3 + main.bookingsAheadIfJoining) * main.avgServiceMinutes);
  check(`estimate for a new joiner = (3 ahead + bookings due first) × ${main.avgServiceMinutes} min = ${expectedWait} min`,
    main.peopleAheadIfJoining === 3 && main.estimatedWaitMinutes === expectedWait, main);
  check('each service exposes its booking settings', main.booking && main.booking.enabled === true && main.booking.slotMinutes > 0, main.booking);

  console.log('\n3. Real-time channel security');
  let rejected = false;
  try {
    await connect('not-a-jwt');
  } catch {
    rejected = true;
  }
  check('socket without a valid JWT is refused', rejected);

  const sNew = await connect(c4);
  const s2 = await connect(c2);
  const sStaff = await connect(staff1);
  sStaff.emit('service:subscribe', main.id);
  sNew.emit('service:subscribe', main.id);
  sNew.emit('business:subscribe', settings.id); // as the business page does
  check('customer and staff sockets connected with JWT', sNew.connected && s2.connected && sStaff.connected);

  console.log('\n4. Join queue & token generation');
  const staffSawJoin = waitFor(sStaff, 'queue:updated', (p) => p.serviceId === main.id && p.reason === 'joined');
  r = await api('POST', '/queues/join', { token: c4, body: { serviceId: main.id } });
  const entry = r.data.entry;
  check(`new customer receives token ${tk(P, 24)}`, r.status === 201 && entry.token === tk(P, 24) && entry.source === 'ONLINE', r.data);
  check('people ahead = 3', entry && entry.peopleAhead === 3, entry);
  check(`estimated wait = ${expectedWait} minutes`, entry && entry.estimatedWaitMinutes === expectedWait, entry);
  check('staff dashboard receives live "joined" event', !!(await staffSawJoin));
  r = await api('POST', '/queues/join', { token: c4, body: { serviceId: main.id } });
  check('joining twice → 409 "You are already in this queue."', r.status === 409 && r.data.message === 'You are already in this queue.', r.data);
  r = await api('POST', '/queues/join', { token: staff1, body: { serviceId: main.id } });
  check('staff cannot join a queue as a customer → 403', r.status === 403, r.data);
  r = await api('POST', '/queues/join', { token: c4, body: { serviceId: 'abc' } });
  check('invalid service id → 400', r.status === 400, r.data);

  console.log('\n5. Authorization on staff controls');
  r = await api('POST', `/queues/${main.id}/next`, { token: c4 });
  check('customer calling next → 403 "You are not authorized to manage this queue."', r.status === 403 && r.data.message === 'You are not authorized to manage this queue.', r.data);
  r = await api('POST', `/queues/${main.id}/next`, { token: staff2 });
  check('staff NOT assigned to this service → 403', r.status === 403 && r.data.message === 'You are not authorized to manage this queue.', r.data);
  r = await api('GET', `/services/${main.id}/statistics`, { token: c4 });
  check('customer cannot read statistics → 403', r.status === 403, r.data);

  console.log('\n6. Queue views');
  r = await api('GET', `/queues/${main.id}`, { token: c4 });
  check('customer gets the LIMITED view (no names)', r.data.view === 'limited' && !r.data.waiting.some((w) => w.customer), r.data.view);
  check('customer sees their own token flagged isMine', r.data.waiting.some((w) => w.isMine && w.token === tk(P, 24)));
  r = await api('GET', `/queues/${main.id}`, { token: staff1 });
  check('assigned staff gets FULL view with customer names', r.data.view === 'full' && r.data.waiting.every((w) => w.customer?.name), r.data.view);
  const t23 = r.data.waiting.find((w) => w.token === tk(P, 23));
  const t22 = r.data.waiting.find((w) => w.token === tk(P, 22));

  console.log('\n7. Staff calls next → live updates');
  const customerUpdate = waitFor(sNew, 'queue:updated', (p) => p.serviceId === main.id && p.reason === 'called-next');
  const listBroadcast = waitFor(sNew, 'services:changed', (p) => p.businessId === settings.id && p.serviceIds.includes(main.id));
  const s2Called = waitFor(s2, 'token:called', (p) => p.token === tk(P, 22));
  r = await api('POST', `/queues/${main.id}/next`, { token: staff1 });
  check(`${tk(P, 21)} → COMPLETED, ${tk(P, 22)} → SERVING`, r.status === 200 && r.data.completed?.token === tk(P, 21) && r.data.serving?.token === tk(P, 22), r.data);
  check("customers in that queue get the live update at once", !!(await customerUpdate));
  check('people viewing this business get one coalesced "services changed" notice', !!(await listBroadcast));
  check(`${tk(P, 22)} owner gets a personal "your turn" event`, !!(await s2Called));
  r = await api('GET', '/queues/my-position', { token: c4 });
  let mine = r.data.entries.find((e) => e.token === tk(P, 24));
  check(`new customer now has 2 people ahead, current token ${tk(P, 22)}`, mine && mine.peopleAhead === 2 && mine.currentToken === tk(P, 22), mine);

  console.log('\n8. Cancel rules');
  r = await api('DELETE', `/queues/${t23.id}`, { token: c4 });
  check("cannot cancel someone else's token → 403", r.status === 403, r.data);
  r = await api('DELETE', `/queues/${t22.id}`, { token: c2 });
  check('cannot cancel a token that is being served → 409', r.status === 409, r.data);
  r = await api('DELETE', '/queues/abc', { token: c4 });
  check('malformed queue id → 400 "Invalid queue request."', r.status === 400 && r.data.message === 'Invalid queue request.', r.data);
  r = await api('DELETE', '/queues/999999', { token: c4 });
  check('unknown queue id → 404 "Invalid queue request."', r.status === 404 && r.data.message === 'Invalid queue request.', r.data);

  console.log('\n9. Skip');
  const sNewNext = waitFor(sNew, 'token:next', (p) => p.token === tk(P, 24), 4000);
  r = await api('POST', `/queues/${t23.id}/skip`, { token: staff1 });
  check(`staff skips ${tk(P, 23)} (customer unavailable) → SKIPPED`, r.status === 200 && r.data.entry.status === 'SKIPPED', r.data);
  r = await api('GET', '/queues/my-position', { token: c4 });
  mine = r.data.entries.find((e) => e.token === tk(P, 24));
  check('new customer now has 1 person ahead', mine && mine.peopleAhead === 1, mine);
  r = await api('POST', `/queues/${t23.id}/skip`, { token: staff1 });
  check('skipping an already-skipped token → 409', r.status === 409, r.data);

  console.log('\n10. Pause / resume');
  r = await api('POST', `/services/${main.id}/pause`, { token: c4 });
  check('customer cannot pause → 403', r.status === 403, r.data);
  r = await api('POST', `/services/${main.id}/pause`, { token: staff1 });
  check('staff pauses the queue', r.status === 200 && r.data.service.status === 'PAUSED', r.data);
  r = await api('POST', '/queues/join', { token: c5, body: { serviceId: main.id } });
  check('joining a paused queue → 409 "This queue is currently paused. Please try again later."', r.status === 409 && r.data.message === 'This queue is currently paused. Please try again later.', r.data);
  r = await api('POST', `/queues/${main.id}/walk-in`, { token: staff1, body: { name: 'Paused Tester' } });
  check('adding a walk-in to a paused queue → 409', r.status === 409, r.data);
  r = await api('GET', '/queues/my-position', { token: c4 });
  check('existing customers remain in the paused queue', r.data.entries.some((e) => e.token === tk(P, 24)));
  r = await api('POST', `/queues/${main.id}/next`, { token: staff1 });
  check('call next is blocked while paused → 409', r.status === 409, r.data);
  r = await api('POST', `/services/${main.id}/resume`, { token: staff1 });
  check('staff resumes the queue', r.status === 200 && r.data.service.status === 'ACTIVE', r.data);

  console.log('\n11. Customer gets served');
  const sNewCalled = waitFor(sNew, 'token:called', (p) => p.token === tk(P, 24));
  r = await api('POST', `/queues/${main.id}/next`, { token: staff1 });
  check(`${tk(P, 22)} → COMPLETED, ${tk(P, 24)} → SERVING`, r.data.completed?.token === tk(P, 22) && r.data.serving?.token === tk(P, 24), r.data);
  check('new customer receives live "your turn" event', !!(await sNewCalled));
  check('new customer had received a "you are next" heads-up earlier', !!(await sNewNext));
  r = await api('GET', '/queues/my-position', { token: c4 });
  mine = r.data.entries.find((e) => e.token === tk(P, 24));
  check('position shows SERVING with 0 ahead', mine && mine.status === 'SERVING' && mine.peopleAhead === 0, mine);
  r = await api('DELETE', `/queues/${mine.id}`, { token: c4 });
  check('customer cannot cancel while being served → 409', r.status === 409, r.data);
  r = await api('POST', `/queues/${mine.id}/complete`, { token: staff1 });
  check(`staff completes ${tk(P, 24)}`, r.status === 200 && r.data.entry.status === 'COMPLETED', r.data);
  r = await api('DELETE', `/queues/${mine.id}`, { token: c4 });
  check('completed token cannot be cancelled → 409', r.status === 409 && r.data.message === 'A completed token cannot be cancelled.', r.data);
  r = await api('GET', '/queues/my-history', { token: c4 });
  check(`queue history shows ${tk(P, 24)} as COMPLETED`, r.data.entries.some((e) => e.token === tk(P, 24) && e.status === 'COMPLETED'));
  r = await api('POST', `/queues/${main.id}/next`, { token: staff1 });
  check('call next on an empty queue → 409', r.status === 409, r.data);

  console.log('\n12. Customer cancels own waiting token');
  r = await api('POST', '/queues/join', { token: c4, body: { serviceId: main.id } });
  check(`re-joining after being served is allowed → ${tk(P, 25)}`, r.status === 201 && r.data.entry.token === tk(P, 25), r.data);
  r = await api('DELETE', `/queues/${r.data.entry.id}`, { token: c4 });
  check('customer cancels own waiting token', r.status === 200 && r.data.entry.status === 'CANCELLED', r.data);

  console.log('\n13. Walk-in customers (added by staff at the desk)');
  r = await api('POST', `/queues/${main.id}/walk-in`, { token: c4, body: { name: 'Sneaky Customer' } });
  check('customer cannot add walk-ins → 403', r.status === 403, r.data);
  r = await api('POST', `/queues/${main.id}/walk-in`, { token: staff2, body: { name: 'Wrong Desk' } });
  check('staff not assigned to the service cannot add walk-ins → 403', r.status === 403, r.data);
  r = await api('POST', `/queues/${main.id}/walk-in`, { token: staff1, body: { name: 'X' } });
  check('walk-in without a proper name → 400', r.status === 400, r.data);
  r = await api('POST', `/queues/${main.id}/walk-in`, { token: staff1, body: { name: 'Walk-in Tester', phone: '+91 90000 11111' } });
  const walkIn = r.data.entry;
  check(`staff issue walk-in token ${tk(P, 26)}`, r.status === 201 && walkIn.token === tk(P, 26) && walkIn.source === 'WALK_IN' && walkIn.userId === null, r.data);
  r = await api('GET', `/queues/${main.id}`, { token: staff1 });
  const wRow = r.data.waiting.find((w) => w.token === tk(P, 26));
  check('walk-in appears in the staff view with name and phone', wRow && wRow.customer.isGuest && wRow.customer.name === 'Walk-in Tester' && wRow.customer.phone === '+91 90000 11111', wRow);
  r = await api('GET', `/public/glow-go-salon/track?serviceId=${main.id}&token=${tk(P, 26)}`);
  check('walk-in can track the token without an account', r.status === 200 && r.data.entry.status === 'WAITING' && r.data.entry.peopleAhead === 0, r.data);
  check('public tracking never exposes names', !JSON.stringify(r.data).includes('Walk-in Tester'));

  console.log('\n14. Booking a slot → check in → served');
  const hours = { openTime: main.booking.openTime, closeTime: main.booking.closeTime };
  // Open the main service all day so there is always a slot starting soon to test with.
  r = await api('PUT', `/services/${main.id}`, { token: admin, body: { openTime: '00:00', closeTime: '24:00' } });
  check('admin sets opening hours (00:00–24:00 for this test)', r.status === 200 && r.data.service.booking.closeTime === '24:00', r.data);
  r = await api('GET', `/services/${main.id}/slots`, { token: c4 });
  check('slots for today are listed with availability', r.status === 200 && r.data.slots.length > 0 && r.data.timezone === settings.timezone, r.data);
  const today = r.data.firstDate;
  const nextSlot = r.data.slots.find((s) => s.available > 0 && +new Date(s.start) - Date.now() > 60000);
  const pastSlot = r.data.slots.find((s) => s.past);
  r = await api('GET', `/services/${main.id}/slots?date=${time.addDays(today, settings.bookingDaysAhead + 5)}`, { token: c4 });
  check('dates outside the booking window → 400', r.status === 400, r.data);
  r = await api('GET', `/services/${main.id}/slots?date=${time.addDays(today, 1)}`, { token: c4 });
  const fullSlot = r.data.slots.find((s) => s.booked >= r.data.capacity);
  const freeMainTomorrow = r.data.slots.find((s) => s.available > 0);
  check("tomorrow's seeded bookings show as taken", !!fullSlot, r.data.slots.slice(0, 6));
  r = await api('POST', '/appointments', { token: c5, body: { serviceId: main.id, slotStart: fullSlot.start } });
  check('booking a full slot → 409', r.status === 409 && r.data.message === 'That slot is fully booked. Please pick another time.', r.data);
  if (pastSlot) {
    r = await api('POST', '/appointments', { token: c5, body: { serviceId: main.id, slotStart: pastSlot.start } });
    check('booking a slot that already started → 409', r.status === 409, r.data);
  }
  r = await api('POST', '/appointments', { token: staff1, body: { serviceId: main.id, slotStart: fullSlot.start } });
  check('staff cannot book as a customer → 403', r.status === 403, r.data);

  if (!nextSlot) {
    console.log('  (skipped check-in tests: no slot left today — run again after midnight)');
    // Still serve the walk-in so the totals checked later add up.
    r = await api('POST', `/queues/${main.id}/next`, { token: staff1 });
    r = await api('POST', `/queues/${r.data.serving.id}/complete`, { token: staff1 });
    check(`late-night run: walk-in ${tk(P, 26)} served instead`, r.status === 200 && r.data.entry.status === 'COMPLETED', r.data);
  } else {
    r = await api('POST', '/appointments', { token: c4, body: { serviceId: main.id, slotStart: new Date(+new Date(nextSlot.start) + 60000).toISOString() } });
    check('a time that is not a slot boundary → 400', r.status === 400, r.data);
    r = await api('POST', '/appointments', { token: c4, body: { serviceId: main.id, slotStart: nextSlot.start } });
    const booking = r.data.appointment;
    check(`customer books the ${nextSlot.time} slot and gets a booking code`, r.status === 201 && /^[A-Z2-9]{6}$/.test(booking?.code) && booking.status === 'BOOKED', r.data);
    r = await api('POST', '/appointments', { token: c4, body: { serviceId: main.id, slotStart: freeMainTomorrow.start } });
    check('a second upcoming booking for the same service → 409', r.status === 409 && r.data.message === 'You already have an upcoming booking for this service.', r.data);
    r = await api('GET', '/appointments/mine', { token: c4 });
    const listed = r.data.upcoming.find((a) => a.id === booking.id);
    check('booking appears under "my bookings" with check-in open (slot starts within 30 min)', listed && listed.canCheckIn, listed);
    r = await api('POST', `/appointments/${booking.id}/check-in`, { token: staff2 });
    check('staff not assigned to the service cannot check the customer in → 403', r.status === 403, r.data);
    r = await api('POST', `/appointments/${booking.id}/check-in`, { token: c1 });
    check("another customer cannot check in someone else's booking → 403", r.status === 403, r.data);
    const staffSawCheckIn = waitFor(sStaff, 'queue:updated', (p) => p.serviceId === main.id && p.reason === 'checked-in');
    r = await api('POST', `/appointments/${booking.id}/check-in`, { token: c4 });
    const booked = r.data.entry;
    check(`checking in issues token ${tk(P, 27)} placed at the slot time`, r.status === 200 && booked.token === tk(P, 27) && booked.source === 'BOOKING' && +new Date(booked.bookedFor) === +new Date(nextSlot.start), r.data);
    check('staff console hears about the check-in', !!(await staffSawCheckIn));
    check("booked customer's estimate respects the slot time", booked.estimatedWaitMinutes >= Math.floor((+new Date(nextSlot.start) - Date.now()) / 60000), booked);
    r = await api('POST', `/appointments/${booking.id}/check-in`, { token: c4 });
    check('checking in twice → 409', r.status === 409, r.data);
    r = await api('GET', `/services/${main.id}/appointments`, { token: staff1 });
    const staffRow = r.data.appointments?.find((a) => a.id === booking.id);
    check("staff see today's bookings with status and token", staffRow && staffRow.status === 'CHECKED_IN' && staffRow.token === tk(P, 27) && staffRow.customer?.name === 'Rahul Verma', staffRow);
    r = await api('GET', `/services/${main.id}/appointments`, { token: c4 });
    check("customers cannot list a service's bookings → 403", r.status === 403, r.data);
    r = await api('GET', `/queues/${main.id}`, { token: staff1 });
    const order = r.data.waiting.map((w) => w.token);
    check('walk-in who arrived first is ahead of a booking whose slot has not started', JSON.stringify(order) === JSON.stringify([tk(P, 26), tk(P, 27)]), order);
    r = await api('POST', `/queues/${main.id}/next`, { token: staff1 });
    check(`call next serves the walk-in ${tk(P, 26)} first`, r.data.serving?.token === tk(P, 26), r.data);
    const bookedCalled = waitFor(sNew, 'token:called', (p) => p.token === tk(P, 27));
    r = await api('POST', `/queues/${main.id}/next`, { token: staff1 });
    check(`then the booked customer ${tk(P, 27)}`, r.data.serving?.token === tk(P, 27) && r.data.completed?.token === tk(P, 26), r.data);
    check('booked customer gets the live "your turn" event', !!(await bookedCalled));
    r = await api('POST', `/queues/${r.data.serving.id}/complete`, { token: staff1 });
    check('booked customer served and completed', r.status === 200 && r.data.entry.status === 'COMPLETED', r.data);
  }

  r = await api('GET', `/services/${second.id}/slots?date=${time.addDays(today, 1)}`, { token: c4 });
  const freeTomorrow = r.data.slots.find((s) => s.available > 0);
  r = await api('POST', '/appointments', { token: c4, body: { serviceId: second.id, slotStart: freeTomorrow.start } });
  const toCancel = r.data.appointment;
  check(`customer books ${second.name} for tomorrow ${freeTomorrow.time}`, r.status === 201, r.data);
  r = await api('POST', `/appointments/${toCancel.id}/check-in`, { token: c4 });
  check('checking in a day early → 409 with the time check-in opens', r.status === 409 && /Check-in opens at/.test(r.data.message), r.data);
  r = await api('DELETE', `/appointments/${toCancel.id}`, { token: c1 });
  check("cannot cancel someone else's booking → 403", r.status === 403, r.data);
  r = await api('DELETE', `/appointments/${toCancel.id}`, { token: c4 });
  check('customer cancels their booking', r.status === 200 && r.data.appointment.status === 'CANCELLED', r.data);
  r = await api('DELETE', `/appointments/${toCancel.id}`, { token: c4 });
  check('cancelling twice → 409', r.status === 409, r.data);
  r = await api('PUT', `/services/${main.id}`, { token: admin, body: hours });
  check('opening hours restored', r.status === 200 && r.data.service.booking.openTime === hours.openTime, r.data);

  console.log('\n15. Concurrency — simultaneous joins get unique sequential tokens');
  const F = fresh.tokenPrefix;
  const tokens = await Promise.all(
    Array.from({ length: 6 }, async (_, i) => {
      const reg = await api('POST', '/auth/register', {
        body: { name: `Load Customer ${i}`, email: `load${i}.${Date.now()}@waitwell.demo`, password: 'Passw0rd1' },
      });
      return reg.data.token;
    })
  );
  const joins = await Promise.all(tokens.map((t) => api('POST', '/queues/join', { token: t, body: { serviceId: fresh.id } })));
  const issued = joins.map((j) => j.data.entry?.token).sort();
  const expected = [1, 2, 3, 4, 5, 6].map((n) => tk(F, n));
  check(`6 parallel joins → ${expected[0]}..${expected[5]}, no duplicates`, JSON.stringify(issued) === JSON.stringify(expected), issued);
  const dupJoins = await Promise.all([1, 2, 3].map(() => api('POST', '/queues/join', { token: tokens[0], body: { serviceId: fresh.id } })));
  check('parallel duplicate joins by one customer are all rejected', dupJoins.every((j) => j.status === 409), dupJoins.map((j) => j.status));
  const clicks = await Promise.all([1, 2, 3].map(() => api('POST', `/queues/${fresh.id}/next`, { token: staff1 })));
  r = await api('GET', `/queues/${fresh.id}`, { token: staff1 });
  check('3 rapid "Call Next" clicks leave exactly one token SERVING', clicks.every((c) => c.status === 200) && r.data.serving?.token === tk(F, 3), { serving: r.data.serving?.token });

  console.log('\n16. Statistics & daily report');
  r = await api('GET', `/services/${main.id}/statistics`, { token: staff1 });
  const t = r.data.statistics?.totals;
  check('staff reads per-service statistics', r.status === 200 && t && t.totalTokens >= 26 && t.served >= 17 && t.waiting === 0, t);
  check("statistics include today's numbers in local time", r.data.statistics.today.issued >= 1, r.data.statistics?.today);
  check('7-day served series for the chart', r.data.statistics.servedOverTime.length === 7);
  r = await api('GET', `/services/${main.id}/statistics`, { token: staff2 });
  check('unassigned staff cannot read statistics → 403', r.status === 403, r.data);
  r = await api('GET', '/reports/daily', { token: staff1 });
  const rep = r.data.report;
  check("staff get today's report for their own services only", r.status === 200 && rep.isToday && rep.byService.length === 3, rep && rep.byService.map((s) => s.name));
  check('report splits tokens into online, walk-in and booked', rep.totals.issued === rep.totals.online + rep.totals.walkIn + rep.totals.booked && rep.totals.walkIn >= 1, rep.totals);
  check('report has an hour-by-hour breakdown and a 7-day trend', rep.hourly.length > 0 && rep.trend.length === 7, { hours: rep.hourly.length });
  r = await api('GET', `/reports/daily?serviceId=${second.id}`, { token: staff1 });
  check('staff cannot see the report of an unassigned service → 403', r.status === 403, r.data);
  r = await api('GET', `/reports/daily?date=${time.addDays(today, -2)}`, { token: admin });
  check("admin reads any past day for all of their business's services", r.status === 200 && r.data.report.byService.length === byId.length && !r.data.report.isToday, r.data.report?.date);
  r = await api('GET', '/reports/daily?date=29-09-2026', { token: admin });
  check('malformed report date → 400', r.status === 400, r.data);
  r = await api('GET', '/reports/daily', { token: c4 });
  check('customers cannot read reports → 403', r.status === 403, r.data);
  r = await api('GET', `/services/${main.id}/insights`, { token: c4 });
  check('customers see "best time to visit" insights', r.status === 200 && Array.isArray(r.data.insights.hours), r.data);

  console.log('\n17. Public directory, business pages, display board & token tracking');
  r = await api('GET', '/businesses');
  check('anyone can browse every business on the platform', r.status === 200 && r.data.businesses.length >= 5 && r.data.businesses.every((b) => b.slug && b.category), r.data.businesses?.map((b) => b.name));
  r = await api('GET', '/businesses?category=CLINIC');
  check('directory filters by kind of business', r.status === 200 && r.data.businesses.length >= 1 && r.data.businesses.every((b) => b.category === 'CLINIC'), r.data);
  r = await api('GET', '/businesses?q=glow');
  check('directory search by name', r.data.businesses?.some((b) => b.slug === 'glow-go-salon') && !r.data.businesses.some((b) => b.category === 'CLINIC'), r.data.businesses?.map((b) => b.name));
  r = await api('GET', '/businesses?category=SPACESHIP');
  check('unknown category → 400', r.status === 400, r.data);
  r = await api('GET', '/businesses/glow-go-salon');
  check('a business page lists its services with live waits, no login needed', r.status === 200 && r.data.services.length === byId.length && r.data.services.every((s) => 'estimatedWaitMinutes' in s), r.data.business);
  r = await api('GET', '/businesses/no-such-place');
  check('unknown business → 404', r.status === 404, r.data);
  r = await api('GET', '/public/glow-go-salon/board');
  check('display board needs no login and lists open services', r.status === 200 && r.data.services.length >= 4 && r.data.business.name === settings.name, r.data);
  check('board shows now serving and next tokens, no names', r.data.services.every((s) => Array.isArray(s.nextTokens)) && !JSON.stringify(r.data).includes('Verma'));
  r = await api('GET', `/public/glow-go-salon/track?serviceId=${paused.id}&token=${tk(paused.tokenPrefix, 999)}`);
  check('tracking an unknown token → 404', r.status === 404, r.data);
  r = await api('GET', `/public/glow-go-salon/track?serviceId=${paused.id}&token=<script>`);
  check('tracking with a malformed token → 400', r.status === 400, r.data);
  r = await api('GET', `/public/citycare-family-clinic/track?serviceId=${main.id}&token=${tk(P, 21)}`);
  check("tracking a token through another business's page → 404", r.status === 404, r.data);

  console.log('\n18. Business settings');
  r = await api('PUT', '/businesses/mine', { token: staff1, body: { name: 'Hacked' } });
  check('staff cannot change business settings → 403', r.status === 403, r.data);
  r = await api('PUT', '/businesses/mine', { token: admin, body: { timezone: 'Mars/Olympus_Mons' } });
  check('invalid timezone → 400', r.status === 400, r.data);
  r = await api('PUT', '/businesses/mine', { token: admin, body: { name: 'Renamed Salon', category: 'OTHER', address: 'New address' } });
  check('admin renames their business and changes its details', r.status === 200 && r.data.business.name === 'Renamed Salon' && r.data.business.category === 'OTHER', r.data);
  r = await api('GET', '/businesses/citycare-family-clinic');
  check("…without touching any other business", r.data.business.name === 'CityCare Family Clinic', r.data.business);
  r = await api('PUT', '/businesses/mine', { token: admin, body: { name: settings.name, category: settings.category, address: settings.address } });
  check('settings restored', r.status === 200 && r.data.business.name === settings.name, r.data);

  console.log('\n19. Admin service management');
  const staffList = (await api('GET', '/auth/staff', { token: admin })).data.staff;
  r = await api('POST', '/services', { token: staff1, body: { name: 'X', location: 'Y', tokenPrefix: 'X' } });
  check('staff cannot create services → 403', r.status === 403, r.data);
  r = await api('POST', '/services', { token: admin, body: { name: 'Evening Desk', location: 'Front counter', tokenPrefix: 'ev', avgServiceMinutes: 4, openTime: '18:00', closeTime: '09:00' } });
  check('closing time before opening time → 400', r.status === 400, r.data);
  r = await api('POST', '/services', { token: admin, body: { name: 'Evening Desk', location: 'Front counter', tokenPrefix: 'ev', avgServiceMinutes: 4, slotMinutes: 20, slotCapacity: 3, openTime: '17:00', closeTime: '21:00', staffIds: [staffList[0].id] } });
  check('admin creates a service with booking hours (prefix normalised to EV)', r.status === 201 && r.data.service.tokenPrefix === 'EV' && r.data.service.booking.slotCapacity === 3, r.data);
  const newId = r.data.service?.id;
  r = await api('POST', '/services', { token: admin, body: { name: 'Evening Desk', location: 'Somewhere', tokenPrefix: 'Z' } });
  check('duplicate service name → 409', r.status === 409, r.data);
  r = await api('PUT', `/services/${newId}`, { token: admin, body: { location: 'Back counter', status: 'CLOSED', bookingEnabled: false } });
  check('admin updates location, closes the service and turns bookings off', r.status === 200 && r.data.service.location === 'Back counter' && r.data.service.status === 'CLOSED' && !r.data.service.booking.enabled, r.data);
  r = await api('POST', '/queues/join', { token: c5, body: { serviceId: newId } });
  check('joining a closed service → 409', r.status === 409, r.data);
  r = await api('GET', `/services/${newId}/slots`, { token: c5 });
  check('a service with bookings off offers no slots', r.status === 200 && r.data.enabled === false && r.data.slots.length === 0, r.data);
  r = await api('POST', '/services', { token: admin, body: { name: '<b>x</b>', location: 'ok place', tokenPrefix: '1' } });
  check('invalid token prefix → 400', r.status === 400, r.data);

  console.log('\n20. Admin staff accounts');
  const newStaff = { name: 'Nisha Kapoor', email: 'Staff3@Waitwell.demo', password: 'Welcome123' };
  r = await api('POST', '/auth/staff', { token: staff1, body: newStaff });
  check('staff cannot create staff accounts → 403', r.status === 403, r.data);
  r = await api('POST', '/auth/staff', { token: admin, body: { ...newStaff, password: 'short' } });
  check('weak staff password → 400', r.status === 400, r.data);
  r = await api('POST', '/auth/staff', { token: admin, body: { ...newStaff, serviceIds: [999999] } });
  check('unknown service id → 400 (no account created)', r.status === 400, r.data);
  r = await api('POST', '/auth/staff', { token: admin, body: { ...newStaff, role: 'ADMIN', serviceIds: [main.id] } });
  check(`admin creates a staff account assigned to ${main.name}`, r.status === 201 && r.data.staff?.services?.[0]?.id === main.id, r.data);
  r = await api('POST', '/auth/staff', { token: admin, body: newStaff });
  check('duplicate staff email → 409', r.status === 409, r.data);
  r = await api('POST', '/auth/login', { body: { email: 'staff3@waitwell.demo', password: newStaff.password } });
  check('new staff logs in with a normalised email and is STAFF (role field ignored)', r.status === 200 && r.data.user?.role === 'STAFF', r.data);
  const staff3 = r.data.token;
  r = await api('GET', `/services/${main.id}/statistics`, { token: staff3 });
  check('new staff can manage their assigned service', r.status === 200, r.data);
  r = await api('GET', `/services/${second.id}/statistics`, { token: staff3 });
  check('…but not an unassigned one → 403', r.status === 403, r.data);

  console.log('\n21. Businesses are kept apart');
  r = await api('GET', '/services', { token: clinicAdmin });
  check("another business's admin only sees their own services", r.status === 200 && r.data.services.length >= 5 && !r.data.services.some((s) => s.id === main.id), r.data.services?.map((s) => s.name));
  const clinicServiceId = r.data.services[0].id;
  r = await api('POST', `/queues/${main.id}/next`, { token: clinicAdmin });
  check("…cannot call next on another business's queue → 403", r.status === 403, r.data);
  r = await api('PUT', `/services/${main.id}`, { token: clinicAdmin, body: { location: 'Hijacked' } });
  check("…cannot edit another business's service → 404", r.status === 404, r.data);
  r = await api('GET', `/services/${main.id}/appointments`, { token: clinicAdmin });
  check("…cannot see another business's bookings → 403", r.status === 403, r.data);
  r = await api('GET', `/reports/daily?serviceId=${main.id}`, { token: clinicAdmin });
  check("…cannot read another business's report", r.status === 404 || r.status === 403, r.data);
  r = await api('POST', `/queues/${main.id}/walk-in`, { token: clinicAdmin, body: { name: 'Wrong Business' } });
  check("…cannot add walk-ins to another business → 403", r.status === 403, r.data);
  r = await api('GET', '/auth/staff', { token: clinicAdmin });
  check("…and only lists their own staff", r.status === 200 && !r.data.staff.some((x) => x.email.startsWith('salon.')), r.data.staff?.map((x) => x.email));
  const salonStaffId = staffList[0].id;
  r = await api('POST', '/services', { token: clinicAdmin, body: { name: 'Night Clinic', location: 'Room 9', tokenPrefix: P, staffIds: [salonStaffId] } });
  check("…cannot assign another business's staff → 400", r.status === 400, r.data);
  r = await api('POST', '/services', { token: clinicAdmin, body: { name: 'Night Clinic', location: 'Room 9', tokenPrefix: P } });
  check(`two businesses may use the same token prefix (${P})`, r.status === 201 && r.data.service.tokenPrefix === P, r.data);
  r = await api('POST', '/auth/staff', { token: clinicAdmin, body: { name: 'Cross Over', email: `cross${Date.now()}@waitwell.demo`, password: 'Welcome123', serviceIds: [main.id] } });
  check("…cannot give their staff another business's service → 400", r.status === 400, r.data);
  r = await api('GET', `/services/${clinicServiceId}/statistics`, { token: staff1 });
  check("staff cannot read another business's statistics → 403", r.status === 403, r.data);

  console.log('\n22. Any business can sign up');
  const ownerEmail = `owner${Date.now()}@waitwell.demo`;
  const signup = { businessName: 'Sunrise Pet Grooming', category: 'OTHER', tagline: 'Baths, trims & nail clipping', address: '7 Lake Road', timezone: 'Asia/Kolkata', name: 'Maya Joshi', email: ownerEmail, password: 'Welcome123' };
  r = await api('POST', '/businesses', { body: { ...signup, businessName: 'X' } });
  check('sign-up without a proper business name → 400', r.status === 400, r.data);
  r = await api('POST', '/businesses', { body: { ...signup, category: 'SPACESHIP' } });
  check('sign-up with an unknown category → 400', r.status === 400, r.data);
  r = await api('POST', '/businesses', { body: { ...signup, email: 'rahul@waitwell.demo' } });
  check('sign-up with an email that already has an account → 409', r.status === 409, r.data);
  r = await api('POST', '/businesses', { body: { ...signup, role: 'CUSTOMER' } });
  const owner = r.data.token;
  check('a new business signs up; its owner is logged in as its admin', r.status === 201 && r.data.user?.role === 'ADMIN' && r.data.user.business?.slug === 'sunrise-pet-grooming', r.data);
  r = await api('GET', '/services', { token: owner });
  check('a new business starts with no services', r.status === 200 && r.data.services.length === 0, r.data);
  r = await api('POST', '/services', { token: owner, body: { name: 'Full Groom', location: 'Table 1', tokenPrefix: 'G', avgServiceMinutes: 40, slotMinutes: 60, openTime: '09:00', closeTime: '18:00' } });
  check('the owner adds their first service', r.status === 201 && r.data.service.tokenPrefix === 'G', r.data);
  r = await api('GET', '/businesses?q=sunrise');
  check('the new business appears in the public directory', r.data.businesses?.some((b) => b.slug === 'sunrise-pet-grooming' && b.services === 1), r.data);
  r = await api('POST', '/businesses', { body: { ...signup, email: `owner2.${Date.now()}@waitwell.demo` } });
  check('two businesses with the same name get different links', r.status === 201 && r.data.user.business.slug === 'sunrise-pet-grooming-2', r.data.user?.business);

  [sNew, s2, sStaff].forEach((s) => s.close());
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log('Reminder: run `npm run db:reset` to restore the demo data before presenting.');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('Verification crashed:', err);
  process.exit(1);
});
