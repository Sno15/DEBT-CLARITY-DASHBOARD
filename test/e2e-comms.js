'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots-comms');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
async function shot(page, name) { await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true }); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGE ERROR: ' + e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CONSOLE ERROR: ' + msg.text()); });

  console.log('Log in as admin...');
  await page.goto('http://localhost:3000/');
  await page.fill('#f-email', 'owner@phoenixinsolvency.co.uk');
  await page.fill('#f-password', 'ownerpass123');
  await page.click('button[type=submit]');
  await page.waitForSelector('.page-title', { timeout: 5000 });

  console.log('Open the client case...');
  await page.click('.admin-case-row');
  await page.waitForSelector('.pill-banner', { timeout: 5000 });
  await page.locator('text=Client Communication').scrollIntoViewIfNeeded();
  await shot(page, '01-case-detail-with-comms-card');

  console.log('Send thank-you email...');
  await page.click('#admin-send-thankyou-btn');
  await page.waitForSelector('#toast.show', { timeout: 5000 });
  await page.waitForTimeout(600);
  await page.locator('text=Client Communication').scrollIntoViewIfNeeded();
  await shot(page, '02-after-thankyou-send');

  console.log('Send reminder email...');
  await page.click('#admin-send-reminder-btn');
  await page.waitForSelector('#toast.show', { timeout: 5000 });
  await page.waitForTimeout(600);
  await page.locator('text=Client Communication').scrollIntoViewIfNeeded();
  await shot(page, '03-after-reminder-send');

  const historyText = await page.locator('#admin-emails-section').innerText();
  console.log('--- Email history section text ---');
  console.log(historyText);

  console.log('\n--- JS ERRORS ---');
  console.log(errors.length ? errors.join('\n') : 'None');

  await browser.close();
  console.log('\nDone. Screenshots in test/screenshots-comms/');
})();
