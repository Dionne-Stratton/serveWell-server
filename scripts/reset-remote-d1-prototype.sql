-- One-time cutover: drop prototype schema so SaaS migrations can run on remote D1.
PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS volunteer_requirement_confirmations;
DROP TABLE IF EXISTS volunteer_interests;
DROP TABLE IF EXISTS volunteer_availability;
DROP TABLE IF EXISTS admin_notes;
DROP TABLE IF EXISTS volunteer_submissions;
DROP TABLE IF EXISTS serving_area_requirements;
DROP TABLE IF EXISTS serving_areas;
DROP TABLE IF EXISTS admin_users;
DROP TABLE IF EXISTS d1_migrations;
PRAGMA foreign_keys = ON;
