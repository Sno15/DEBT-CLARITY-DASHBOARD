'use strict';

const db = require('./db');
const { newId } = require('./util');
const { encryptString, decryptString } = require('./security');

// Configuration for simple list-style resources that share the same
// list / create / update / delete shape, keyed by the URL segment used
// in /api/case/<key>. `encryptedColumns` lists the columns that are
// encrypted at rest (transparently encrypted on write, decrypted on read).
const RESOURCES = {
  dependants: {
    table: 'dependants',
    columns: ['name', 'dob', 'relationship'],
    encryptedColumns: ['name', 'dob'],
  },
  employment: {
    table: 'employment',
    columns: [
      'employer_name', 'job_title', 'employment_type',
      'start_month', 'start_year', 'end_month', 'end_year', 'is_current',
    ],
    encryptedColumns: [],
  },
  addresses: {
    table: 'addresses',
    columns: [
      'postcode', 'building_number', 'address_line1', 'address_line2',
      'town_city', 'county', 'living_status', 'month_moved_in', 'year_moved_in',
      'is_current', 'sort_order',
    ],
    encryptedColumns: ['postcode', 'building_number', 'address_line1', 'address_line2'],
  },
  creditors: {
    table: 'creditors',
    columns: ['name', 'type', 'balance', 'monthly_repayment'],
    encryptedColumns: [],
  },
  properties: {
    table: 'properties',
    columns: ['address', 'property_type', 'value', 'mortgage_balance', 'ownership'],
    encryptedColumns: ['address'],
  },
  vehicles: {
    table: 'vehicles',
    columns: ['make', 'model', 'year', 'value', 'finance_balance'],
    encryptedColumns: [],
  },
  'bank-accounts': {
    table: 'bank_accounts',
    columns: ['bank_name', 'account_type', 'sort_code', 'account_number', 'balance', 'ownership'],
    encryptedColumns: ['sort_code', 'account_number'],
  },
  'insurance-policies': {
    table: 'insurance_policies',
    columns: ['provider', 'policy_type', 'monthly_premium'],
    encryptedColumns: [],
  },
  assets: {
    table: 'assets',
    columns: ['description', 'estimated_value'],
    encryptedColumns: [],
  },
};

function decryptRow(cfg, row) {
  if (!row) return row;
  const out = { ...row };
  cfg.encryptedColumns.forEach((c) => { out[c] = decryptString(out[c]); });
  return out;
}

function listResource(key, caseId) {
  const cfg = RESOURCES[key];
  const rows = db.prepare(`SELECT * FROM ${cfg.table} WHERE case_id = ?`).all(caseId);
  return rows.map((r) => decryptRow(cfg, r));
}

function createResource(key, caseId, body) {
  const cfg = RESOURCES[key];
  const id = newId();
  const cols = ['id', 'case_id', ...cfg.columns];
  const placeholders = cols.map(() => '?').join(',');
  const values = [id, caseId, ...cfg.columns.map((c) => normalize(body[c], cfg.encryptedColumns.includes(c)))];
  db.prepare(`INSERT INTO ${cfg.table} (${cols.join(',')}) VALUES (${placeholders})`).run(...values);
  return decryptRow(cfg, db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(id));
}

function updateResource(key, caseId, id, body) {
  const cfg = RESOURCES[key];
  const existingRaw = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ? AND case_id = ?`).get(id, caseId);
  if (!existingRaw) return null;
  // Only fields present in `body` are (re-)encrypted; anything falling back
  // to the existing row is already ciphertext on disk and must pass through
  // untouched, or it would be encrypted a second time and become unreadable.
  const values = cfg.columns.map((c) => {
    if (body[c] !== undefined) return normalize(body[c], cfg.encryptedColumns.includes(c));
    return existingRaw[c];
  });
  const setClause = cfg.columns.map((c) => `${c} = ?`).join(', ');
  db.prepare(`UPDATE ${cfg.table} SET ${setClause} WHERE id = ? AND case_id = ?`).run(...values, id, caseId);
  return decryptRow(cfg, db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(id));
}

function deleteResource(key, caseId, id) {
  const cfg = RESOURCES[key];
  const result = db.prepare(`DELETE FROM ${cfg.table} WHERE id = ? AND case_id = ?`).run(id, caseId);
  return result.changes > 0;
}

function normalize(value, shouldEncrypt) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return shouldEncrypt ? encryptString(value) : value;
}

module.exports = { RESOURCES, listResource, createResource, updateResource, deleteResource };
