'use strict';

const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { DATA_DIR } = require('./paths');

const DB_PATH = path.join(DATA_DIR, 'debtclarity.sqlite');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'client',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS personal (
  case_id TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  title TEXT,
  gender TEXT,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  used_different_name INTEGER DEFAULT 0,
  previous_first_name TEXT,
  previous_last_name TEXT,
  dob_day TEXT,
  dob_month TEXT,
  dob_year TEXT,
  marital_status TEXT,
  ni_number TEXT,
  mobile TEXT,
  landline TEXT,
  email TEXT
);

CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  postcode TEXT,
  building_number TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  town_city TEXT,
  county TEXT,
  living_status TEXT,
  month_moved_in TEXT,
  year_moved_in TEXT,
  is_current INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS employment (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  employer_name TEXT,
  job_title TEXT,
  employment_type TEXT,
  start_month TEXT,
  start_year TEXT,
  end_month TEXT,
  end_year TEXT,
  is_current INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS case_meta (
  case_id TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  employment_status TEXT,
  no_dependants INTEGER DEFAULT 0,
  no_property INTEGER DEFAULT 0,
  no_vehicles INTEGER DEFAULT 0,
  no_insurance INTEGER DEFAULT 0,
  no_assets INTEGER DEFAULT 0,
  income_data TEXT,
  expenditure_data TEXT,
  solution_type TEXT,
  solution_chosen_at TEXT
);

CREATE TABLE IF NOT EXISTS dependants (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name TEXT,
  dob TEXT,
  relationship TEXT
);

CREATE TABLE IF NOT EXISTS creditors (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name TEXT,
  type TEXT,
  balance REAL DEFAULT 0,
  monthly_repayment REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  address TEXT,
  property_type TEXT,
  value REAL DEFAULT 0,
  mortgage_balance REAL DEFAULT 0,
  ownership TEXT
);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  make TEXT,
  model TEXT,
  year TEXT,
  value REAL DEFAULT 0,
  finance_balance REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  bank_name TEXT,
  account_type TEXT,
  sort_code TEXT,
  account_number TEXT,
  balance REAL DEFAULT 0,
  ownership TEXT
);

CREATE TABLE IF NOT EXISTS insurance_policies (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  provider TEXT,
  policy_type TEXT,
  monthly_premium REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  description TEXT,
  estimated_value REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  original_name TEXT,
  stored_name TEXT,
  mime_type TEXT,
  size INTEGER,
  uploaded_at TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_attempt_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  actor_user_id TEXT,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  case_id TEXT,
  detail TEXT,
  ip TEXT
);
`);

// Idempotent migration for databases created before the 'role' column existed.
try {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'client';");
} catch (err) {
  if (!/duplicate column/i.test(err.message)) throw err;
}

module.exports = db;
