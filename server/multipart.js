'use strict';

// Minimal multipart/form-data parser — no external dependencies.
// Returns { fields: {name: value}, files: [{ fieldName, filename, mimeType, data (Buffer) }] }
function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!match) throw new Error('No multipart boundary found');
  const boundary = '--' + (match[1] || match[2]).trim();
  const boundaryBuf = Buffer.from(boundary);
  const parts = [];

  let start = buffer.indexOf(boundaryBuf);
  while (start !== -1) {
    const next = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (next === -1) break;
    // slice between boundaries, trim leading CRLF and trailing CRLF/--
    let chunk = buffer.slice(start + boundaryBuf.length, next);
    // Remove leading CRLF
    if (chunk[0] === 0x0d && chunk[1] === 0x0a) chunk = chunk.slice(2);
    // Remove trailing CRLF before next boundary
    if (chunk[chunk.length - 2] === 0x0d && chunk[chunk.length - 1] === 0x0a) {
      chunk = chunk.slice(0, chunk.length - 2);
    }
    if (chunk.length > 0) parts.push(chunk);
    start = next;
  }

  const fields = {};
  const files = [];

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headerStr = part.slice(0, headerEnd).toString('utf8');
    const body = part.slice(headerEnd + 4);

    const dispositionMatch = /Content-Disposition:\s*form-data;\s*(.+)/i.exec(headerStr);
    if (!dispositionMatch) continue;
    const dispositionParams = {};
    dispositionMatch[1].split(';').forEach((p) => {
      const m = /\s*([^=]+)="([^"]*)"/.exec(p);
      if (m) dispositionParams[m[1].trim()] = m[2];
    });

    const nameMatch = dispositionParams.name;
    const filenameMatch = dispositionParams.filename;
    const mimeMatch = /Content-Type:\s*(.+)/i.exec(headerStr);

    if (filenameMatch !== undefined) {
      files.push({
        fieldName: nameMatch,
        filename: filenameMatch,
        mimeType: mimeMatch ? mimeMatch[1].trim() : 'application/octet-stream',
        data: body,
      });
    } else if (nameMatch) {
      fields[nameMatch] = body.toString('utf8');
    }
  }

  return { fields, files };
}

module.exports = { parseMultipart };
