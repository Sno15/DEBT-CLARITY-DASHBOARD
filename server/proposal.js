'use strict';

// Generates a "Draft Case Summary" — a standalone, printable HTML document
// compiling everything collected on a case into the shape an adviser needs
// as the starting point for a formal proposal (statement of affairs,
// creditor schedule, assets, proposed solution).
//
// Deliberately NOT a finished, submission-ready legal proposal: the actual
// wording, conditions, and figures put to creditors need to be prepared and
// signed off by a licensed insolvency practitioner / authorised adviser.
// This just does the data-compilation legwork and says so clearly in the
// document itself.

const path = require('path');
const { escapeHtml } = require('./util');
const { INCOME_GROUPS, EXPENDITURE_GROUPS, SOLUTIONS, currency } = require(
  path.join(__dirname, '..', 'public', 'js', 'config.js'),
);
const { FIRM_NAME } = require('./firm-config');

function fullName(personal) {
  if (!personal) return 'Unnamed client';
  return [personal.title, personal.first_name, personal.middle_name, personal.last_name]
    .filter(Boolean).join(' ') || 'Unnamed client';
}

function formatDob(personal) {
  if (!personal || !personal.dob_day || !personal.dob_month || !personal.dob_year) return 'Not provided';
  return `${personal.dob_day}/${personal.dob_month}/${personal.dob_year}`;
}

function currentAddress(addresses) {
  return (addresses || []).find((a) => a.is_current) || (addresses || [])[0] || null;
}

function formatAddress(a) {
  if (!a) return 'Not provided';
  return [a.building_number, a.address_line1, a.address_line2, a.town_city, a.county, a.postcode]
    .filter(Boolean).map(escapeHtml).join(', ');
}

function incomeExpenditureRows(groups, data) {
  const rows = [];
  groups.forEach((g) => {
    g.items.forEach((item) => {
      const val = Number((data || {})[item.key]) || 0;
      if (val > 0) rows.push({ group: g.group, label: item.label, value: val });
    });
  });
  return rows;
}

function tableRows(rows) {
  if (!rows.length) return '<tr><td colspan="3" class="muted">None entered</td></tr>';
  return rows.map((r) => `
    <tr>
      <td>${escapeHtml(r.group)}</td>
      <td>${escapeHtml(r.label)}</td>
      <td class="num">${currency(r.value)}</td>
    </tr>
  `).join('');
}

