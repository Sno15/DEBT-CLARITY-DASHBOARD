'use strict';

// Standalone test: spins up a tiny mock SMTP server (plain TCP, no TLS —
// mailer.js is pointed at it with SMTP_SECURE=false) that speaks just enough
// SMTP to exercise mailer.js's full conversation: EHLO / AUTH LOGIN /
// MAIL FROM / RCPT TO / DATA / QUIT, including multi-line reply handling and
// dot-stuffed body parsing. This lets us verify the hand-rolled client works
// correctly without needing real network access to a provider like Brevo
// (which is expected to be blocked in this sandbox).

const net = require('net');

function startMockServer(port) {
  return new Promise((resolve) => {
    const received = { authUser: null, authPass: null, mailFrom: null, rcptTo: null, dataLines: null };
    const server = net.createServer((socket) => {
      let stage = 'greet';
      let dataBuffer = '';
      socket.write('220 mock.smtp greeting\r\n');

      socket.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        if (stage === 'data') {
          dataBuffer += text;
          if (dataBuffer.endsWith('\r\n.\r\n')) {
            received.dataLines = dataBuffer.slice(0, -5); // strip trailing \r\n.\r\n
            socket.write('250 OK: message queued\r\n');
            stage = 'post-data';
          }
          return;
        }

        const line = text.trim();
        if (stage === 'greet') {
          // EHLO
          socket.write('250-mock.smtp greets you\r\n250 AUTH LOGIN\r\n'); // multi-line reply test
          stage = 'ehlo-done';
        } else if (stage === 'ehlo-done') {
          // AUTH LOGIN
          socket.write('334 VXNlcm5hbWU6\r\n');
          stage = 'auth-user';
        } else if (stage === 'auth-user') {
          received.authUser = Buffer.from(line, 'base64').toString('utf8');
          socket.write('334 UGFzc3dvcmQ6\r\n');
          stage = 'auth-pass';
        } else if (stage === 'auth-pass') {
          received.authPass = Buffer.from(line, 'base64').toString('utf8');
          socket.write('235 Authentication successful\r\n');
          stage = 'authed';
        } else if (stage === 'authed') {
          received.mailFrom = line;
          socket.write('250 OK\r\n');
          stage = 'mail-from-done';
        } else if (stage === 'mail-from-done') {
          received.rcptTo = line;
          socket.write('250 OK\r\n');
          stage = 'rcpt-done';
        } else if (stage === 'rcpt-done') {
          // DATA
          socket.write('354 Start mail input\r\n');
          stage = 'data';
        } else if (stage === 'post-data') {
          // QUIT
          socket.write('221 Bye\r\n');
          socket.end();
        }
      });
    });

    server.listen(port, '127.0.0.1', () => resolve({ server, received }));
  });
}

async function main() {
  const port = 2525;
  const { server, received } = await startMockServer(port);

  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_USER = 'testuser@example.com';
  process.env.SMTP_PASS = 'testpass123';
  process.env.MAIL_FROM_ADDRESS = 'no-reply@phoenixinsolvency.co.uk';
  process.env.MAIL_FROM_NAME = 'Phoenix Insolvency';
  process.env.SMTP_SECURE = 'false'; // plain TCP for the mock server

  delete require.cache[require.resolve('../server/mailer')];
  const mailer = require('../server/mailer');

  if (!mailer.isConfigured()) {
    throw new Error('FAIL: isConfigured() should be true once env vars are set');
  }

  const result = await mailer.sendMail({
    toAddress: 'client@example.com',
    toName: 'Jane Client',
    subject: 'Thanks for completing that section',
    text: 'Hi Jane,\n\nJust a quick note to say thanks.\n\n.This line starts with a dot.\nBest wishes,\nThe Team',
  });

  server.close();

  const checks = [];
  const check = (name, cond) => checks.push({ name, pass: !!cond });

  check('sendMail resolved with sent:true', result && result.sent === true);
  check('AUTH LOGIN username decoded correctly', received.authUser === 'testuser@example.com');
  check('AUTH LOGIN password decoded correctly', received.authPass === 'testpass123');
  check('MAIL FROM contains configured from address', received.mailFrom === 'MAIL FROM:<no-reply@phoenixinsolvency.co.uk>');
  check('RCPT TO contains recipient address', received.rcptTo === 'RCPT TO:<client@example.com>');
  check('DATA contains Subject header (base64 encoded)', received.dataLines && received.dataLines.includes('Subject: =?UTF-8?B?'));
  check('DATA contains From header with configured name/address', received.dataLines && received.dataLines.includes('<no-reply@phoenixinsolvency.co.uk>'));
  check('Dot-stuffing applied to body line starting with "."', received.dataLines && received.dataLines.includes('..This line starts with a dot.'));
  check('Body content present', received.dataLines && received.dataLines.includes('Just a quick note to say thanks.'));

  let allPass = true;
  for (const c of checks) {
    console.log(`${c.pass ? 'PASS' : 'FAIL'} - ${c.name}`);
    if (!c.pass) allPass = false;
  }

  // Also test the not-configured fallback path.
  delete process.env.SMTP_HOST;
  delete require.cache[require.resolve('../server/mailer')];
  const mailer2 = require('../server/mailer');
  const fallbackResult = await mailer2.sendMail({ toAddress: 'x@example.com', subject: 'x', text: 'x' });
  const fallbackOk = fallbackResult && fallbackResult.sent === false && fallbackResult.reason === 'not_configured';
  console.log(`${fallbackOk ? 'PASS' : 'FAIL'} - sendMail() no-ops gracefully when SMTP env vars are unset`);
  if (!fallbackOk) allPass = false;

  if (!allPass) {
    console.error('\nSome mailer.js tests FAILED');
    process.exit(1);
  }
  console.log('\nAll mailer.js tests passed.');
}

main().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});
