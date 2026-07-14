# Debt Clarity

A self-service client intake dashboard for IVA / debt solution casework. Clients log in,
work through their personal, financial and asset information stage by stage, choose a
debt solution, and upload the supporting documents — everything is saved to a real
database as they go.

## What's included

- **Stage 1 — Your Information**: Personal details, Address (with 5-year address
  history tracking), Employment (with years-covered tracking), Dependants, Income &
  Expenditure (with live totals), Creditors, Property, Vehicles, Bank Accounts,
  Insurance, Assets.
- **Stage 2 — Your Solution**: a solution-selection screen (IVA, DMP, DRO, Bankruptcy).
- **Stage 3 — Documents**: required-document upload (Photo ID, bank statements, mobile
  bills) with drag-and-drop, stored on disk against the case.
- An overview page that tracks completion of all three stages, matching the flow you
  provided screenshots of.
- Email/password accounts, one case per account, with real persistence — refreshing or
  closing the browser doesn't lose anything.
- **An admin/advisor view** — a separate login that shows every client's case in one
  list (name, email, reference, how far along each stage is) and lets you click into
  any case to see all the details they've entered plus their uploaded documents. See
  "Setting up your own advisor login" below.
- **Case workflow status** — advisers can move a case through internal stages (New
  Lead, Awaiting Documents, Under Review, Submitted to Creditors, Live/Active,
  Completed, Failed/Terminated) from a dropdown on the case page. This is
  adviser-only and never shown to the client.
- **Case notes** — a private, encrypted notes thread on each case for advisers to
  leave context for one another. Never visible to, or exported for, the client.
- **Draft Case Summary / proposal generator** — a "Case Summary" button on each case
  produces a printable document compiling everything the client has entered
  (statement of affairs, creditor schedule, assets, chosen solution) as a starting
  point for a formal proposal. It's explicitly a draft compilation aid, not a
  submission-ready legal document — see the disclaimer built into the document
  itself.
- **Client communication (manual)** — a "Client Communication" section on each case
  lets an adviser send a calm, low-pressure thank-you email or a "keep going"
  reminder email to the client with one click. Nothing is ever sent automatically or
  on a schedule — every email is a deliberate choice by an adviser, and every attempt
  (sent or failed) is logged on the case. See "Setting up email sending" below.

## Setting up your own advisor login

Regular sign-up always creates a client account (someone filling in their own case).
To see the "All Cases" admin view, you need a separate advisor account, created once
from the command line so random visitors can't grant themselves admin access.

The easiest way — just run it with nothing after it, and answer the questions it asks:

```bash
node server/create-admin.js
```

Or, if you prefer to do it in one line: `node server/create-admin.js you@yourcompany.com
yourPassword123 "Your Name"`.

