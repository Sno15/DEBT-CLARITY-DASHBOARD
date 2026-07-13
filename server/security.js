'use strict';

// Encryption-at-rest, login throttling, and security headers — all built on
// Node's own crypto module (no external dependencies).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./paths');

/* ============================== Encryption-at-rest key ============================== */
// The key can come from an environment variable (recommended for anything
// beyond local testing — see README) or, failing that, a file generated on
// first run. Either way it's a 32-byte AES-256 key, hex-encoded.
const KEY_PATH = path.join(DATA_DIR, 'encryption-key.txt');

function loadOrCreateKey() {
  if (process.env.DEBT_CLARITY_ENCRYPTION_KEY) {
    const fromEnv = process.env.DEBT_CLARITY_ENCRYPTION_KEY.trim();
    if (fromEnv.length === 64) return Buffer.from(fromEnv, 'hex');
    // Allow a passphrase too — stretch it into a proper key.
    return crypto.scryptSync(fromEnv, 'debt-clarity-static-salt', 32);
  }
  if (fs.existsSync(KEY_PATH)) {
    return Buffer.from(fs.readFileSync(KEY_PATH, 'utf8').trim(), 'hex');
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, key.toString('hex'), { mode: 0o600 });
  return key;
}

const ENCRYPTION_KEY = loadOrCreateKey();
const ALGO = 'aes-256-gcm';

// Encrypts a UTF-8 string. Returns a single base64 string encoding
// [iv(12) | authTag(16) | ciphertext], so it drops straight into an existing
// TEXT column with no schema change.
function encryptString(plain) {
  if (plain === null || plain === undefined || plain === '') return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

function decryptString(encoded) {
  if (encoded === null || encoded === undefined || encoded === '') return encoded;
  try {
    const buf = Buffer.from(encoded, 'base64');
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Not encrypted (e.g. legacy plaintext row) — return as-is rather than crash.
    return encoded;
  }
}

// Same idea for whole files (uploaded documents): prepend iv+authTag to the
// encrypted bytes so the file is self-contained on disk.
function encryptBuffer(plainBuf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

function decryptBuffer(encryptedBuf) {
  const iv = encryptedBuf.subarray(0, 12);
  const authTag = encryptedBuf.subarray(12, 28);
  const ciphertext = encryptedBuf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/* ============================== Login throttling ============================== */
// Persisted in the database (not just memory) so a restart doesn't reset an
// in-progress lockout. Table is created in db.js.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginAllowed(db, email) {
  const row = db.prepare('SELECT * FROM login_attempts WHERE email = ?').get(email);
  if (!row) return { allowed: true };
  if (row.locked_until && Date.now() < Date.parse(row.locked_until)) {
    const secondsLeft = Math.ceil((Date.parse(row.locked_until) - Date.now()) / 1000);
    return { allowed: false, secondsLeft };
  }
  return { allowed: true };
}

function recordLoginFailure(db, email) {
  const row = db.prepare('SELECT * FROM login_attempts WHERE email = ?').get(email);
  const failCount = (row ? row.fail_count : 0) + 1;
  const lockedUntil = failCount >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null;
  if (row) {
    db.prepare('UPDATE login_attempts SET fail_count = ?, locked_until = ?, last_attempt_at = ? WHERE email = ?')
      .run(failCount, lockedUntil, new Date().toISOString(), email);
  } else {
    db.prepare('INSERT INTO login_attempts (email, fail_count, locked_until, last_attempt_at) VALUES (?,?,?,?)')
      .run(email, failCount, lockedUntil, new Date().toISOString());
  }
  return { failCount, lockedUntil };
}

function clearLoginFailures(db, email) {
  db.prepare('DELETE FROM login_attempts WHERE email = ?').run(email);
}

/* ============================== Simple per-IP request throttle ============================== */
// Lightweight in-memory bucket to slow down scripted abuse of auth endpoints.
// This resets on restart, which is fine — it's a speed bump, not the primary
// defence (the persisted per-account lockout above is).
const buckets = new Map();

function rateLimit(ip, key, maxRequests, windowMs) {
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  let bucket = buckets.get(bucketKey);
  if (!bucket || now - bucket.windowStart > windowMs) {
    bucket = { windowStart: now, count: 0 };
  }
  bucket.count += 1;
  buckets.set(bucketKey, bucket);
  return bucket.count <= maxRequests;
}

/* ============================== Security headers ============================== */
function applySecurityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
}

function isHttps(req) {
  return req.socket.encrypted === true || req.headers['x-forwarded-proto'] === 'https';
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

/* ============================== File signature validation ============================== */
const SIGNATURES = [
  { mime: 'application/pdf', check: (b) => b.slice(0, 4).toString('latin1') === '%PDF' },
  { mime: 'image/jpeg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', check: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/heic', check: (b) => b.slice(4, 8).toString('latin1') === 'ftyp' },
  { mime: 'image/heif', check: (b) => b.slice(4, 8).toString('latin1') === 'ftyp' },
];

function looksLikeAllowedFile(buf) {
  return SIGNATURES.some((sig) => {
    try { return sig.check(buf); } catch { return false; }
  });
}

module.exports = {
  encryptString, decryptString, encryptBuffer, decryptBuffer,
  checkLoginAllowed, recordLoginFailure, clearLoginFailures,
  rateLimit, applySecurityHeaders, isHttps, clientIp, looksLikeAllowedFile,
  MAX_FAILED_ATTEMPTS, LOCKOUT_MS,
};
