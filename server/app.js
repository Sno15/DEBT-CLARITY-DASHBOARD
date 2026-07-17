'use strict';

const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

const db = require('./db');
const {
  hashPassword, verifyPassword, createSessionCookie, clearSessionCookie, getUserIdFromRequest,
} = require('./auth');
const {
  sendJson, sendError, serveStatic, readJsonBody, readBody, newId, generateReference,
} = require('./util');
const { RESOURCES, listResource, createResource, updateResource, deleteResource } = require('./resources');
const caseData = require('./case-data');
const { parseMultipart } = require('./multipart');
const security = require('./security');
const audit = require('./audit');
const proposal = require('./proposal');
const mailer = require('./mailer');
const emailTemplates = require('./email-templates');
const aiAssistant = require('./ai-assistant');
const { SOLUTIONS } = require(path.join(__dirname, '..', 'public', 'js', 'config.js'));
const { maybeBootstrapAdminFromEnv } = require('./admin-setup');

const PORT = process.env.PORT || 3000;
// Bind to localhost only by default — see README "Network access" section
// before setting HOST=0.0.0.0 to allow other devices on your network in.
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const { UPLOADS_DIR } = require('./paths');

// On hosts with no shell access to run create-admin.js (e.g. Render's free
// plan), setting BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD as
// environment variables gets you an admin login automatically on startup.
maybeBootstrapAdminFromEnv();

function requireAuth(req, res) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    sendError(res, 401, 'Not authenticated');
    return null;
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    sendError(res, 401, 'Not authenticated');
    return null;
  }
  return user;
}

function getOrCreateCaseForUser(user) {
  let kase = caseData.getCaseByUser(user.id);
  if (!kase) {
    const countRow = db.prepare('SELECT COUNT(*) AS c FROM cases').get();
    const id = newId();
    const now = new Date().toISOString();
    const reference = generateReference(countRow.c + 847); // start numbering similar to the mockup
    db.prepare('INSERT INTO cases (id, user_id, reference, created_at, updated_at) VALUES (?,?,?,?,?)')
      .run(id, user.id, reference, now, now);
    kase = caseData.getCaseById(id);
  }
  return kase;
}

// Writes an uploaded file to disk encrypted at rest (AES-256-GCM). See
// server/security.js — the same key also protects the encrypted personal
// data columns in the database.
function saveEncryptedFile(destPath, buffer) {
  fs.writeFileSync(destPath, security.encryptBuffer(buffer));
}

function streamEncryptedFile(res, filePath, mimeType, filename) {
  const encrypted = fs.readFileSync(filePath);
  const plain = security.decryptBuffer(encrypted);
  res.writeHead(200, {
    'Content-Type': mimeType || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
    'Content-Length': plain.length,
  });
  res.end(plain);
}