Run it once (with the server stopped or running, it doesn't matter), then log in at
`http://localhost:3000` with that email and password. You'll land on "All Cases"
instead of a client dashboard. You can run the same command again later with a
different email to create more advisor logins, or with an existing client's email to
promote them to admin instead (not usually what you want, but the option's there).

## Setting up email sending (Brevo)

The "Send thank-you email" and "Send reminder to continue" buttons on a case page
need somewhere to actually send email through. Without this set up, the buttons still
work but will show a clear "not set up yet" message instead of sending anything — so
it's safe to skip this section entirely if you don't need email yet.

**Brevo** is recommended: it's free for up to 300 emails/day (9,000/month), which is
comfortably enough for this kind of use, and doesn't require a credit card to start.

**1. Create a Brevo account and verify a sender**:
- Sign up at brevo.com (the free plan is fine).
- Go to **Senders, Domains & Dedicated IPs** → **Senders**, and add the email address
  you want client emails to appear to come from (e.g.
  `no-reply@phoenixinsolvency.co.uk`, or your own business email address). Brevo will
  send a verification email to that address — click the link in it to confirm you own
  it. Until this step is done, Brevo will refuse to send anything from that address.

**2. Get your SMTP credentials**:
- In Brevo, go to **SMTP & API** (usually under your account/settings menu). You'll
  see an **SMTP** tab with a host (`smtp-relay.brevo.com`), a port, and an **SMTP
  login** (usually your Brevo account email). If you don't already have an **SMTP
  key/password** listed, click to generate one — this is different from your normal
  Brevo login password, so keep a copy of it somewhere safe (like a password manager)
  as it's shown in full only once.

**3. Add the environment variables**:

On Render, add these on the service's **Environment** tab (the `render.yaml` in this
project already lists them, so a Blueprint deploy will prompt you to fill in the ones
marked "sync: false"):

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=465
SMTP_USER=<your Brevo SMTP login>
SMTP_PASS=<your Brevo SMTP key>
MAIL_FROM_ADDRESS=<the address you verified in step 1>
MAIL_FROM_NAME=Phoenix Insolvency
```

Running locally instead, set the same variables before starting the app, e.g. on
Windows PowerShell:

```powershell
$env:SMTP_HOST="smtp-relay.brevo.com"; $env:SMTP_PORT="465"; $env:SMTP_USER="..."; $env:SMTP_PASS="..."; $env:MAIL_FROM_ADDRESS="..."; node server/app.js
```

Once these are set (and the server restarted, if it was already running), the two
buttons on a case's page will send real emails and log the result underneath. If
something's wrong (wrong password, unverified sender, etc.) the attempt will fail with
a clear error message shown right there, and it's recorded in the case's email history
so you can see exactly what happened and when.

## Tech choices — and why there are zero npm dependencies

This was built in a sandboxed environment with no access to the npm registry, so
instead of Next.js/Express/Prisma it uses **only Node.js's own built-in modules**:

- `node:http` for the web server and routing
- `node:sqlite` (built into Node 22.5+) for the database — a real SQL database, no
  separate server to install
- `node:crypto` for password hashing (scrypt) and signed session cookies
- A small hand-written multipart parser for file uploads

The upside: there is nothing to `npm install`. You can copy this folder to any server
with Node 22.5 or newer and run it immediately. If you'd later like to move this onto a
more conventional stack (Next.js, Postgres, S3 for file storage, etc.) the data model in
`server/db.js` and the API in `server/app.js` are deliberately simple to port.

## Running it

```bash
node server/app.js
```

Then open **http://localhost:3000** (set the `PORT` environment variable to use a
different port). On first run it creates:

- `data/debtclarity.sqlite` — the database
- `data/session-secret.txt` — a generated secret used to sign login sessions
- `data/encryption-key.txt` — the key used to encrypt sensitive fields and documents
  at rest (see "Security" below — **back this up separately from the database**, and
  read the note on where to store it for anything beyond local testing)
- `uploads/` — uploaded documents (encrypted), one subfolder per case

All four are created automatically. Deleting `debtclarity.sqlite` and `uploads/`
resets the app to a blank state. **Never delete `encryption-key.txt` while
`debtclarity.sqlite` or any files in `uploads/` still exist and matter** — without it,
the encrypted fields and documents cannot be decrypted, by anyone, including you.

### Network access

By default the server only accepts connections from the same computer it's running on
(`127.0.0.1`) — nothing else on your network can reach it. If you deliberately want
other devices on your office network to reach it (e.g. a second advisor's PC), start it
with `HOST=0.0.0.0 node server/app.js` instead — but do this only behind HTTPS (see
below), since without it, login credentials and every field of client data would travel
across your network unencrypted.

### Requirements

- Node.js **22.5 or later** (for `node:sqlite`). Check with `node -v`.

### Deploying to Render so clients can reach it from anywhere

Running it on your own PC only ever works for you, on that PC — `localhost` isn't
reachable from anywhere else. To let clients sign up from their own devices, this needs
to run on a real server somewhere, reachable over the internet with HTTPS. Render
(render.com) is one straightforward option that doesn't require managing a server
yourself; a `render.yaml` file is already included in this project describing how it
should be deployed there.

**1. Get the code onto GitHub** (no command line needed):
- Create a free account at github.com if you don't have one.
- Create a new repository (private is fine — it only holds code, never client data).
- On the new repository's page, use "Add file" → "Upload files" and drag in everything
  from this project folder, then commit.

**2. Create a Render account and deploy**:
- Sign up at render.com (you can sign up directly with your GitHub account, which
  also connects the two automatically).
- Click "New +" → "Blueprint", and pick the repository you just created. Render will
  detect `render.yaml` and show you the service it's about to create.
- It'll ask you to fill in one value it deliberately doesn't store in the code:
  `DEBT_CLARITY_ENCRYPTION_KEY`. Paste in a random 64-character value here — this is
  the key that protects sensitive fields and documents at rest, so treat it like a
  password (store a copy somewhere safe, like a password manager).
- Click Apply/Deploy. After a minute or two you'll get a working address like
  `https://debt-clarity-xxxx.onrender.com`.

**Free plan, for testing only**: the free plan Render offers has no persistent disk,
so the database and any uploaded documents are wiped every time the service restarts,
redeploys, or wakes back up after being idle — it's genuinely only good for checking
that the deployment itself works, not for anything (including test data) you want to
keep. It also "sleeps" after ~15 minutes of no traffic and takes 30-60 seconds to wake
back up on the next visit.

**When you're ready for real use**: upgrade the service to a paid plan (Starter, about
$7/month) and add a persistent disk (about $0.25/GB/month) — Render's dashboard has an
"Add Disk" option under the service's settings. Mount it at `/var/data`, then set two
extra environment variables so the app stores its data there instead of the
container's throwaway filesystem:

