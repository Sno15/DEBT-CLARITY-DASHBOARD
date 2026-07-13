'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./paths');

// Persistent secret for signing session cookies. Generated once and stored
// on disk so sessions survive server restarts.
const SECRET_PATH = path.join(DATA_DIR, 'session-secret.txt');
let SECRET;
if (fs.existsSync(SECRET_PATH)) {
  SECRET = fs.readFileSync(SECRET_PATH, 'utf8').trim();
} else {
  SECRET = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_PATH, SECRET, { mode: 0o600 });
}

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function sign(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function unsign(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}

function createSessionCookie(userId, secure) {
  const token = sign({ uid: userId, exp: Date.now() + SESSION_MAX_AGE_MS });
  const maxAgeSec = Math.floor(SESSION_MAX_AGE_MS / 1000);
  return `dc_session=${token}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function clearSessionCookie() {
  return 'dc_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax';
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

function getUserIdFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.dc_session;
  const payload = unsign(token);
  return payload ? payload.uid : null;
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSessionCookie,
  clearSessionCookie,
  parseCookies,
  getUserIdFromRequest,
};
