'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots-admin');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
async function shot(page, name) { await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true }); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGE ERROR: ' + e.message));

  console.log('Log in as admin...');
  await page.goto('http://localhost:3000/');
  await page.fill('#f-email', 'owner@phoenixinsolvency.co.uk');
  await page.fill('#f-password', 'ownerpass123');
  await page.click('button[type=submit]');
  await page.waitForSelector('.page-title', { timeout: 5000 });
  await shot(page, '01-all-cases-list');

  console.log('Open a client case...');
  const rows = await page.$$('.admin-case-row');
  console.log('Found', rows.length, 'case rows');
  if (rows.length) {
    await rows[0].click();
    await page.waitForSelector('.pill-banner', { timeout: 5000 });
    await shot(page, '02-case-detail');
  }

  console.log('Back link...');
  await page.click('.back-link');
  await page.waitForSelector('.page-title');
  await shot(page, '03-back-to-list');

  console.log('\n--- JS ERRORS ---');
  console.log(errors.length ? errors.join('\n') : 'None');

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((err) => { console.error('TEST FAILED:', err); process.exit(1); });
