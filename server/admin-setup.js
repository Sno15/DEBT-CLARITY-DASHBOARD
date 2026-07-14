'use strict';

// Shared logic for creating/promoting an advisor (admin) login. Used by both
// the interactive CLI (server/create-admin.js) and, on hosts without shell
// access (like Render's free plan), an automatic startup bootstrap driven by
// the BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD environment
// variables — see maybeBootstrapAdminFromEnv() below, called from app.js.

const path = require('path');
const fs = require('fs');

const db = require('./db');
const { hashPassword } = require('./auth');
const { newId } = require('./util');
const caseData = require('./case-data');
const { UPLOADS_DIR } = require('./paths');

// If this user already has a client case attached (e.g. the email was used
// to test the client sign-up flow before being promoted to admin), remove
// that case and its uploaded files. An admin account should never carry a
// case of its own — otherwise it shows up, confusingly, in that admin's own
// "All Cases" list.
function removeAnyExistingCase(userId) {
  const existingCase = caseData.getCaseByUser(userId);
  if (!existingCase) return null;
  const storedNames = caseData.getStoredDocumentNames(existingCase.id);
  caseData.deleteCaseCompletely(existingCase.id);
  storedNames.forEach((name) => {
    const p = path.join(UPLOADS_DIR, existingCase.id, name);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
  const caseDir = path.join(UPLOADS_DIR, existingCase.id);
  if (fs.existsSync(caseDir)) fs.rmSync(caseDir, { recursive: true, force: true });
  return existingCase.reference;
}

function createOrPromoteAdmin(email, password, name) {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  let removedReference = null;
  let created;

  if (existing) {
    const { hash, salt } = hashPassword(password);
    db.prepare("UPDATE users SET role = 'admin', password_hash = ?, salt = ?, name = COALESCE(?, name) WHERE id = ?")
      .run(hash, salt, name || null, existing.id);
    removedReference = removeAnyExistingCase(existing.id);
    created = false;
  } else {
    const { hash, salt } = hashPassword(password);
    const id = newId();
    db.prepare("INSERT INTO users (id, email, password_hash, salt, name, role, created_at) VALUES (?,?,?,?,?,'admin',?)")
      .run(id, normalizedEmail, hash, salt, name || null, new Date().toISOString());
    created = true;
  }

  return { normalizedEmail, created, removedReference };
}

// Called once at server startup (see app.js). If BOOTSTRAP_ADMIN_EMAIL and
// BOOTSTRAP_ADMIN_PASSWORD are set, ensures that account exists and is an
// admin — re-running this on every startup is deliberate: on hosts with no
// persistent disk (like Render's free plan) the whole database is wiped on
// every restart, so this is what makes sure you can always log back in with
// the same credentials after a restart, even though case data won't survive.
function maybeBootstrapAdminFromEnv() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < 8) {
    console.warn('BOOTSTRAP_ADMIN_PASSWORD is set but shorter than 8 characters — skipping admin bootstrap.');
    return;
  }
  try {
    const result = createOrPromoteAdmin(email, password, process.env.BOOTSTRAP_ADMIN_NAME || null);
    console.log(`Admin bootstrap: ${result.normalizedEmail} is ready to log in (${result.created ? 'created' : 'existing account updated'}).`);
    if (result.removedReference) {
      console.log(`Admin bootstrap: removed a stray client case (${result.removedReference}) that was attached to this account.`);
    }
  } catch (err) {
    console.error('Admin bootstrap failed:', err.message);
  }
}

module.exports = { createOrPromoteAdmin, maybeBootstrapAdminFromEnv };