```
DEBT_CLARITY_DATA_DIR=/var/data/appdata
DEBT_CLARITY_UPLOADS_DIR=/var/data/uploads
```

(The commented-out block at the bottom of `render.yaml` shows this same configuration,
if you'd rather set it there than in the dashboard.) From that point on, data survives
restarts and redeploys normally, the same as it does on your own PC today.

### Keeping it running

For a simple always-on deployment, run it under a process manager, e.g.:

```bash
npm install -g pm2   # or your preferred process manager
pm2 start server/app.js --name debt-clarity
```

Or as a systemd service, Docker container, etc. — since there are no dependencies to
install, a Dockerfile can be as simple as `FROM node:22` + `COPY . .` + `CMD ["node",
"server/app.js"]`.

## Project layout

```
server/
  app.js            — HTTP server, routing, all API endpoints
  db.js             — SQLite schema/setup
  auth.js           — password hashing + signed session cookies
  security.js       — encryption at rest, login lockout, rate limiting, security headers
  audit.js          — writes/reads the audit trail (audit_log table)
  multipart.js      — file upload parsing
  resources.js      — generic CRUD for list-style data (creditors, vehicles, etc.)
  case-data.js      — case data access + completion/progress calculations
  create-admin.js   — CLI script to create/promote an advisor login
  admin-setup.js    — shared admin-account logic + env-var bootstrap for hosts with
                       no shell access (e.g. Render's free plan)
  proposal.js        — generates the printable "Draft Case Summary" document
  mailer.js           — hand-rolled SMTP client used to actually send emails
  email-templates.js  — copy for the thank-you/reminder emails
  firm-config.js       — shared firm display name (used by proposal.js and mailer.js)
public/
  index.html        — single HTML shell
  css/styles.css    — all styling
  js/config.js      — field/option definitions (easy to extend)
  js/app.js         — the whole front-end app (client + admin views, routing, API calls)
test/
  e2e.js               — Playwright walkthrough of the full client flow
  e2e-admin.js         — Playwright walkthrough of the admin/advisor view
  e2e-security-ui.js   — Playwright walkthrough of Privacy/Data and admin export/delete/audit log
  e2e-comms.js         — Playwright walkthrough of the manual email-sending buttons
  mock-smtp-test.js    — unit test for mailer.js's SMTP conversation, no real network needed
  mock-smtp-server.js  — a throwaway local SMTP server for manual testing
```

## Extending it

- **Add a field**: most sections are driven by config objects (`RESOURCE_CONFIGS` in
  `public/js/app.js`, `INCOME_GROUPS`/`EXPENDITURE_GROUPS` in `public/js/config.js`).
  Add an entry there and to the matching table in `server/db.js` /
  `server/resources.js`.
- **Real postcode lookup**: the "Find address" button currently shows a message
  explaining manual entry is needed, since this environment has no external network
  access. Wiring it up to a postcode API (e.g. getAddress.io, Ideal Postcodes) is a
  drop-in change in `wireRouteEvents()` in `public/js/app.js`.

## Security

This section is written for the FCA/GDPR context this app is intended for. It
describes what's implemented and, honestly, what's still your responsibility as the
business running it. **None of this is legal advice** — whether your overall setup
satisfies GDPR and FCA requirements is ultimately a judgement about your organisation's
processes as a whole (data protection impact assessment, retention policy, staff
training, breach response plan, and so on), not just this code. Please get a proper
compliance/legal review before relying on this for real client data.

### What's implemented

- **Passwords**: hashed with scrypt and a unique salt per user — never stored or
  logged in plain text.
- **Sessions**: signed, HttpOnly cookies (`SameSite=Lax`); the `Secure` flag is added
  automatically once you're running behind HTTPS.
- **Encryption at rest**: the most sensitive fields — National Insurance number, date
  of birth, phone numbers, address lines, and bank sort code/account number — are
  encrypted (AES-256-GCM) before being written to the database, and decrypted only when
  read back out through the API. Uploaded documents (photo ID, bank statements, etc.)
  are encrypted whole on disk the same way. The encryption key lives in
  `data/encryption-key.txt` by default; for anything beyond local testing, set the
  `DEBT_CLARITY_ENCRYPTION_KEY` environment variable instead (a random 64-character hex
  string, or any passphrase) so the key isn't sitting in the same folder as the data it
  protects — a password manager or your hosting provider's secrets store are good places
  to keep it.
- **Login protection**: after 5 failed attempts for an email address, that account is
  locked for 15 minutes (persisted in the database, so a restart doesn't reset it).
  There's also a basic per-IP rate limit on the login/register endpoints to slow down
  scripted abuse.
- **File upload validation**: uploaded files are checked against known PDF/JPEG/PNG/HEIC
  byte signatures, not just their claimed file extension, before being accepted.
- **Network exposure**: the server only listens on `127.0.0.1` unless you explicitly
  opt into wider access (see "Network access" above).
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`,
  `Content-Security-Policy`, `Referrer-Policy`, and `Strict-Transport-Security` (once
  on HTTPS) are set on every response.
- **Audit trail**: every login, failed login, document view/upload/delete, personal
  data change, solution choice, and every admin action (viewing, exporting, or deleting
  a case) is recorded with a timestamp, actor, and IP address. Advisors can see this
  under "Activity Log" in the admin view — useful evidence for demonstrating access
  control if the FCA or ICO ever asks.
- **GDPR self-service tools**: clients have a "Privacy & Data" page to download
  everything held about them (JSON) or permanently delete their account and all
  associated data (requires typing DELETE and their password, to prevent accidental
  clicks). Advisors have equivalent "Export" and "Delete case" actions on each case,
  for handling subject access/erasure requests that come to the firm directly.
- **Per-account data isolation**: verified directly — one client's data is never
  visible to another; only accounts with the `admin` role (created via
  `create-admin.js`, never through public sign-up) can see the case list.

### What's still on you

- **Whole-device encryption**: field/document-level encryption above protects against a
  copied database file or documents folder being readable without the key, but it does
  not replace full-disk encryption. If this runs on a laptop, turn on **BitLocker**
  (Windows) so a lost or stolen device doesn't expose anything left unencrypted (logs,
  temp files, the encryption key itself if you left it in the default location).
- **HTTPS**: there is no TLS built into the app itself. If this is ever reachable
  from anywhere other than `localhost` on your own machine, put a reverse proxy (e.g.
  Caddy, nginx, or a cloud load balancer) in front of it with a real TLS certificate.
  Caddy in particular can get you a free auto-renewing certificate with about 3 lines
  of config.
- **Backups**: back up `data/debtclarity.sqlite`, `data/encryption-key.txt`, and
  `uploads/` together, regularly, to a separate location — and test that a restore
  actually works. Losing the encryption key without a backup of the database is
  equivalent to losing the database.
- **Data retention policy**: nothing automatically deletes old or withdrawn cases.
  GDPR expects data to be kept only as long as necessary — you (or your compliance
  process) need to decide a retention period and periodically use the admin "Delete
  case" action (or a bespoke script) to remove cases past it.
- **Records of processing / DPIA / privacy notice**: these are organisational
  documents, not code — the ICO's website has templates and guidance for a Data
  Protection Impact Assessment, which is generally expected for processing this category
  of financial and identity data at scale.
- **Two-factor authentication, IP allow-listing, and a formal incident response plan**
  are common next steps for regulated firms but aren't implemented here.
