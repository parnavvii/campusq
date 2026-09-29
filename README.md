# Waitwell — queues and bookings for any small service business

Waitwell is one shared platform for any small service business: a **salon, clinic, repair shop, college office, help desk, bank branch, food counter**, or any other place where people wait their turn.

- **Businesses** sign up in a couple of minutes. Each one gets its own page, a waiting-room screen and a token-tracking link.
- **Customers** use one account for every place. They find a business, then **join its queue** or **book a time**. They get a token and watch their place update live.
- **Staff** call the next person, add walk-ins, check in bookings and pause the queue.
- **Owners** set up their services and team, and read a **daily report**.

| Layer | Technology |
|---|---|
| Frontend | React 18 (Vite) + Tailwind CSS, Recharts |
| Backend | Node.js + Express REST API |
| Database | MySQL 8 (mysql2, parameterised queries) |
| Real-time | Socket.IO (JWT-authenticated) |
| Auth | JWT (HS256) + bcrypt password hashing |

---

## 1. What it does

### Customers (one account, every business)
- **Explore** all businesses on Waitwell. Search by name or filter by kind: salon, clinic, repair and so on. Each card shows how many people are waiting and the shortest wait right now.
- On a business's page, see every service live: who is being served, how many are waiting, and the wait if you join now.
- **Join the queue** to get a token instantly (e.g. `H024`) with the number of people ahead, the estimated wait and who is being served now.
- **Book a time.** Pick a day and a slot; each slot shows how many places are left, and you get a booking code.
- **Check in on arrival** ("I'm here") during the check-in window. Your booking becomes a token that is called at your slot time.
- **Waiting-time assistant.** It compares "walk in now" with "next free slot", recommends the faster one, and shows the **quietest hours** from the last 4 weeks.
- **My visits** (`/me`) lists tokens and bookings across all businesses, each in that business's local time.
- **Live alerts:** "You're next", "It's your turn" (with a browser notification and vibration), skipped, and missed booking.
- Cancel a token or a booking at any time, and see your full history.

### Businesses (owner = admin of that business)
- **Sign up** at `/business/new` with the business name, kind, short description, address, timezone and your own login. The owner lands straight in "add your first service".
- **Business settings:** name, kind, description, address, timezone, how far ahead people can book, when check-in opens, and when a booking counts as missed. Share links for the business page, the waiting-room screen and walk-in tracking.
- **Services:** token prefix, location, default service time, opening hours, slot length, customers per slot, bookings on/off, status (open / paused / closed), and assigned staff.
- **Team:** create staff logins and assign them to services.

### Staff
- **Queue console** per service: **Call next**, complete, skip (no-show), **pause/resume**.
- **Add a walk-in:** issue a token to someone at the desk, with no account or phone needed. They get a tracking link.
- **Today's bookings**, with one-tap check-in for customers who arrive without the app.
- The waiting list shows how each person got in line: Online, Walk-in or "Booked 10:40".
- **Daily report** for any date (see below) and per-service statistics.

### Public screens (no login)
- **`/p/<business>/board`** is the waiting-room TV screen: who is being served now and the next tokens for every service. It shows numbers only, never names.
- **`/p/<business>/track`** lets walk-in customers follow their token.

### Daily report (`/staff/reports`)
Pick any date, and optionally one service. The report shows:
- tokens issued (online / walk-in / booked), served, cancelled and skipped,
- average and longest wait, and average service time,
- bookings (checked in / missed / upcoming) and the busiest hour,
- an **hour-by-hour chart**, a per-service table and a 7-day trend.

All times are in the business's local time. The report can be **downloaded as CSV**.

---

## 2. One platform, many businesses

```
businesses ──< services ──< queue_entries
     │             └──< appointments
     └──< users (STAFF / ADMIN belong to one business)     users (CUSTOMER) are global
```

