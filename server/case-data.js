'use strict';

const db = require('./db');
const { monthsBetween } = require('./util');
const { listResource } = require('./resources');
const { encryptString, decryptString } = require('./security');

// Personal-details columns sensitive enough to encrypt at rest (National
// Insurance number, date of birth, phone numbers). Name/title/marital
// status are left in plaintext since the admin case list and search rely
// on being able to read them without a full decrypt pass.
const ENCRYPTED_PERSONAL_FIELDS = ['ni_number', 'dob_day', 'dob_month', 'dob_year', 'mobile', 'landline'];

function decryptPersonalRow(row) {
  if (!row) return row;
  const out = { ...row };
  ENCRYPTED_PERSONAL_FIELDS.forEach((f) => { out[f] = decryptString(out[f]); });
  return out;
}

function getCaseByUser(userId) {
  return db.prepare('SELECT * FROM cases WHERE user_id = ? ORDER BY created_at ASC LIMIT 1').get(userId);
}

function getCaseById(caseId) {
  return db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
}

function ensureMeta(caseId) {
  let meta = db.prepare('SELECT * FROM case_meta WHERE case_id = ?').get(caseId);
  if (!meta) {
    db.prepare('INSERT INTO case_meta (case_id) VALUES (?)').run(caseId);
    meta = db.prepare('SELECT * FROM case_meta WHERE case_id = ?').get(caseId);
  }
  return meta;
}

function getPersonal(caseId) {
  const row = db.prepare('SELECT * FROM personal WHERE case_id = ?').get(caseId) || null;
  return decryptPersonalRow(row);
}

function upsertPersonal(caseId, body) {
  const existing = getPersonal(caseId); // already decrypted, used as plaintext fallback below
  const fields = [
    'title', 'gender', 'first_name', 'middle_name', 'last_name',
    'used_different_name', 'previous_first_name', 'previous_last_name',
    'dob_day', 'dob_month', 'dob_year', 'marital_status', 'ni_number',
    'mobile', 'landline', 'email',
  ];
  const values = fields.map((f) => {
    let v = body[f] !== undefined ? body[f] : (existing ? existing[f] : null);
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (ENCRYPTED_PERSONAL_FIELDS.includes(f)) v = encryptString(v);
    return v;
  });
  if (existing) {
    db.prepare(`UPDATE personal SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE case_id = ?`)
      .run(...values, caseId);
  } else {
    db.prepare(`INSERT INTO personal (case_id, ${fields.join(', ')}) VALUES (?, ${fields.map(() => '?').join(', ')})`)
      .run(caseId, ...values);
  }
  return getPersonal(caseId);
}

function getIncomeExpenditure(caseId) {
  const meta = ensureMeta(caseId);
  return {
    incomeData: meta.income_data ? JSON.parse(meta.income_data) : {},
    expenditureData: meta.expenditure_data ? JSON.parse(meta.expenditure_data) : {},
  };
}

function setIncomeExpenditure(caseId, incomeData, expenditureData) {
  ensureMeta(caseId);
  db.prepare('UPDATE case_meta SET income_data = ?, expenditure_data = ? WHERE case_id = ?')
    .run(JSON.stringify(incomeData || {}), JSON.stringify(expenditureData || {}), caseId);
  return getIncomeExpenditure(caseId);
}

function getFlags(caseId) {
  const meta = ensureMeta(caseId);
  return {
    employment_status: meta.employment_status || null,
    no_dependants: !!meta.no_dependants,
    no_property: !!meta.no_property,
    no_vehicles: !!meta.no_vehicles,
    no_insurance: !!meta.no_insurance,
    no_assets: !!meta.no_assets,
  };
}

function setFlags(caseId, flags) {
  ensureMeta(caseId);
  const allowed = ['employment_status', 'no_dependants', 'no_property', 'no_vehicles', 'no_insurance', 'no_assets'];
  const current = getFlags(caseId);
  const merged = { ...current, ...flags };
  db.prepare(`UPDATE case_meta SET employment_status = ?, no_dependants = ?, no_property = ?, no_vehicles = ?, no_insurance = ?, no_assets = ? WHERE case_id = ?`)
    .run(
      merged.employment_status,
      merged.no_dependants ? 1 : 0,
      merged.no_property ? 1 : 0,
      merged.no_vehicles ? 1 : 0,
      merged.no_insurance ? 1 : 0,
      merged.no_assets ? 1 : 0,
      caseId,
    );
  return getFlags(caseId);
}

function getSolution(caseId) {
  const meta = ensureMeta(caseId);
  return meta.solution_type ? { solutionType: meta.solution_type, chosenAt: meta.solution_chosen_at } : null;
}

