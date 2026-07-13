'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots-security');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
async function shot(page, name) { await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true }); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGE ERROR: ' + e.message));

  const email = `sectest${Date.now()}@example.com`;
  console.log('Register client...');
  await page.goto('http://localhost:3000/');
  await page.click('#switch-mode');
  await page.fill('#f-name', 'Security Test');
  await page.fill('#f-email', email);
  await page.fill('#f-password', 'password123');
  await page.click('button[type=submit]');
  await page.waitForSelector('.overview-card');

  console.log('Privacy page...');
  await page.click('a[href="#privacy"]');
  await page.waitForSelector('#open-erase-modal');
  await shot(page, '01-privacy-page');

  console.log('Open erase modal (cancel, do not actually delete)...');
  await page.click('#open-erase-modal');
  await page.waitForSelector('.modal-card');
  await shot(page, '02-erase-modal');
  await page.click('#modal-cancel');

  console.log('Admin: login, view case, export/delete buttons, audit log...');
  await page.click('#logout-btn');
  await page.waitForSelector('#auth-form');
  await page.fill('#f-email', 'owner@phoenixinsolvency.co.uk');
  await page.fill('#f-password', 'ownerpass123');
  await page.click('button[type=submit]');
  await page.waitForSelector('.page-title');

  const rows = await page.$$('.admin-case-row');
  if (rows.length) {
    await rows[0].click();
    await page.waitForSelector('#admin-delete-case-btn');
    await shot(page, '03-admin-case-detail-buttons');
  }

  console.log('Activity log...');
  await page.click('a[href="#admin-audit"]');
  await page.waitForSelector('.page-title');
  await shot(page, '04-activity-log');

  console.log('\n--- JS ERRORS ---');
  console.log(errors.length ? errors.join('\n') : 'None');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((err) => { console.error('TEST FAILED:', err); process.exit(1); });