- **Isolation.** Every staff and admin action is checked against the business on their account: services, the team, reports, statistics and walk-ins. A salon's admin cannot see or change a clinic's queue. The verify script tests this.
- **Per-business rules.** Timezone, booking window, check-in window and the no-show grace period all live on the business. Slots, "today", reports and the no-show sweep all use the business's own clock.
- **Unique per business.** Service names and token prefixes only need to be unique within one business, so two businesses can both have an `A` queue.
- **Links.** Each business gets a slug (`glow-go-salon`). Two businesses with the same name get `-2`, `-3`, and so on.
- **Live updates scale per business.**
  - `queue:updated` goes to that service's room.
  - `services:changed` goes only to that business's room, and is coalesced to at most one per second.
  - The service list is cached for 2 s per business.

---

## 3. How bookings and the queue work together

```
Booking:  BOOKED ──check in (from N min before)──▶ CHECKED_IN → gets a token placed at the slot time
             ├── customer cancels ──▶ CANCELLED
             └── not checked in by slot + grace ──▶ NO_SHOW  (background sweep, every minute)

Token:    WAITING ──call next──▶ SERVING ──call next / complete──▶ COMPLETED
             ├── customer cancels ──▶ CANCELLED
             └── staff skips ───────┴──▶ SKIPPED
```

**Order of service.** One rule, in `estimate.service.js` and mirrored in SQL:
1. Checked-in bookings **whose slot time has arrived** go first, earliest slot first.
2. Then everyone else, in the order they got in line.

So a booking keeps its time, and walk-ins fill the gaps between appointments.

**Smart waiting-time estimate**

```
estimated wait ≈ (people ahead + bookings that become due before your turn) × average service time
```
- *Average service time* is the mean of the last 20 completed tokens, ignoring anything under 20 s. A new service uses its default time.
- For a walk-in, the estimate counts bookings whose slot arrives before the walk-in would reach the counter.
- For a booked customer, the estimate is never earlier than their slot.

**Concurrency.** Every join, check-in, booking and "Call next" runs in a MySQL transaction that first locks the service row (`SELECT … FOR UPDATE`). UNIQUE indexes back this up:
- one active token per customer per service,
- one upcoming booking per customer per service,
- one token being served per service.

---

## 4. Quick start

Requirements: **Node.js 18+** and **MySQL 8.0+**.

```bash
# 1. Create the database and an app user (once, as a MySQL admin)
mysql -u root -p < server/src/db/create-database.sql

# 2. Backend
cd server
cp .env.example .env        # edit DB_* and JWT_SECRET if needed
npm install
npm run db:reset            # create tables + load 5 demo businesses
npm run dev                 # http://localhost:5000

# 3. Frontend (second terminal)
cd client
npm install
npm run dev                 # http://localhost:5173  ← open this
```

From the repo root you can run `npm run install:all`, `npm run db:reset`, `npm run dev:server` and `npm run dev:client`.

- **Single-port mode:** run `cd client && npm run build`, then `cd server && npm start`, and open http://localhost:5000.
- **Phone on the same Wi-Fi:** open `http://<laptop-IP>:5173`.

### Demo businesses

| Business | Kind | Page | Walk-in tokens |
|---|---|---|---|
| Glow & Go Salon | Salon | `/p/glow-go-salon` | H021 being served, H022/H023 waiting — **the main demo story** |
| CityCare Family Clinic | Clinic | `/p/citycare-family-clinic` | G021… |
| FixIt Hub | Repair shop | `/p/fixit-hub` | P021… |
| Riverside College Student Services | Office | `/p/riverside-college-student-services` | A021… |
| TechAssist IT Help Desk | Help desk | `/p/techassist-it-help-desk` | A021… |

Every business has the same set of services:
- a busy main service,
- one with a walk-in waiting,
- a quiet one,
- a **paused** one with customers still in line,
- a brand-new one with no history.

The seed also includes a week of history (online, walk-in and booked tokens, cancellations, skips, no-shows) and some of tomorrow's bookings.

### Demo logins

| Who | Email | Password |
|---|---|---|
| Customers (use every business) | `priya`, `karthik`, `ananya`, `rahul`, `sneha`, `vikram` `@waitwell.demo` | `Customer@123` |
| Business owner (admin) | `<business>.admin@waitwell.demo` | `Team@1234` |
| Staff | `<business>.staff1@waitwell.demo`, `<business>.staff2@waitwell.demo` | `Team@1234` |

