'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots-assistant');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
async function shot(page, name) { await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true }); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGE ERROR: ' + e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CONSOLE ERROR: ' + msg.text()); });

  console.log('Log in as client...');
  await page.goto('http://localhost:3000/');
  await page.fill('#f-email', 'janebot@example.com');
  await page.fill('#f-password', 'password123');
  await page.click('button[type=submit]');
  await page.waitForSelector('.assistant-fab', { timeout: 5000 });
  await shot(page, '01-dashboard-with-fab');

  console.log('Open the assistant widget...');
  await page.click('#assistant-toggle-btn');
  await page.waitForSelector('.assistant-panel', { timeout: 5000 });
  await shot(page, '02-panel-open');

  console.log('Ask a routine question...');
  await page.fill('#assistant-input', 'how do I upload a bank statement');
  await page.click('#assistant-send-btn');
  await page.waitForFunction(() => document.querySelectorAll('.assistant-msg-assistant').length >= 1, { timeout: 10000 });
  await shot(page, '03-after-routine-reply');

  console.log('Ask a boundary question...');
  await page.fill('#assistant-input', 'which solution should i pick, iva or dro');
  await page.click('#assistant-send-btn');
  await page.waitForFunction(() => document.querySelectorAll('.assistant-msg-assistant').length >= 2, { timeout: 10000 });
  await shot(page, '04-after-boundary-reply');

  const messagesText = await page.locator('#assistant-messages').innerText();
  console.log('--- Chat transcript ---');
  console.log(messagesText);

  console.log('Navigate to another page, confirm widget/history persists...');
  await page.click('a[href="#overview"]');
  await page.waitForTimeout(300);
  const stillOpen = await page.locator('.assistant-panel').count();
  console.log('Panel still present after navigation:', stillOpen > 0);
  await shot(page, '05-after-navigation');

  console.log('\n--- JS ERRORS ---');
  console.log(errors.length ? errors.join('\n') : 'None');

  await browser.close();
  console.log('\nDone. Screenshots in test/screenshots-assistant/');
})();
