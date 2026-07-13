'use strict';

const db = require('./db');
const { newId } = require('./util');

// Records a line in the audit trail. Never throws — a logging failure
// should never take down the request it's describing.
function logEvent({ actorUserId, actorEmail, actorRole, action, caseId, detail, ip }) {
  try {
    db.prepare(`
      INSERT INTO audit_log (id, created_at, actor_user_id, actor_email, actor_role, action, case_id, detail, ip)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(newId(), new Date().toISOString(), actorUserId || null, actorEmail || null, actorRole || null, action, caseId || null, detail || null, ip || null);
  } catch (err) {
    console.error('Failed to write audit log entry:', err.message);
  }
}

function recentEntries(limit = 200) {
  return db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?').all(limit);
}

function entriesForCase(caseId, limit = 200) {
  return db.prepare('SELECT * FROM audit_log WHERE case_id = ? ORDER BY created_at DESC LIMIT ?').all(caseId, limit);
}

module.exports = { logEvent, recentEntries, entriesForCase };
