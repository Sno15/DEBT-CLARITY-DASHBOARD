'use strict';

// A minimal hand-rolled SMTP client — consistent with the rest of this app's
// zero-npm-dependency approach. Speaks plain SMTP (EHLO/AUTH LOGIN/MAIL
// FROM/RCPT TO/DATA) over a TLS socket, which is all a transactional email
// provider's SMTP relay (Brevo, or your own business email's SMTP) needs.
//
// Configure via environment variables:
//   SMTP_HOST            e.g. smtp-relay.brevo.com
//   SMTP_PORT            465 for implicit TLS (recommended/default), or
//                         587 with SMTP_SECURE=false for STARTTLS-style
//                         plain-then-upgrade servers (not implemented here —
//                         use port 465 unless your provider only offers 587).
//   SMTP_USER            SMTP login/username from your provider
//   SMTP_PASS            SMTP password / API key from your provider
//   MAIL_FROM_ADDRESS    the address emails are sent from, e.g.
//                        no-reply@phoenixinsolvency.co.uk (must usually be a
//                        verified sender with your provider)
//   MAIL_FROM_NAME       display name for the From header (defaults to the
//                        firm name)
//   SMTP_SECURE          set to "false" to connect without TLS — only ever
//                        useful for local testing against a mock server,
//                        never for real providers.
//
// If these aren't set, sendMail() just logs and resolves — so the rest of
// the app keeps working normally with emailing simply switched off.

const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const { FIRM_NAME } = require('./firm-config');

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM_ADDRESS);
}

function config() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    fromAddress: process.env.MAIL_FROM_ADDRESS,
    fromName: process.env.MAIL_FROM_NAME || FIRM_NAME,
    secure: process.env.SMTP_SECURE !== 'false',
  };
}

// Builds a simple RFC 5322 plain-text email as a raw string.
function buildMessage({ fromAddress, fromName, toAddress, toName, subject, text }) {
  const messageId = `<${crypto.randomBytes(16).toString('hex')}@debt-clarity>`;
  const encodeHeader = (s) => `=?UTF-8?B?${Buffer.from(String(s), 'utf8').toString('base64')}?=`;
  const headers = [
    `From: ${encodeHeader(fromName)} <${fromAddress}>`,
    `To: ${toName ? `${encodeHeader(toName)} <${toAddress}>` : toAddress}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  // Dot-stuff any line that starts with a bare "." per RFC 5321, since a
  // lone "." on a line is what signals the end of the message body.
  const body = String(text).replace(/\r\n/g, '\n').split('\n').map((line) => (line.startsWith('.') ? `.${line}` : line)).join('\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

// Thin wrapper around a socket that resolves a promise each time a complete
// SMTP reply (one or more lines, the last without a "-" after the code) has
// arrived — e.g. "250-first\r\n250 second\r\n" is one reply.
function createReplyReader(socket) {
  let buffer = '';
  const queue = [];
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let idx;
    while ((idx = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const isFinalLine = /^\d{3} /.test(line) || !/^\d{3}-/.test(line);
      if (!createReplyReader._pending) createReplyReader._pending = '';
      createReplyReader._pending += `${line}\n`;
      if (isFinalLine && queue.length) {
        const resolve = queue.shift();
        resolve(createReplyReader._pending.trim());
        createReplyReader._pending = '';
      }
    }
  });
  return function nextReply() {
    return new Promise((resolve) => queue.push(resolve));
  };
}

function assertCode(reply, expectedPrefixes) {
  const code = reply.slice(0, 3);
  if (!expectedPrefixes.some((p) => code.startsWith(p))) {
    throw new Error(`Unexpected SMTP response (wanted ${expectedPrefixes.join('/')}): ${reply}`);
  }
  return reply;
}

async function sendMail({ toAddress, toName, subject, text }) {
  if (!isConfigured()) {
    console.log(`[mailer] SMTP not configured — skipping email to ${toAddress} ("${subject}")`);
    return { sent: false, reason: 'not_configured' };
  }
  const cfg = config();

  return new Promise((resolve, reject) => {
    const connect = cfg.secure ? tls.connect : net.connect;
    const socket = connect({ host: cfg.host, port: cfg.port, timeout: 15000 });
    let settled = false;
    const fail = (err) => { if (!settled) { settled = true; socket.destroy(); reject(err); } };
    const succeed = (val) => { if (!settled) { settled = true; resolve(val); } };

    socket.on('timeout', () => fail(new Error('SMTP connection timed out')));
    socket.on('error', (err) => fail(err));

    socket.once('secureConnect', run);
    socket.once('connect', () => { if (!cfg.secure) run(); });

    async function run() {
      try {
        const next = createReplyReader(socket);
        assertCode(await next(), ['220']);

        socket.write(`EHLO debt-clarity\r\n`);
        assertCode(await next(), ['250']);

        socket.write('AUTH LOGIN\r\n');
        assertCode(await next(), ['334']);
        socket.write(`${Buffer.from(cfg.user, 'utf8').toString('base64')}\r\n`);
        assertCode(await next(), ['334']);
        socket.write(`${Buffer.from(cfg.pass, 'utf8').toString('base64')}\r\n`);
        assertCode(await next(), ['235']);

        socket.write(`MAIL FROM:<${cfg.fromAddress}>\r\n`);
        assertCode(await next(), ['250']);

        socket.write(`RCPT TO:<${toAddress}>\r\n`);
        assertCode(await next(), ['250', '251']);

        socket.write('DATA\r\n');
        assertCode(await next(), ['354']);

        const message = buildMessage({
          fromAddress: cfg.fromAddress, fromName: cfg.fromName, toAddress, toName, subject, text,
        });
        socket.write(`${message}\r\n.\r\n`);
        assertCode(await next(), ['250']);

        socket.write('QUIT\r\n');
        await next().catch(() => {}); // don't care about the QUIT reply
        socket.end();
        succeed({ sent: true });
      } catch (err) {
        fail(err);
      }
    }
  });
}

module.exports = { sendMail, isConfigured, buildMessage };