function generateProposalHtml(bundle) {
  const { case: kase, personal, addresses, employment, creditors, properties, vehicles,
    bankAccounts, assets, flags, incomeData, expenditureData, solution, completion } = bundle;

  const addr = currentAddress(addresses);
  const currentEmployment = (employment || []).find((e) => e.is_current) || (employment || [])[0] || null;
  const incomeRows = incomeExpenditureRows(INCOME_GROUPS, incomeData);
  const expenditureRows = incomeExpenditureRows(EXPENDITURE_GROUPS, expenditureData);
  const chosenSolution = solution ? SOLUTIONS.find((s) => s.key === solution.solutionType) : null;

  const propertyRows = (properties || []).map((p) => {
    const equity = (Number(p.value) || 0) - (Number(p.mortgage_balance) || 0);
    return `
      <tr>
        <td>${escapeHtml(p.address)}</td>
        <td>${escapeHtml(p.property_type)}</td>
        <td class="num">${currency(p.value)}</td>
        <td class="num">${currency(p.mortgage_balance)}</td>
        <td class="num">${currency(equity)}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="5" class="muted">None recorded</td></tr>';

  const vehicleRows = (vehicles || []).map((v) => `
    <tr>
      <td>${escapeHtml(v.make)} ${escapeHtml(v.model)} (${escapeHtml(v.year)})</td>
      <td class="num">${currency(v.value)}</td>
      <td class="num">${currency(v.finance_balance)}</td>
    </tr>
  `).join('') || '<tr><td colspan="3" class="muted">None recorded</td></tr>';

  const assetRows = (assets || []).map((a) => `
    <tr><td>${escapeHtml(a.description)}</td><td class="num">${currency(a.estimated_value)}</td></tr>
  `).join('') || '<tr><td colspan="2" class="muted">None recorded</td></tr>';

  const bankRows = (bankAccounts || []).map((b) => `
    <tr>
      <td>${escapeHtml(b.bank_name)}</td>
      <td>${escapeHtml(b.account_type)}</td>
      <td>${escapeHtml(b.ownership)}</td>
      <td class="num">${currency(b.balance)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="muted">None recorded</td></tr>';

  const creditorRows = (creditors || []).map((c) => `
    <tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.type)}</td>
      <td class="num">${currency(c.balance)}</td>
      <td class="num">${currency(c.monthly_repayment)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="muted">None recorded</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Draft Case Summary — ${escapeHtml(kase ? kase.reference : '')}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1f2933; max-width: 860px; margin: 0 auto; padding: 40px 24px 80px; line-height: 1.5; }
  h1 { font-size: 22px; margin-bottom: 2px; }
  h2 { font-size: 16px; border-bottom: 2px solid #0d7d78; padding-bottom: 6px; margin-top: 36px; }
  .sub { color: #5b6670; font-size: 13px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #e4ded2; }
  th { background: #f7f5f0; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; color: #5b6670; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #9aa1a7; font-style: italic; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 14px; margin-top: 10px; }
  .grid .k { color: #5b6670; }
  .totals-line { display: flex; justify-content: space-between; font-weight: 700; padding: 10px; background: #e3f3f1; border-radius: 6px; margin-top: 10px; }
  .disclaimer { margin-top: 44px; padding: 16px 20px; background: #fbf3d9; border-radius: 8px; font-size: 12px; color: #7a5b00; line-height: 1.6; }
  .toolbar { text-align: right; margin-bottom: 20px; }
  .toolbar button { font-size: 14px; padding: 8px 18px; border-radius: 6px; border: 1px solid #0d7d78; background: #0d7d78; color: white; cursor: pointer; }
  @media print { .toolbar { display: none; } body { padding: 0 10px; } }
</style>
</head>
<body>
  <div class="toolbar no-print"><button onclick="window.print()">Print / Save as PDF</button></div>

  <h1>Draft Case Summary</h1>
  <div class="sub">
    ${escapeHtml(FIRM_NAME)} · Case reference ${escapeHtml(kase ? kase.reference : 'N/A')} · Generated ${escapeHtml(new Date().toLocaleDateString('en-GB'))}
  </div>

  <h2>Personal &amp; Contact Details</h2>
  <div class="grid">
    <div><span class="k">Name:</span> ${escapeHtml(fullName(personal))}</div>
    <div><span class="k">Date of birth:</span> ${escapeHtml(formatDob(personal))}</div>
    <div><span class="k">Marital status:</span> ${escapeHtml(personal ? personal.marital_status : '') || 'Not provided'}</div>
    <div><span class="k">Mobile:</span> ${escapeHtml(personal ? personal.mobile : '') || 'Not provided'}</div>
    <div><span class="k">Email:</span> ${escapeHtml(personal ? personal.email : '') || 'Not provided'}</div>
    <div><span class="k">Address:</span> ${formatAddress(addr)}</div>
  </div>

  <h2>Employment</h2>
  <div class="grid">
    <div><span class="k">Status:</span> ${escapeHtml((flags && flags.employment_status) || 'Not provided')}</div>
    <div><span class="k">Employer:</span> ${escapeHtml(currentEmployment ? currentEmployment.employer_name : '') || 'N/A'}</div>
    <div><span class="k">Job title:</span> ${escapeHtml(currentEmployment ? currentEmployment.job_title : '') || 'N/A'}</div>
    <div><span class="k">Type:</span> ${escapeHtml(currentEmployment ? currentEmployment.employment_type : '') || 'N/A'}</div>
  </div>

  <h2>Statement of Affairs — Income</h2>
  <table>
    <thead><tr><th>Category</th><th>Item</th><th class="num">Monthly Amount</th></tr></thead>
    <tbody>${tableRows(incomeRows)}</tbody>
  </table>
  <div class="totals-line"><span>Total Monthly Income</span><span>${currency(completion.incomeTotal)}</span></div>

  <h2>Statement of Affairs — Expenditure</h2>
  <table>
    <thead><tr><th>Category</th><th>Item</th><th class="num">Monthly Amount</th></tr></thead>
    <tbody>${tableRows(expenditureRows)}</tbody>
  </table>
  <div class="totals-line"><span>Total Monthly Expenditure</span><span>${currency(completion.expenditureTotal)}</span></div>
  <div class="totals-line"><span>Net Disposable Income</span><span>${currency(completion.netMonthly)}</span></div>

  <h2>Creditors</h2>
  <table>
    <thead><tr><th>Creditor</th><th>Type</th><th class="num">Balance</th><th class="num">Current Monthly Payment</th></tr></thead>
    <tbody>${creditorRows}</tbody>
  </table>
  <div class="totals-line"><span>Total Debt</span><span>${currency(completion.totalDebt)}</span></div>

  <h2>Property</h2>
  <table>
    <thead><tr><th>Address</th><th>Type</th><th class="num">Value</th><th class="num">Mortgage Balance</th><th class="num">Equity</th></tr></thead>
    <tbody>${propertyRows}</tbody>
  </table>

  <h2>Vehicles</h2>
  <table>
    <thead><tr><th>Vehicle</th><th class="num">Value</th><th class="num">Finance Balance</th></tr></thead>
    <tbody>${vehicleRows}</tbody>
  </table>

  <h2>Other Assets</h2>
  <table>
    <thead><tr><th>Description</th><th class="num">Estimated Value</th></tr></thead>
    <tbody>${assetRows}</tbody>
  </table>

  <h2>Bank Accounts</h2>
  <table>
    <thead><tr><th>Bank</th><th>Type</th><th>Ownership</th><th class="num">Balance</th></tr></thead>
    <tbody>${bankRows}</tbody>
  </table>

  <h2>Proposed Solution</h2>
  ${chosenSolution ? `
    <p><strong>${escapeHtml(chosenSolution.name)}</strong></p>
    <p>${escapeHtml(chosenSolution.desc)}</p>
    <p>Based on the figures above, disposable income of ${currency(completion.netMonthly)}/month would form the basis of any proposed monthly contribution — subject to the adviser's review of income and expenditure for reasonableness.</p>
  ` : '<p class="muted">No solution has been selected on this case yet.</p>'}

  <div class="disclaimer">
    <strong>Draft document — not a formal proposal.</strong> This case summary was compiled automatically from
    information the client entered into Debt Clarity. It is intended solely as a starting point for
    ${escapeHtml(FIRM_NAME)}'s adviser to prepare a formal insolvency proposal, statement of affairs, or
    equivalent document — it is not itself a legal proposal, has not been independently verified, and must not
    be issued to creditors or relied upon until it has been reviewed, checked against supporting documents, and
    finalised by a licensed insolvency practitioner or authorised adviser.
  </div>
</body>
</html>`;
}

module.exports = { generateProposalHtml, FIRM_NAME };
