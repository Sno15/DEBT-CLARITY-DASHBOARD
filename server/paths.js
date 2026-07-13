'use strict';

// Where the app keeps its data on disk. Defaults match plain local use (a
// "data" folder and an "uploads" folder next to the server code) — nothing
// changes for anyone running this on their own PC.
//
// For hosting platforms that attach a single persistent disk at one mount
// path (Render, Railway, etc.), set these two environment variables to two
// subfolders under that same disk, e.g.:
//   DEBT_CLARITY_DATA_DIR=/var/data/appdata
//   DEBT_CLARITY_UPLOADS_DIR=/var/data/uploads
// That way both the database/keys and the uploaded documents live on the
// durable disk instead of the container's throwaway local filesystem.

const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DEBT_CLARITY_DATA_DIR
  ? path.resolve(process.env.DEBT_CLARITY_DATA_DIR)
  : path.join(__dirname, '..', 'data');

const UPLOADS_DIR = process.env.DEBT_CLARITY_UPLOADS_DIR
  ? path.resolve(process.env.DEBT_CLARITY_UPLOADS_DIR)
  : path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

module.exports = { DATA_DIR, UPLOADS_DIR };