function setSolution(caseId, solutionType) {
  ensureMeta(caseId);
  db.prepare('UPDATE case_meta SET solution_type = ?, solution_chosen_at = ? WHERE case_id = ?')
    .run(solutionType, new Date().toISOString(), caseId);
  return getSolution(caseId);
}

function getDocuments(caseId) {
  return db.prepare('SELECT id, doc_type, original_name, mime_type, size, uploaded_at FROM documents WHERE case_id = ? ORDER BY uploaded_at DESC').all(caseId);
}

const REQUIRED_DOCUMENT_TYPES = [
  { key: 'mobile_bills', label: "Last 3 months' mobile phone bills" },
  { key: 'photo_id', label: 'Photo ID' },
  { key: 'bank_statements', label: 'Bank statements' },
];

function addressYearsCovered(addresses) {
  // Sum full months across all address entries as a rough "years covered" figure.
  const now = new Date();
  let totalMonths = 0;
  for (const a of addresses) {
    if (!a.month_moved_in || !a.year_moved_in) continue;
    const endMonth = a.is_current
      ? now.toLocaleString('en-GB', { month: 'long' })
      : (a.end_month || a.month_moved_in);
    const endYear = a.is_current ? String(now.getFullYear()) : (a.end_year || a.year_moved_in);
    totalMonths += Math.max(0, monthsBetween(a.month_moved_in, a.year_moved_in, endMonth, endYear));
  }
  return totalMonths / 12;
}

function employmentYearsCovered(employmentRows) {
  const now = new Date();
  let totalMonths = 0;
  for (const e of employmentRows) {
    if (!e.start_month || !e.start_year) continue;
    const endMonth = e.is_current ? now.toLocaleString('en-GB', { month: 'long' }) : (e.end_month || e.start_month);
    const endYear = e.is_current ? String(now.getFullYear()) : (e.end_year || e.start_year);
    totalMonths += Math.max(0, monthsBetween(e.start_month, e.start_year, endMonth, endYear));
  }
  return totalMonths / 12;
}