`<business>` is one of `salon`, `clinic`, `repair`, `office`, `helpdesk`.

- **Rahul** is the "new customer" in the demo.
- `salon.staff1` (Meera) runs the main, paused and new services.
- `salon.staff2` (Arjun) runs the other two, which is useful for showing "not authorized".

There is one login page for everyone. It shows one-click demo buttons **in development builds only**.

---

## 5. Pages

| Everyone | Customer | Staff | Owner (admin) |
|---|---|---|---|
| `/` Home | `/me` My visits | `/staff` My queues | `/admin/business` Business settings & share links |
| `/explore` All businesses | `/me/history` History | `/staff/services/:id` Queue console | `/admin/services` Services & hours |
| `/p/:slug` A business's page | `/p/:slug/book/:serviceId` Book a time | `/staff/services/:id/stats` Statistics | `/admin/staff` Team |
| `/p/:slug/board` Waiting-room screen | | `/staff/reports` Daily report | (+ every staff page) |
| `/p/:slug/track` Track a token | | | |
| `/login`, `/register`, `/business/new` | | | |

---

## 6. REST API

The base URL is `/api`, with JSON in and out.
- **Authentication:** most endpoints need `Authorization: Bearer <JWT>`. The exceptions are `auth/register`, `auth/login`, `GET /businesses…`, `POST /businesses`, `public/*` and `health`.
- **Errors** look like `{ "success": false, "message": "…" }`, with status 400, 401, 403, 404, 409 or 429.

