'use strict';

// Long-running mock SMTP server for manual/integration testing of the app's
// email-sending endpoints against a real running server process (as opposed
// to test/mock-smtp-test.js, which tests mailer.js in isolation within a
// single script). Logs each full message it receives to stdout.

const net = require('net');
const port = Number(process.argv[2]) || 2525;

const server = net.createServer((socket) => {
  let stage = 'greet';
  let dataBuffer = '';
  socket.write('220 mock.smtp greeting\r\n');

  socket.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    if (stage === 'data') {
      dataBuffer += text;
      if (dataBuffer.endsWith('\r\n.\r\n')) {
        console.log('----- MESSAGE RECEIVED -----');
        console.log(dataBuffer.slice(0, -5));
        console.log('----- END MESSAGE -----');
        socket.write('250 OK: message queued\r\n');
        stage = 'post-data';
      }
      return;
    }
    const line = text.trim();
    if (stage === 'greet') {
      socket.write('250-mock.smtp greets you\r\n250 AUTH LOGIN\r\n');
      stage = 'ehlo-done';
    } else if (stage === 'ehlo-done') {
      socket.write('334 VXNlcm5hbWU6\r\n');
      stage = 'auth-user';
    } else if (stage === 'auth-user') {
      socket.write('334 UGFzc3dvcmQ6\r\n');
      stage = 'auth-pass';
    } else if (stage === 'auth-pass') {
      socket.write('235 Authentication successful\r\n');
      stage = 'authed';
    } else if (stage === 'authed') {
      socket.write('250 OK\r\n');
      stage = 'mail-from-done';
    } else if (stage === 'mail-from-done') {
      socket.write('250 OK\r\n');
      stage = 'rcpt-done';
    } else if (stage === 'rcpt-done') {
      socket.write('354 Start mail input\r\n');
      stage = 'data';
    } else if (stage === 'post-data') {
      socket.write('221 Bye\r\n');
      socket.end();
    }
  });
});

server.listen(port, '127.0.0.1', () => console.log(`Mock SMTP server listening on 127.0.0.1:${port}`));
