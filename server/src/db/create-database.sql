-- Run ONCE as a MySQL admin (e.g. `mysql -u root -p < server/src/db/create-database.sql`)
-- Creates the database and a least-privilege application user.
CREATE DATABASE IF NOT EXISTS campusq CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'campusq'@'localhost' IDENTIFIED BY 'campusq_pass';
GRANT ALL PRIVILEGES ON campusq.* TO 'campusq'@'localhost';
FLUSH PRIVILEGES;