async function handleApi(req, res, pathname, query, ip) {
  // ---------- Auth ----------
  if (pathname === '/api/register' && req.method === 'POST') {
    if (!security.rateLimit(ip, 'register', 10, 10 * 60 * 1000)) {
      return sendError(res, 429, 'Too many attempts. Please wait a few minutes and try again.');
    }
    const body = await readJsonBody(req);
    const { name, email, password } = body;
    if (!email || !password || password.length < 8) {
      return sendError(res, 400, 'Email and a password of at least 8 characters are required');
    }
    const normalizedEmail = email.toLowerCase().trim();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) return sendError(res, 409, 'An account with that email already exists');
    const { hash, salt } = hashPassword(password);
    const id = newId();
    db.prepare('INSERT INTO users (id, email, password_hash, salt, name, created_at) VALUES (?,?,?,?,?,?)')
      .run(id, normalizedEmail, hash, salt, name || null, new Date().toISOString());
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    getOrCreateCaseForUser(user);
    res.setHeader('Set-Cookie', createSessionCookie(id, security.isHttps(req)));
    audit.logEvent({ actorUserId: id, actorEmail: normalizedEmail, actorRole: 'client', action: 'register', ip });
    return sendJson(res, 200, { ok: true, name: user.name, email: user.email });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    if (!security.rateLimit(ip, 'login', 20, 10 * 60 * 1000)) {
      return sendError(res, 429, 'Too many attempts. Please wait a few minutes and try again.');
    }
    const body = await readJsonBody(req);
    const { email, password } = body;
    const normalizedEmail = (email || '').toLowerCase().trim();

    const lockCheck = security.checkLoginAllowed(db, normalizedEmail);
    if (!lockCheck.allowed) {
      audit.logEvent({ actorEmail: normalizedEmail, action: 'login_blocked_lockout', ip });
      return sendError(res, 429, `Too many failed attempts. Try again in about ${Math.ceil(lockCheck.secondsLeft / 60)} minute(s).`);
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    if (!user || !verifyPassword(password || '', user.salt, user.password_hash)) {
      security.recordLoginFailure(db, normalizedEmail);
      audit.logEvent({ actorEmail: normalizedEmail, action: 'login_failed', ip });
      return sendError(res, 401, 'Incorrect email or password');
    }
    security.clearLoginFailures(db, normalizedEmail);
    res.setHeader('Set-Cookie', createSessionCookie(user.id, security.isHttps(req)));
    audit.logEvent({ actorUserId: user.id, actorEmail: user.email, actorRole: user.role, action: 'login', ip });
    return sendJson(res, 200, { ok: true, name: user.name, email: user.email });
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const userId = getUserIdFromRequest(req);
    if (userId) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (user) audit.logEvent({ actorUserId: user.id, actorEmail: user.email, actorRole: user.role, action: 'logout', ip });
    }
    res.setHeader('Set-Cookie', clearSessionCookie());
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (user.role === 'admin') {
      return sendJson(res, 200, { name: user.name, email: user.email, role: 'admin' });
    }
    const kase = getOrCreateCaseForUser(user);
    return sendJson(res, 200, { name: user.name, email: user.email, role: 'client', caseReference: kase.reference });
  }

  // ---------- Admin (advisor) routes ----------
  if (pathname.startsWith('/api/admin/')) {
    const adminUser = requireAuth(req, res);
    if (!adminUser) return;
    if (adminUser.role !== 'admin') return sendError(res, 403, 'Admin access required');

    if (pathname === '/api/admin/cases' && req.method === 'GET') {
      return sendJson(res, 200, { cases: caseData.listAllCasesForAdmin() });
    }

    if (pathname === '/api/admin/audit-log' && req.method === 'GET') {
      return sendJson(res, 200, { entries: audit.recentEntries(300) });
    }

    const adminCaseMatch = pathname.match(/^\/api\/admin\/cases\/([a-f0-9]+)$/);
    if (adminCaseMatch && req.method === 'GET') {
      const targetCaseId = adminCaseMatch[1];
      if (!caseData.getCaseById(targetCaseId)) return sendError(res, 404, 'Case not found');
      audit.logEvent({ actorUserId: adminUser.id, actorEmail: adminUser.email, actorRole: 'admin', action: 'admin_view_case', caseId: targetCaseId, ip });
      return sendJson(res, 200, caseData.getFullCase(targetCaseId));
    }

    if (adminCaseMatch && req.method === 'DELETE') {
      const targetCaseId = adminCaseMatch[1];
      const owner = caseData.getCaseOwner(targetCaseId);
      if (!owner) return sendError(res, 404, 'Case not found');
      if (owner.role === 'admin') {
        // Safety net: an admin account should never itself own a case (see
        // create-admin.js, which cleans this up at promotion time), but if
        // one is ever found, refuse to delete it via this endpoint rather
        // than risk deleting an advisor's own login by mistake.
        return sendError(res, 400, 'This case belongs to an admin account, not a client — refusing to delete it here to avoid removing an advisor login by mistake. Use server/create-admin.js to clean this up instead.');
      }
      const body = await readJsonBody(req).catch(() => ({}));
      const kase = caseData.getCaseById(targetCaseId);
      if (body.confirmReference !== kase.reference) {
        return sendError(res, 400, 'Type the case reference exactly to confirm permanent deletion.');
      }
      const storedNames = caseData.getStoredDocumentNames(targetCaseId);
      caseData.deleteCaseCompletely(targetCaseId);
      caseData.deleteUserAccount(owner.id);
      storedNames.forEach((name) => {
        const p = path.join(UPLOADS_DIR, targetCaseId, name);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      });
      const caseDir = path.join(UPLOADS_DIR, targetCaseId);
      if (fs.existsSync(caseDir)) fs.rmSync(caseDir, { recursive: true, force: true });
      audit.logEvent({ actorUserId: adminUser.id, actorEmail: adminUser.email, actorRole: 'admin', action: 'admin_erase_case', caseId: targetCaseId, detail: `owner:${owner.email}`, ip });
      return sendJson(res, 200, { ok: true });
    }

    const adminExportMatch = pathname.match(/^\/api\/admin\/cases\/([a-f0-9]+)\/export$/);
    if (adminExportMatch && req.method === 'GET') {
      const targetCaseId = adminExportMatch[1];
      const bundle = caseData.getFullCase(targetCaseId);
      if (!bundle.case) return sendError(res, 404, 'Case not found');
      audit.logEvent({ actorUserId: adminUser.id, actorEmail: adminUser.email, actorRole: 'admin', action: 'admin_export_case', caseId: targetCaseId, ip });
      const body = JSON.stringify(bundle, null, 2);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${bundle.case.reference}.json"`,
      });
      return res.end(body);
    }

    const adminDocMatch = pathname.match(/^\/api\/admin\/cases\/([a-f0-9]+)\/documents\/([a-f0-9]+)\/file$/);
    if (adminDocMatch && req.method === 'GET') {
      const [, targetCaseId, docId] = adminDocMatch;
      const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND case_id = ?').get(docId, targetCaseId);
      if (!doc) return sendError(res, 404, 'Document not found');
      const filePath = path.join(UPLOADS_DIR, targetCaseId, doc.stored_name);
      if (!fs.existsSync(filePath)) return sendError(res, 404, 'File missing on disk');
      audit.logEvent({ actorUserId: adminUser.id, actorEmail: adminUser.email, actorRole: 'admin', action: 'admin_view_document', caseId: targetCaseId, detail: doc.doc_type, ip });
      streamEncryptedFile(res, filePath, doc.mime_type, doc.original_name);
      return;
    }

    if (pathname === '/api/admin/case-statuses' && req.method === 'GET') {
      return sendJson(res, 200, { statuses: caseData.CASE_STATUSES });
    }

    const adminStatusMatch = pathname.match(/^\/api\/admin\/cases\/([a-f0-9]+)\/status$/);
    if (adminStatusMatch && req.method === 'PUT') {
      const targetCaseId = adminStatusMatch[1];
      if (!caseData.getCaseById(targetCaseId)) return sendError(res, 404, 'Case not found');
      const body = await readJsonBody(req).catch(() => ({}));
      let updated;
      try {
        updated = caseData.setCaseStatus(targetCaseId, body.status);
      } catch (err) {
        return sendError(res, 400, err.message);
      }
      audit.logEvent({ actorUserId: adminUser.id, actorEmail: adminUser.email, actorRole: 'admin', action: 'admin_update_status', caseId: targetCaseId, detail: body.status, ip });
      return sendJson(res, 200, { case: updated });
    }

    const adminNotesMatch = pathname.match(/^\/api\/admin\/cases\/([a-f0-9]+)\/notes$/);
    if (adminNotesMatch && req.method === 'GET') {
      const targetCaseId = adminNotesMatch[1];
      if (!caseData.getCaseById(targetCaseId)) return sendError(res, 404, 'Case not found');
      return sendJson(res, 200, { notes: caseData.getCaseNotes(targetCaseId) });
    }

    if (adminNotesMatch && req.method === 'POST') {
      const targetCaseId = adminNotesMatch[1];
      if (!caseData.getCaseById(targetCaseId)) return sendError(res, 404, 'Case not found');
      const body = await readJsonBody(req).catch(() => ({}));
      const text = (body.text || '').trim();
      if (!text) return sendError(res, 400, 'Note text is required');
      if (text.length > 5000) return sendError(res, 400, 'Note is too long (max 5000 characters)');
      const note = caseData.addCaseNote(targetCaseId, adminUser.id, adminUser.name || adminUser.email, text);
      audit.logEvent({ actorUserId: adminUser.id, actorEmail: adminUser.email, actorRole: 'admin', action: 'admin_add_note', caseId: targetCaseId, ip });
      return sendJson(res, 200, { note });
    }

    const adminNoteDeleteMatch = pathname.match(/^\/api\/admin\/cases\/([a-f0-9]+)\/notes\/([a-f0-9]+)$/);
    if (adminNoteDeleteMatch && req.method === 'DELETE') {
      const [, targetCaseId, noteId] = adminNoteDeleteMatch;
      if (!caseData.getCaseById(targetCaseId)) return sendError(res, 404, 'Case not found');
      caseData.deleteCaseNote(noteId);
      audit.logEvent({ actorUserId: adminUser.id, actorEmail: adminUser.email, actorRole: 'admin', action: 'admin_delete_note', caseId: targetCaseId, ip });
      return sendJson(res, 200, { ok: true });
    }

    const adminEmailsMatch = pathname.match(/^\/api\/admin\/cases\/([a-f0-9]+)\/emails$/);
    if (adminEmailsMatch && req.method === 'GET') {
      const targetCaseId = adminEmailsMatch[1];
      if (!caseData.getCaseById(targetCaseId)) return sendError(res, 404, 'Case not found');
      return sendJson(res, 200, { emails: caseData.getCaseEmails(targetCaseId), smtpConfigured: mailer.isConfigured() });
    }

    const adminSendEmailMatch = pathname.match(/^\/api\/admin\/cases\/([a-f0-9]+)\/send-email$/);
    if (adminSendEmailMatch && req.method === 'POST') {
      const targetCaseId = adminSendEmailMatch[1];
      const bundle = caseData.getFullCase(targetCaseId);
      if (!bundle.case) return sendError(res, 404, 'Case not found');
      const body = await readJsonBody(req).catch(() => ({}));
      const templateKey = body.template;
      const templateDef = emailTemplates.TEMPLATES[templateKey];
      if (!templateDef) return sendError(res, 400, 'Unknown email template');
      if (!bundle.owner || !bundle.owner.email) return sendError(res, 400, 'This client has no email address on file');

      const { toAddress, toName, subject, text } = templateDef.build(bundle);
      let sentOk = false;
      let errorMessage = null;
      try {
        const result = await mailer.sendMail({ toAddress, toName, subject, text });
        if (result.sent) {
          sentOk = true;
        } else {
          errorMessage = 'SMTP is not configured on this server yet — see the README for setting up email sending.';
        }
      } catch (err) {
        errorMessage = err.message || 'Failed to send email';
      }

      const logEntry = caseData.logCaseEmail(targetCaseId, {
        template: templateKey, toAddress, subject, sentOk, error: errorMessage, sentByUserId: adminUser.id, sentByName: adminUser.name || adminUser.email,
      });
      audit.logEvent({ actorUserId: adminUser.id, actorEmail: adminUser.email, actorRole: 'admin', action: 'admin_send_email', caseId: targetCaseId, detail: `${templateKey}${sentOk ? '' : ' (failed)'}`, ip });

      if (!sentOk) return sendError(res, 502, errorMessage || 'Could not send email');
      return sendJson(res, 200, { email: logEntry });
    }

    const adminProposalMatch = pathname.match(/^\/api\/admin\/cases\/([a-f0-9]+)\/proposal$/);
    if (adminProposalMatch && req.method === 'GET') {
      const targetCaseId = adminProposalMatch[1];
      const bundle = caseData.getFullCase(targetCaseId);
      if (!bundle.case) return sendError(res, 404, 'Case not found');
      audit.logEvent({ actorUserId: adminUser.id, actorEmail: adminUser.email, actorRole: 'admin', action: 'admin_generate_proposal', caseId: targetCaseId, ip });
      const html = proposal.generateProposalHtml(bundle);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    return sendError(res, 404, 'Not found');
  }

  // Everything below is a client route and requires a non-admin account
  const user = requireAuth(req, res);
  if (!user) return;
  if (user.role === 'admin') return sendError(res, 403, 'Admin accounts do not have a client case. Use /api/admin/* routes.');
  const kase = getOrCreateCaseForUser(user);
  const caseId = kase.id;

  if (pathname === '/api/case' && req.method === 'GET') {
    return sendJson(res, 200, caseData.getFullCase(caseId));
  }

  // ---------- GDPR self-service ----------
  if (pathname === '/api/case/export' && req.method === 'GET') {
    const bundle = caseData.getFullCase(caseId);
    audit.logEvent({ actorUserId: user.id, actorEmail: user.email, actorRole: 'client', action: 'self_export', caseId, ip });
    const body = JSON.stringify(bundle, null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${kase.reference}-my-data.json"`,
    });
    return res.end(body);
  }

  if (pathname === '/api/case/erase' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (!verifyPassword(body.password || '', user.salt, user.password_hash)) {
      return sendError(res, 401, 'Incorrect password. Enter your current password to confirm account deletion.');
    }
    const storedNames = caseData.getStoredDocumentNames(caseId);
    caseData.deleteCaseCompletely(caseId);
    caseData.deleteUserAccount(user.id);
    storedNames.forEach((name) => {
      const p = path.join(UPLOADS_DIR, caseId, name);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
    const caseDir = path.join(UPLOADS_DIR, caseId);
    if (fs.existsSync(caseDir)) fs.rmSync(caseDir, { recursive: true, force: true });
    audit.logEvent({ actorEmail: user.email, actorRole: 'client', action: 'self_erase', caseId, ip });
    res.setHeader('Set-Cookie', clearSessionCookie());
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/case/personal' && req.method === 'PUT') {
    const body = await readJsonBody(req);
    const personal = caseData.upsertPersonal(caseId, body);
    audit.logEvent({ actorUserId: user.id, actorEmail: user.email, actorRole: 'client', action: 'update_personal', caseId, ip });
    return sendJson(res, 200, { personal, completion: caseData.computeCompletion(caseId) });
  }

  if (pathname === '/api/case/flags' && req.method === 'PUT') {
    const body = await readJsonBody(req);
    const flags = caseData.setFlags(caseId, body);
    return sendJson(res, 200, { flags, completion: caseData.computeCompletion(caseId) });
  }

  if (pathname === '/api/case/income-expenditure' && req.method === 'PUT') {
    const body = await readJsonBody(req);
    const result = caseData.setIncomeExpenditure(caseId, body.incomeData, body.expenditureData);
    return sendJson(res, 200, { ...result, completion: caseData.computeCompletion(caseId) });
  }

  if (pathname === '/api/case/solution' && req.method === 'PUT') {
    const body = await readJsonBody(req);
    const solution = caseData.setSolution(caseId, body.solutionType);
    audit.logEvent({ actorUserId: user.id, actorEmail: user.email, actorRole: 'client', action: 'choose_solution', caseId, detail: body.solutionType, ip });
    return sendJson(res, 200, { solution, completion: caseData.computeCompletion(caseId) });
  }

  // ---------- Client assistant (chatbot) ----------
  if (pathname === '/api/case/assistant' && req.method === 'POST') {
    if (!security.rateLimit(ip, 'assistant', 30, 10 * 60 * 1000)) {
      return sendError(res, 429, 'Too many messages — please wait a few minutes and try again.');
    }
    const body = await readJsonBody(req);
    const message = (body.message || '').trim();
    if (!message) return sendError(res, 400, 'Message is required');
    if (message.length > 2000) return sendError(res, 400, 'Message is too long (max 2000 characters)');
    const history = Array.isArray(body.history) ? body.history.slice(-20) : [];

    const bundle = caseData.getFullCase(caseId);
    const solutionChosen = bundle.solution
      ? (SOLUTIONS.find((s) => s.key === bundle.solution.solutionType) || {}).name || bundle.solution.solutionType
      : null;

    let result;
    try {
      result = await aiAssistant.askAssistant({
        message,
        history,
        context: {
          firstName: (bundle.personal && bundle.personal.first_name) || null,
          missingSections: emailTemplates.incompleteSectionLabels(bundle),
          solutionChosen,
          missingDocs: emailTemplates.missingDocumentLabels(bundle),
        },
      });
    } catch (err) {
      audit.logEvent({ actorUserId: user.id, actorEmail: user.email, actorRole: 'client', action: 'assistant_error', caseId, detail: err.message, ip });
      return sendError(res, 502, 'The assistant is temporarily unavailable — please try again shortly, or contact your adviser.');
    }

    if (result.flagged) {
      caseData.addCaseNote(caseId, null, 'Client Assistant', `Client asked something worth following up on (${result.flagTopic}): "${message}"`);
    }
    audit.logEvent({ actorUserId: user.id, actorEmail: user.email, actorRole: 'client', action: 'assistant_message', caseId, detail: result.flagged ? `flagged: ${result.flagTopic}` : 'ok', ip });
    return sendJson(res, 200, { reply: result.reply, flagged: result.flagged });
  }

  // ---------- Documents ----------
  if (pathname === '/api/case/documents' && req.method === 'GET') {
    return sendJson(res, 200, { documents: caseData.getDocuments(caseId) });
  }

  if (pathname === '/api/case/documents' && req.method === 'POST') {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return sendError(res, 400, 'Expected multipart/form-data upload');
    }
    const buf = await readBody(req);
    const { fields, files } = parseMultipart(buf, contentType);
    const docType = fields.doc_type;
    if (!docType) return sendError(res, 400, 'Missing doc_type field');
    if (!files.length) return sendError(res, 400, 'No file uploaded');
    const file = files[0];
    if (!security.looksLikeAllowedFile(file.data)) {
      return sendError(res, 400, 'That file doesn\'t look like a PDF, JPG, PNG or HEIC image. Please check the file and try again.');
    }
    const caseDir = path.join(UPLOADS_DIR, caseId);
    if (!fs.existsSync(caseDir)) fs.mkdirSync(caseDir, { recursive: true });
    const id = newId();
    const ext = path.extname(file.filename) || '';
    const storedName = `${id}${ext}`;
    saveEncryptedFile(path.join(caseDir, storedName), file.data);
    db.prepare('INSERT INTO documents (id, case_id, doc_type, original_name, stored_name, mime_type, size, uploaded_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, caseId, docType, file.filename, storedName, file.mimeType, file.data.length, new Date().toISOString());
    audit.logEvent({ actorUserId: user.id, actorEmail: user.email, actorRole: 'client', action: 'upload_document', caseId, detail: docType, ip });
    return sendJson(res, 200, { document: db.prepare('SELECT id, doc_type, original_name, mime_type, size, uploaded_at FROM documents WHERE id = ?').get(id), completion: caseData.computeCompletion(caseId) });
  }

  const docFileMatch = pathname.match(/^\/api\/case\/documents\/([a-f0-9]+)\/file$/);
  if (docFileMatch && req.method === 'GET') {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND case_id = ?').get(docFileMatch[1], caseId);
    if (!doc) return sendError(res, 404, 'Document not found');
    const filePath = path.join(UPLOADS_DIR, caseId, doc.stored_name);
    if (!fs.existsSync(filePath)) return sendError(res, 404, 'File missing on disk');
    streamEncryptedFile(res, filePath, doc.mime_type, doc.original_name);
    return;
  }

  const docDeleteMatch = pathname.match(/^\/api\/case\/documents\/([a-f0-9]+)$/);
  if (docDeleteMatch && req.method === 'DELETE') {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND case_id = ?').get(docDeleteMatch[1], caseId);
    if (!doc) return sendError(res, 404, 'Document not found');
    const filePath = path.join(UPLOADS_DIR, caseId, doc.stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
    audit.logEvent({ actorUserId: user.id, actorEmail: user.email, actorRole: 'client', action: 'delete_document', caseId, detail: doc.doc_type, ip });
    return sendJson(res, 200, { ok: true, completion: caseData.computeCompletion(caseId) });
  }

  // ---------- Generic list resources ----------
  const resourceMatch = pathname.match(/^\/api\/case\/([a-z-]+)(?:\/([a-f0-9]+))?$/);
  if (resourceMatch) {
    const [, resourceKey, itemId] = resourceMatch;
    if (RESOURCES[resourceKey]) {
      if (req.method === 'GET' && !itemId) {
        return sendJson(res, 200, { items: listResource(resourceKey, caseId) });
      }
      if (req.method === 'POST' && !itemId) {
        const body = await readJsonBody(req);
        const item = createResource(resourceKey, caseId, body);
        return sendJson(res, 200, { item, completion: caseData.computeCompletion(caseId) });
      }
      if (req.method === 'PUT' && itemId) {
        const body = await readJsonBody(req);
        const item = updateResource(resourceKey, caseId, itemId, body);
        if (!item) return sendError(res, 404, 'Not found');
        return sendJson(res, 200, { item, completion: caseData.computeCompletion(caseId) });
      }
      if (req.method === 'DELETE' && itemId) {
        const ok = deleteResource(resourceKey, caseId, itemId);
        if (!ok) return sendError(res, 404, 'Not found');
        return sendJson(res, 200, { ok: true, completion: caseData.computeCompletion(caseId) });
      }
    }
  }

  return sendError(res, 404, 'Not found');
}

const server = http.createServer(async (req, res) => {
  try {
    security.applySecurityHeaders(req, res);
    const ip = security.clientIp(req);
    const parsed = url.parse(req.url, true);
    const pathname = decodeURIComponent(parsed.pathname);

    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, parsed.query, ip);
      return;
    }

    // Static assets
    if (pathname.startsWith('/css/') || pathname.startsWith('/js/') || pathname.startsWith('/img/')) {
      const filePath = path.join(PUBLIC_DIR, pathname);
      if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath)) {
        return serveStatic(res, filePath);
      }
      res.writeHead(404);
      return res.end('Not found');
    }

    // SPA fallback: always serve index.html for any other GET route
    return serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendError(res, 500, err.message || 'Internal server error');
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Debt Clarity running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (HOST === '0.0.0.0') {
    console.log('WARNING: HOST=0.0.0.0 — this app is reachable from other devices on your network. Make sure that is intentional.');
  }
});