| Method & path | Who | What |
|---|---|---|
| `POST /auth/register` | public | Create a **customer** account (`name, email, password, phone?`); any `role` field is ignored |
| `POST /auth/login` | public | Returns a JWT and the user (with their business, for staff and admins); rate-limited per IP + email |
| `GET /auth/me` | any | Current user |
| `GET / POST /auth/staff` | admin | List / create staff for **their** business |
| `GET /businesses?q=&category=` | public | Directory with live counts: waiting now, shortest wait, open services |
| `POST /businesses` | public | **Sign up a business** and its owner account; returns a JWT (20/hour per IP) |
| `GET /businesses/:slug` | public | One business with its live services |
| `GET / PUT /businesses/mine` | admin | Read / edit their business's details and booking rules |
| `GET /services?business=` | any | Customers pass a business; staff and admins get their own |
| `GET /services/:id` | any | Live queue length, now serving, estimate, booking settings |
| `POST /services` · `PUT /services/:id` | admin | Create / edit (incl. hours, slots, status, staff) |
| `POST /services/:id/pause` · `/resume` | assigned staff, admin | Pause / reopen the queue |
| `GET /services/:id/slots?date=` | any | Slots for a day with places left (in the business's timezone) |
| `GET /services/:id/insights` | any | Typical wait by hour (quietest / busiest) |
| `GET /services/:id/appointments?date=` | assigned staff, admin | The day's bookings |
| `GET /services/:id/statistics` | assigned staff, admin | All-time totals + today + 7-day series |
| `POST /queues/join` | customer | Take the next token |
| `GET /queues/my-position` · `/my-history` | customer | My active tokens (live position) / history, across businesses |
| `DELETE /queues/:queueId` | customer (owner) | Leave the queue |
| `GET /queues/:serviceId` | any | Queue view: full for assigned staff, token numbers only for others |
| `POST /queues/:serviceId/walk-in` | assigned staff, admin | Issue a token to a walk-in (`name, phone?`) |
| `POST /queues/:serviceId/next` | assigned staff, admin | Complete current, serve next in line |
| `POST /queues/:queueId/complete` · `/skip` | assigned staff, admin | Finish / skip one token |
| `POST /appointments` | customer | Book a slot (`serviceId, slotStart`) |
| `GET /appointments/mine` | customer | Upcoming + past bookings |
| `DELETE /appointments/:id` | customer (owner) | Cancel a booking |
| `POST /appointments/:id/check-in` | owner, or assigned staff | Check in → token at the slot time |
| `GET /reports/daily?date=&serviceId=` | staff (own services), admin | Daily report for their business |
| `GET /public/:slug/board` · `/public/:slug/track?serviceId=&token=` | public | Waiting-room screen / token tracking (no names) |

**Socket.IO events:**
- `queue:updated` goes to a service's room.
- `services:changed` goes to a business's room; clients join with `business:subscribe`, and staff join automatically.
- Personal events: `token:called`, `token:next`, `token:skipped`, `token:completed`, `booking:updated`.

Events only say *what* changed. Screens then re-fetch through the REST API, so all permission checks stay in one place.

---

## 7. Database

The schema is in `server/src/db/schema.sql`. All times are stored in UTC; each business's timezone is stored on the business.

- **businesses:** name, slug, kind, tagline, address, timezone, booking window, check-in / no-show minutes
- **users:** name, email, phone, bcrypt hash, role `CUSTOMER | STAFF | ADMIN`, `business_id` (for staff and admins)
- **services:** business, name, location, token prefix, status, default minutes, token counter, **booking_enabled, slot_minutes, slot_capacity, open_time, close_time**
- **appointments:** service, customer, booking code, slot start, status `BOOKED | CHECKED_IN | CANCELLED | NO_SHOW`
- **queue_entries:** token number, status, **source `ONLINE | WALK_IN | BOOKING`**, guest name/phone for walk-ins, linked appointment, `queue_at` (place in line), timestamps
- **staff_services:** which staff run which service

---

## 8. Verify everything works

With the server running on a freshly seeded database:

```bash
cd server && npm run verify     # ~170 end-to-end checks (REST + Socket.IO)
npm run db:reset                 # restore demo data afterwards
```

The checks cover:
- authentication and validation,
- joining, calling next and live events,
- cancel, skip and pause rules, and walk-ins,
- booking → check-in → served, including the booking-priority rule,
- full slots and no double-booking,
- the daily report, business settings, the directory and the waiting-room screen,
- concurrency: simultaneous joins get unique, sequential tokens,
- **isolation between businesses** and **business sign-up**,
- every permission rule.

Late in the evening, when no booking slot is left that day, the check-in checks skip themselves and say so.

---

## 9. Design

The UI is designed to feel calm and human rather than "dashboard-y":
- **Colours:** warm paper and cream backgrounds, sage green for actions, apricot and butter as accents, and a soft rose for anything destructive.
- **Fonts:** *Fraunces* (a soft serif) for headings and token numbers, and *Figtree* for everything else.
- **Shapes:** rounded cards and pill buttons with gentle shadows.

The colours are defined in `client/tailwind.config.js`, and the shared component classes are in `client/src/index.css`.

---

## 10. Security & deployment notes

| Concern | Implementation |
|---|---|
| Validation | express-validator on every body, param and query; client checks are only for UX |
| SQL injection | only `?` placeholders; dynamic column names come from fixed whitelists |
| Authorization | role checks + business checks + per-service assignment + ownership, all on the server |
| Multi-tenancy | every staff/admin query is scoped to the account's business |
| Race conditions | transactions + row locks + UNIQUE indexes |
| Brute force | login limited per IP **and** email; business sign-up limited per IP |
| Public endpoints | own rate limit; expose token numbers and counts only |
| Headers / CORS | `helmet`; CORS and Socket.IO restricted to `CLIENT_ORIGIN` |
| Errors | unexpected errors logged server-side; clients get a generic message |

**Before going live:**
1. Put a strong `JWT_SECRET` and DB password in the host's environment variables.
2. Set `NODE_ENV=production`, `CLIENT_ORIGIN=https://your-site`, and `TRUST_PROXY=1` behind a hosting proxy.
3. Serve over HTTPS.
4. Start with an empty database instead of the demo seed:

```bash
npm run db:setup          # tables only, no demo data
```

Then open `/business/new` to sign up your first business. Customers register themselves at `/register`. Demo login buttons are left out of production builds automatically.
