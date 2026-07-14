'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// Generates a case reference like DC-2026-00847
function generateReference(sequence) {
  const year = new Date().getFullYear();
  const num = String(sequence).padStart(5, '0');
  return `DC-${year}-${num}`;
}

// Reads the full request body into a Buffer.
function readBody(req, maxBytes = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buf = await readBody(req);
  if (buf.length === 0) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new Error('Invalid JSON body');
  }
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthsBetween(startMonth, startYear, endMonth, endYear) {
  const sIdx = MONTHS.indexOf(startMonth);
  const eIdx = MONTHS.indexOf(endMonth);
  if (sIdx === -1 || !startYear || eIdx === -1 || !endYear) return 0;
  return (Number(endYear) - Number(startYear)) * 12 + (eIdx - sIdx);
}

// Escapes text for safe embedding in server-generated HTML (e.g. the
// proposal document) — the underlying data is client-supplied, so this
// prevents a name/address/creditor field containing markup from being
// executed when an adviser opens the generated page.
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  newId,
  sendJson,
  sendError,
  serveStatic,
  generateReference,
  readBody,
  readJsonBody,
  MONTHS,
  monthsBetween,
  escapeHtml,
};
