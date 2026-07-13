'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function shot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGE ERROR: ' + e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('CONSOLE ERROR: ' + msg.text()); });

  const email = `test${Date.now()}@example.com`;

  console.log('Register...');
  await page.goto('http://localhost:3000/');
  await page.fill('#f-email', email);
  await page.fill('#f-password', 'password123');
  // switch to register mode first
  await page.click('#switch-mode');
  await page.fill('#f-name', 'Sarah Test');
  await page.fill('#f-email', email);
  await page.fill('#f-password', 'password123');
  await page.click('button[type=submit]');
  await page.waitForSelector('.overview-card', { timeout: 5000 });
  await shot(page, '01-overview-empty');

  console.log('Personal...');
  await page.click('a[href="#personal"]');
  await page.waitForSelector('#p-first');
  await page.selectOption('#p-title', 'Ms');
  await page.fill('#p-first', 'Sarah');
  await page.fill('#p-last', 'Test');
  await page.fill('#p-dob-day', '01');
  await page.fill('#p-dob-month', '01');
  await page.fill('#p-dob-year', '1990');
  await page.selectOption('#p-marital', 'Single');
  await page.fill('#p-ni', 'AB123456C');
  await page.fill('#p-mobile', '07700900000');
  await page.locator('#p-mobile').blur();
  await page.waitForTimeout(400);
  await shot(page, '02-personal-filled');

  console.log('Address...');
  await page.click('a[href="#address"]');
  await page.waitForSelector('#a-postcode');
  await page.fill('#a-postcode', 'G4 0LF');
  await page.fill('#a-building', '15');
  await page.fill('#a-line1', '15 Argyle Street');
  await page.fill('#a-city', 'Glasgow');
  await page.fill('#a-county', 'Glasgow City');
  await page.selectOption('#a-living', 'Renting (Private)');
  await page.selectOption('#a-month', 'January');
  await page.fill('#a-year', '2010');
  await page.locator('#a-year').blur();
  await page.waitForTimeout(400);
  await shot(page, '03-address-filled');

  console.log('Employment...');
  await page.click('a[href="#employment"]');
  await page.waitForSelector('#e-status');
  await page.selectOption('#e-status', 'Employed');
  await page.waitForTimeout(400);
  await page.click('#add-employment-btn');
  await page.waitForSelector('#mf-employer_name');
  await page.fill('#mf-employer_name', 'Acme Ltd');
  await page.fill('#mf-job_title', 'Assistant');
  await page.selectOption('#mf-employment_type', 'Full-time');
  await page.selectOption('#mf-start_month', 'January');
  await page.fill('#mf-start_year', '2015');
  await page.click('.modal-card button[type=submit]');
  await page.waitForTimeout(400);
  await shot(page, '04-employment-filled');

  console.log('Dependants (none)...');
  await page.click('a[href="#dependants"]');
  await page.waitForSelector('#none-flag-dependants');
  await page.check('#none-flag-dependants');
  await page.waitForTimeout(400);
  await shot(page, '05-dependants-none');

  console.log('Income & Spending...');
  await page.click('a[href="#income-spending"]');
  await page.waitForSelector('.ie-input');
  const salaryInput = page.locator('.ie-input[data-key="salary"]');
  await salaryInput.fill('1000');
  await salaryInput.blur();
  await page.waitForTimeout(400);
  await page.click('#tab-expenses');
  await page.waitForTimeout(200);
  const rentInput = page.locator('.ie-input[data-key="rent"]');
  await rentInput.fill('800');
  await rentInput.blur();
  await page.waitForTimeout(400);
  await shot(page, '06-income-expenditure');

  console.log('Creditors...');
  await page.click('a[href="#creditors"]');
  await page.waitForSelector('.res-add');
  await page.click('.res-add');
  await page.waitForSelector('#mf-name');
  await page.fill('#mf-name', 'Loans 2 go');
  await page.selectOption('#mf-type', 'Consolidated Debt');
  await page.fill('#mf-balance', '10000');
  await page.click('.modal-card button[type=submit]');
  await page.waitForTimeout(400);
  await shot(page, '07-creditors');

  console.log('Property (none)...');
  await page.click('a[href="#property"]');
  await page.waitForSelector('#none-flag-properties');
  await page.check('#none-flag-properties');
  await page.waitForTimeout(300);

  console.log('Vehicles (none)...');
  await page.click('a[href="#vehicles"]');
  await page.waitForSelector('#none-flag-vehicles');
  await page.check('#none-flag-vehicles');
  await page.waitForTimeout(300);

  console.log('Bank accounts...');
  await page.click('a[href="#bank-accounts"]');
  await page.waitForSelector('.res-add');
  await page.click('.res-add');
  await page.waitForSelector('#mf-bank_name');
  await page.fill('#mf-bank_name', 'Monzo');
  await page.selectOption('#mf-account_type', 'Current Account');
  await page.fill('#mf-sort_code', '000000');
  await page.fill('#mf-account_number', '12345678');
  await page.selectOption('#mf-ownership', 'Me only');
  await page.click('.modal-card button[type=submit]');
  await page.waitForTimeout(400);
  await shot(page, '08-bank-accounts');

  console.log('Insurance (none)...');
  await page.click('a[href="#insurance"]');
  await page.waitForSelector('#none-flag-insurance-policies');
  await page.check('#none-flag-insurance-policies');
  await page.waitForTimeout(300);

  console.log('Assets (none)...');
  await page.click('a[href="#assets"]');
  await page.waitForSelector('#none-flag-assets');
  await page.check('#none-flag-assets');
  await page.waitForTimeout(300);

  console.log('Overview after stage 1...');
  await page.click('a[href="#overview"]');
  await page.waitForTimeout(300);
  await shot(page, '09-overview-stage1-complete');

  console.log('Choose solution...');
  await page.click('a[href="#choose-solution"]');
  await page.waitForSelector('.solution-card');
  await page.click('.solution-card[data-solution="iva"]');
  await page.waitForTimeout(400);
  await shot(page, '10-choose-solution');

  console.log('Documents...');
  await page.click('a[href="#documents"]');
  await page.waitForSelector('.upload-box');
  const testFile = path.join(__dirname, 'fixtures', 'sample.pdf');
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  fs.writeFileSync(testFile, '%PDF-1.4 test file content for e2e testing');
  const inputs = await page.$$('.doc-file-input');
  for (const input of inputs) {
    await input.setInputFiles(testFile);
    await page.waitForTimeout(500);
  }
  await shot(page, '11-documents-uploaded');

  console.log('Final overview (all complete)...');
  await page.click('a[href="#overview"]');
  await page.waitForTimeout(300);
  await shot(page, '12-overview-all-complete');

  console.log('Reload to verify persistence...');
  await page.reload();
  await page.waitForSelector('.overview-card');
  await shot(page, '13-overview-after-reload');

  console.log('Logout / login roundtrip...');
  await page.click('#logout-btn');
  await page.waitForSelector('#auth-form');
  await page.fill('#f-email', email);
  await page.fill('#f-password', 'password123');
  await page.click('button[type=submit]');
  await page.waitForSelector('.overview-card');
  await shot(page, '14-after-relogin');

  console.log('\n--- JS ERRORS ---');
  console.log(errors.length ? errors.join('\n') : 'None');

  await browser.close();
  console.log('\nDone. Screenshots in test/screenshots/');
  process.exit(errors.length ? 1 : 0);
})().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
