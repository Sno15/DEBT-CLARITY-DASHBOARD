'use strict';

// One-off CLI helper to create (or promote) an advisor/owner login.
//
// Just run it with no arguments and answer the questions:
//   node server/create-admin.js
//
// Or, if you prefer, pass everything on one line:
//   node server/create-admin.js you@example.com yourPassword123 "Your Name"
//
// Admin accounts do NOT get a client case — they log in to a separate
// "All Cases" view that lists every client case in the system. If you
// promote an email address that was already used to sign up as a client,
// any existing case under that account is removed as part of the
// promotion (see removeAnyExistingCase below) — an admin account should
// never itself appear in the case list.

const path = require('path');
const fs = require('fs');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

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

  if (existing) {
    const { hash, salt } = hashPassword(password);
    db.prepare("UPDATE users SET role = 'admin', password_hash = ?, salt = ?, name = COALESCE(?, name) WHERE id = ?")
      .run(hash, salt, name || null, existing.id);
    console.log(`\nExisting account ${normalizedEmail} has been promoted to admin and its password updated.`);
    const removedReference = removeAnyExistingCase(existing.id);
    if (removedReference) {
      console.log(`Note: this email had a client case attached (${removedReference}) from before — that test case and any documents on it have been removed, since admin accounts don't carry a case of their own.`);
    }
  } else {
    const { hash, salt } = hashPassword(password);
    const id = newId();
    db.prepare("INSERT INTO users (id, email, password_hash, salt, name, role, created_at) VALUES (?,?,?,?,?,'admin',?)")
      .run(id, normalizedEmail, hash, salt, name || null, new Date().toISOString());
    console.log(`\nAdmin account created for ${normalizedEmail}.`);
  }

  console.log('You can now log in at http://localhost:3000 with this email and password to see the "All Cases" admin view.');
}

async function runInteractive() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log("Let's set up your advisor login. This only needs to be done once.\n");
  console.log('(Heads up: what you type here — including the password — will be visible on screen. That\'s normal for a one-off setup command like this, just make sure nobody\'s reading over your shoulder.)\n');
  console.log('Tip: use an email address you have NOT already used to test the client sign-up/dashboard with — a fresh one keeps things simplest.\n');

  let email = '';
  while (!email.includes('@')) {
    email = (await rl.question('Your email address: ')).trim();
    if (!email.includes('@')) console.log('That doesn\'t look like a valid email — try again.');
  }

  const name = (await rl.question('Your name (optional, press Enter to skip): ')).trim();

  let password = '';
  while (password.length < 8) {
    password = await rl.question('Choose a password (at least 8 characters): ');
    if (password.length < 8) console.log('That\'s too short — needs to be at least 8 characters.');
  }

  let confirm = '';
  while (confirm !== password) {
    confirm = await rl.question('Type the same password again to confirm: ');
    if (confirm !== password) console.log('Those don\'t match — let\'s try the confirmation again.');
  }

  rl.close();
  createOrPromoteAdmin(email, password, name || null);
}

const [, , argEmail, argPassword, argName] = process.argv;

if (argEmail && argPassword) {
  if (argPassword.length < 8) {
    console.log('Password must be at least 8 characters.');
    process.exit(1);
  }
  createOrPromoteAdmin(argEmail, argPassword, argName);
} else if (argEmail || argPassword) {
  console.log('Usage: node server/create-admin.js <email> <password> ["Full name"]');
  console.log('...or just run "node server/create-admin.js" with nothing after it to be asked the questions one at a time.');
  process.exit(1);
} else {
  runInteractive().catch((err) => {
    console.error('\nSomething went wrong:', err);
    process.exit(1);
  });
}