function computeCompletion(caseId) {
  const personal = getPersonal(caseId);
  const addresses = listResource('addresses', caseId);
  const employmentRows = listResource('employment', caseId);
  const dependants = listResource('dependants', caseId);
  const creditors = listResource('creditors', caseId);
  const properties = listResource('properties', caseId);
  const vehicles = listResource('vehicles', caseId);
  const bankAccounts = listResource('bank-accounts', caseId);
  const insurance = listResource('insurance-policies', caseId);
  const assets = listResource('assets', caseId);
  const flags = getFlags(caseId);
  const { incomeData, expenditureData } = getIncomeExpenditure(caseId);
  const solution = getSolution(caseId);
  const documents = getDocuments(caseId);

  const personalComplete = !!(
    personal && personal.first_name && personal.last_name &&
    personal.dob_day && personal.dob_month && personal.dob_year &&
    personal.marital_status && personal.ni_number && personal.mobile
  );

  const currentAddress = addresses.find((a) => a.is_current) || addresses[0];
  const addressComplete = !!(
    currentAddress && currentAddress.postcode && currentAddress.address_line1 &&
    currentAddress.town_city && currentAddress.living_status &&
    currentAddress.month_moved_in && currentAddress.year_moved_in
  );

  const employmentComplete = !!(flags.employment_status) &&
    (flags.employment_status === 'Unemployed' || flags.employment_status === 'Retired' || employmentRows.length > 0);

  const dependantsComplete = flags.no_dependants || dependants.length > 0;

  const incomeTotal = Object.values(incomeData || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const expenditureTotal = Object.values(expenditureData || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const incomeExpenditureComplete = incomeTotal > 0 || expenditureTotal > 0;

  const creditorsComplete = creditors.length > 0;
  const propertyComplete = flags.no_property || properties.length > 0;
  const vehiclesComplete = flags.no_vehicles || vehicles.length > 0;
  const bankAccountsComplete = bankAccounts.length > 0;
  const insuranceComplete = flags.no_insurance || insurance.length > 0;
  const assetsComplete = flags.no_assets || assets.length > 0;

  const sections = {
    personal: personalComplete,
    address: addressComplete,
    employment: employmentComplete,
    dependants: dependantsComplete,
    incomeExpenditure: incomeExpenditureComplete,
    creditors: creditorsComplete,
    property: propertyComplete,
    vehicles: vehiclesComplete,
    bankAccounts: bankAccountsComplete,
    insurance: insuranceComplete,
    assets: assetsComplete,
  };

  const sectionCount = Object.keys(sections).length;
  const completedCount = Object.values(sections).filter(Boolean).length;
  const stage1Complete = completedCount === sectionCount;

  const stage2Complete = !!solution;

  const uploadedTypes = new Set(documents.map((d) => d.doc_type));
  const requiredDocsComplete = REQUIRED_DOCUMENT_TYPES.every((d) => uploadedTypes.has(d.key));
  const stage3Complete = requiredDocsComplete;

  return {
    sections,
    sectionCount,
    completedCount,
    stage1Complete,
    stage2Complete,
    stage3Complete,
    addressYearsCovered: addressYearsCovered(addresses),
    employmentYearsCovered: employmentYearsCovered(employmentRows),
    incomeTotal,
    expenditureTotal,
    netMonthly: incomeTotal - expenditureTotal,
    totalDebt: creditors.reduce((s, c) => s + (Number(c.balance) || 0), 0),
    totalMonthlyRepayments: creditors.reduce((s, c) => s + (Number(c.monthly_repayment) || 0), 0),
    uploadedDocTypes: [...uploadedTypes],
  };
}

function getCaseOwner(caseId) {
  return db.prepare(`
    SELECT users.id, users.name, users.email, users.role FROM users
    JOIN cases ON cases.user_id = users.id
    WHERE cases.id = ?
  `).get(caseId);
}

function listAllCasesForAdmin() {
  // Excludes any case belonging to an admin account — admins shouldn't have
  // a case of their own (create-admin.js cleans these up at promotion time),
  // but this filter is a second line of defence in case one ever lingers.
  const rows = db.prepare(`
    SELECT cases.id AS case_id, cases.reference, cases.created_at, cases.updated_at,
           users.name AS owner_name, users.email AS owner_email
    FROM cases
    JOIN users ON users.id = cases.user_id
    WHERE users.role != 'admin'
    ORDER BY cases.created_at DESC
  `).all();

  return rows.map((row) => {
    const completion = computeCompletion(row.case_id);
    return {
      caseId: row.case_id,
      reference: row.reference,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ownerName: row.owner_name,
      ownerEmail: row.owner_email,
      completion,
    };
  });
}

function getFullCase(caseId) {
  const kase = getCaseById(caseId);
  const owner = getCaseOwner(caseId);
  const personal = getPersonal(caseId);
  const addresses = listResource('addresses', caseId);
  const employment = listResource('employment', caseId);
  const dependants = listResource('dependants', caseId);
  const creditors = listResource('creditors', caseId);
  const properties = listResource('properties', caseId);
  const vehicles = listResource('vehicles', caseId);
  const bankAccounts = listResource('bank-accounts', caseId);
  const insurance = listResource('insurance-policies', caseId);
  const assets = listResource('assets', caseId);
  const flags = getFlags(caseId);
  const { incomeData, expenditureData } = getIncomeExpenditure(caseId);
  const solution = getSolution(caseId);
  const documents = getDocuments(caseId);
  const completion = computeCompletion(caseId);

  return {
    case: kase,
    owner,
    personal,
    addresses,
    employment,
    dependants,
    creditors,
    properties,
    vehicles,
    bankAccounts,
    insurance,
    assets,
    flags,
    incomeData,
    expenditureData,
    solution,
    documents,
    requiredDocumentTypes: REQUIRED_DOCUMENT_TYPES,
    completion,
  };
}

// ---------- GDPR erasure ----------
// Returns the stored filenames for a case's documents (call BEFORE deleting,
// since the caller needs these to remove the actual files from disk — the DB
// rows themselves cascade-delete automatically via the cases FK).
function getStoredDocumentNames(caseId) {
  return db.prepare('SELECT stored_name FROM documents WHERE case_id = ?').all(caseId).map((d) => d.stored_name);
}

function deleteCaseCompletely(caseId) {
  db.prepare('DELETE FROM cases WHERE id = ?').run(caseId);
}

function deleteUserAccount(userId) {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

module.exports = {
  getCaseByUser,
  getCaseById,
  ensureMeta,
  getPersonal,
  upsertPersonal,
  getIncomeExpenditure,
  setIncomeExpenditure,
  getFlags,
  setFlags,
  getSolution,
  setSolution,
  getDocuments,
  computeCompletion,
  getFullCase,
  getCaseOwner,
  listAllCasesForAdmin,
  getStoredDocumentNames,
  deleteCaseCompletely,
  deleteUserAccount,
  REQUIRED_DOCUMENT_TYPES,
};
