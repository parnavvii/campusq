-- Waitwell schema (MySQL 8.0+)
-- A multi-business platform: any service business (salon, clinic, repair shop,
-- office, help desk...) signs up and runs its own services, staff, queue and bookings.
-- Tables: businesses, users, services, appointments, queue_entries, staff_services
-- All DATETIME values are stored in UTC; each business's local timezone lives on its row.

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS staff_services;
DROP TABLE IF EXISTS queue_entries;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS businesses;
DROP TABLE IF EXISTS settings;
SET FOREIGN_KEY_CHECKS = 1;

-- Every business on the platform, with its own local time and booking rules.
CREATE TABLE businesses (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                   VARCHAR(100) NOT NULL,
  slug                   VARCHAR(80)  NOT NULL,          -- used in public links: /p/glow-and-go-salon
  category               ENUM('SALON','CLINIC','REPAIR','OFFICE','HELPDESK','BANK','FOOD','OTHER') NOT NULL DEFAULT 'OTHER',
  tagline                VARCHAR(200) NOT NULL DEFAULT '',
  address                VARCHAR(200) NOT NULL DEFAULT '',
  timezone               VARCHAR(64)  NOT NULL DEFAULT 'Asia/Kolkata',
  booking_days_ahead     TINYINT UNSIGNED  NOT NULL DEFAULT 7,   -- how far ahead customers may book
  checkin_early_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 30,  -- check-in opens this long before a slot
  no_show_minutes        SMALLINT UNSIGNED NOT NULL DEFAULT 10,  -- grace period after a slot starts
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_business_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Customers belong to no business (they can visit any); staff and admins belong to exactly one.
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id   INT UNSIGNED NULL,
  name          VARCHAR(100)  NOT NULL,
  email         VARCHAR(191)  NOT NULL,
  phone         VARCHAR(20)   NULL,
  password_hash VARCHAR(255)  NOT NULL,           -- bcrypt hash, never plaintext
  role          ENUM('CUSTOMER','STAFF','ADMIN') NOT NULL DEFAULT 'CUSTOMER',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_business (business_id, role),
  -- (staff/admins always have a business_id and customers never do — enforced by the API)
  CONSTRAINT fk_user_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE services (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id         INT UNSIGNED NOT NULL,
  name                VARCHAR(100) NOT NULL,
  location            VARCHAR(150) NOT NULL,        -- "Chair 2", "Room 3", "Counter 1"...
  token_prefix        VARCHAR(3)   NOT NULL,        -- 'H' -> tokens H001, H002...
  status              ENUM('ACTIVE','PAUSED','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  avg_service_minutes DECIMAL(5,2) NOT NULL DEFAULT 3.00, -- fallback until history exists
  last_token_number   INT UNSIGNED NOT NULL DEFAULT 0,    -- sequential token counter
  booking_enabled     TINYINT(1)   NOT NULL DEFAULT 1,
  slot_minutes        SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  slot_capacity       SMALLINT UNSIGNED NOT NULL DEFAULT 1,  -- customers per slot
  open_time           TIME NOT NULL DEFAULT '09:00:00',      -- business local time
  close_time          TIME NOT NULL DEFAULT '17:00:00',      -- business local time ('24:00:00' = midnight)
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_services_name (business_id, name),          -- unique within a business
  UNIQUE KEY uq_services_prefix (business_id, token_prefix),
  CONSTRAINT fk_service_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A booked time slot. On arrival the customer checks in and receives a queue token.
CREATE TABLE appointments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service_id    INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  code          CHAR(6)      NOT NULL,              -- short booking reference, e.g. K7Q2MX
  slot_start    DATETIME     NOT NULL,              -- UTC
  status        ENUM('BOOKED','CHECKED_IN','CANCELLED','NO_SHOW') NOT NULL DEFAULT 'BOOKED',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_in_at DATETIME NULL,
  cancelled_at  DATETIME NULL,
  -- a customer can hold at most ONE upcoming booking per service
  active_key    TINYINT AS (IF(status = 'BOOKED', 1, NULL)) STORED,
  UNIQUE KEY uq_appointment_code (code),
  UNIQUE KEY uq_one_booking_per_customer (service_id, user_id, active_key),
  KEY idx_appt_service_slot (service_id, slot_start, status),
  KEY idx_appt_user_status (user_id, status),
  CONSTRAINT fk_appt_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  CONSTRAINT fk_appt_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE queue_entries (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service_id     INT UNSIGNED NOT NULL,
  user_id        INT UNSIGNED NULL,                 -- NULL for walk-ins added by staff
  guest_name     VARCHAR(100) NULL,                 -- walk-in customer's name
  guest_phone    VARCHAR(20)  NULL,
  source         ENUM('ONLINE','WALK_IN','BOOKING') NOT NULL DEFAULT 'ONLINE',
  appointment_id INT UNSIGNED NULL,                 -- set when a booking checked in
  token_number   INT UNSIGNED NOT NULL,
  status         ENUM('WAITING','SERVING','COMPLETED','SKIPPED','CANCELLED') NOT NULL DEFAULT 'WAITING',
  joined_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Place in line: join time for walk-ins, slot time for bookings. Bookings whose
  -- slot has arrived are served first; everyone else in queue_at order.
  queue_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  called_at      DATETIME NULL,
  completed_at   DATETIME NULL,
  cancelled_at   DATETIME NULL,
  skipped_at     DATETIME NULL,
  -- Generated helper columns let the database itself enforce queue rules:
  --   * a customer can hold at most ONE active token per service
  --   * a service can have at most ONE token being served at a time
  -- (NULLs are ignored by UNIQUE indexes, so finished tokens and walk-ins don't collide.)
  active_key     TINYINT AS (IF(status IN ('WAITING','SERVING'), 1, NULL)) STORED,
  serving_key    TINYINT AS (IF(status = 'SERVING', 1, NULL)) STORED,
  UNIQUE KEY uq_token_per_service (service_id, token_number),
  UNIQUE KEY uq_one_active_per_customer (service_id, user_id, active_key),
  UNIQUE KEY uq_one_serving_per_service (service_id, serving_key),
  KEY idx_queue_order (service_id, status, queue_at, token_number),
  KEY idx_queue_user_status (user_id, status),
  KEY idx_queue_joined (joined_at),
  CONSTRAINT fk_queue_service     FOREIGN KEY (service_id)     REFERENCES services(id)     ON DELETE CASCADE,
  CONSTRAINT fk_queue_user        FOREIGN KEY (user_id)        REFERENCES users(id)        ON DELETE CASCADE,
  CONSTRAINT fk_queue_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE staff_services (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id   INT UNSIGNED NOT NULL,
  service_id INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_staff_service (staff_id, service_id),
  CONSTRAINT fk_ss_staff   FOREIGN KEY (staff_id)   REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_ss_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
